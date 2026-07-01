"use client";

import {
  DEFAULT_CONFIG,
  DEFAULT_DRAWING_DEFAULTS,
  useChartStore,
} from "@/lib/store/chart-store";
import { useSyncStore } from "@/lib/store/sync-store";
import {
  DriveAuthError,
  DriveNotFoundError,
  downloadStateDocument,
  findStateFileId,
  uploadStateDocument,
} from "./drive-client";
import {
  GoogleAuthError,
  acquireToken,
  clearStoredToken,
  fetchUserEmail,
  getStoredToken,
  revokeAccess,
} from "./google-auth";
import type { DriveSyncDocument, SyncedState } from "./types";

/**
 * Motor de sincronización con Google Drive (singleton a nivel de módulo).
 *
 * Estrategia local-first:
 * - La app siempre arranca con el estado de localStorage (zustand/persist).
 * - Al iniciar (si el usuario conectó su cuenta) se hace un pull asíncrono:
 *   la primera vez en un dispositivo se aplica TODA la configuración; en
 *   adelante solo los campos de sincronización continua (dibujos, líneas
 *   de precio e indicadores) cuando el documento remoto es más reciente.
 * - Cada cambio local en esos campos se sube con debounce. El documento
 *   subido incluye el snapshot completo, así un dispositivo nuevo siempre
 *   recibe la configuración íntegra.
 * - Resolución de conflictos: last-write-wins por `updatedAt`.
 */

const PUSH_DEBOUNCE_MS = 2500;
const MIN_FOCUS_PULL_INTERVAL_MS = 30_000;

type ChartSnapshot = ReturnType<typeof useChartStore.getState>;

let started = false;
let unsubscribeStore: (() => void) | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
/** Evita que aplicar un documento remoto dispare un push de vuelta (eco) */
let applyingRemote = false;
let lastPullAt = 0;
/** Serializa pulls y pushes para que no se pisen entre sí */
let queue: Promise<void> = Promise.resolve();

function enqueue(op: () => Promise<void>): void {
  queue = queue.then(op).catch(() => {
    // Cada operación reporta su propio error vía sync-store
  });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function buildSnapshot(): SyncedState {
  const s = useChartStore.getState();
  return {
    theme: s.theme,
    initialZoom: s.initialZoom,
    logScale: s.logScale,
    indicators: s.indicators,
    hidden: s.hidden,
    drawingsHidden: s.drawingsHidden,
    indicatorsHidden: s.indicatorsHidden,
    config: s.config,
    watchlist: s.watchlist,
    priceLines: s.priceLines,
    drawings: s.drawings,
    drawingDefaults: s.drawingDefaults,
    scripts: s.scripts,
  };
}

function makeDocument(): DriveSyncDocument {
  return { version: 2, updatedAt: Date.now(), state: buildSnapshot() };
}

/**
 * Normaliza un documento descargado al formato v2. Los documentos v1 (sin
 * `scripts`) se migran en lectura añadiendo `scripts: []` — last-write-wins
 * por documento completo, así que no se pierde nada del resto del estado.
 */
function migrateDocument(doc: DriveSyncDocument): DriveSyncDocument {
  // `scripts` ausente (o no array) ⇒ documento v1 ⇒ migrar a v2.
  if (Array.isArray(doc.state?.scripts)) return doc;
  return {
    ...doc,
    version: 2,
    state: { ...doc.state, scripts: [] },
  };
}

/**
 * Aplica un documento remoto al store. Con `full` (primera vez en el
 * dispositivo) se aplica toda la configuración; si no, solo los campos
 * de sincronización continua.
 */
function applyRemote(doc: DriveSyncDocument, full: boolean): void {
  const remote = doc.state;
  const current = useChartStore.getState();
  const patch: Partial<ChartSnapshot> = {
    drawings: remote.drawings ?? [],
    priceLines: remote.priceLines ?? [],
    indicators: { ...current.indicators, ...remote.indicators },
    hidden: { ...current.hidden, ...remote.hidden },
    // Docs antiguos sin estos campos: preservar el valor local
    drawingsHidden: remote.drawingsHidden ?? current.drawingsHidden,
    indicatorsHidden: remote.indicatorsHidden ?? current.indicatorsHidden,
    config: { ...DEFAULT_CONFIG, ...remote.config },
    // Scripts Pine: last-write-wins del array completo (igual que drawings).
    scripts: remote.scripts ?? [],
  };
  if (full) {
    patch.theme = remote.theme ?? current.theme;
    patch.initialZoom = remote.initialZoom ?? current.initialZoom;
    patch.logScale = remote.logScale ?? current.logScale;
    patch.watchlist = remote.watchlist ?? current.watchlist;
    patch.drawingDefaults = {
      trendline: { ...DEFAULT_DRAWING_DEFAULTS.trendline, ...remote.drawingDefaults?.trendline },
      rectangle: { ...DEFAULT_DRAWING_DEFAULTS.rectangle, ...remote.drawingDefaults?.rectangle },
      hline: { ...DEFAULT_DRAWING_DEFAULTS.hline, ...remote.drawingDefaults?.hline },
    };
  }
  applyingRemote = true;
  try {
    useChartStore.setState(patch);
  } finally {
    applyingRemote = false;
  }
}

function handleSyncError(err: unknown): void {
  const s = useSyncStore.getState();
  if (err instanceof DriveAuthError || err instanceof GoogleAuthError) {
    clearStoredToken();
    s.setStatus("reauth", "La sesión de Google expiró. Vuelve a conectar.");
  } else {
    s.setStatus("error", errorMessage(err));
  }
}

/**
 * "background": solo usa el token ya almacenado — nunca abre popup (los
 * navegadores bloquean popups sin gesto del usuario). Si expiró, pasa a
 * estado "reauth" para que el usuario reconecte con un clic.
 * "manual": viene de un clic (Conectar/Sincronizar ahora), así que puede
 * pedir un token nuevo a GIS si hace falta.
 */
type SyncMode = "background" | "manual";

async function getTokenFor(mode: SyncMode): Promise<string> {
  const stored = getStoredToken();
  if (stored) return stored;
  if (mode === "background") {
    throw new GoogleAuthError("La sesión de Google expiró. Vuelve a conectar.");
  }
  return acquireToken();
}

/**
 * Ejecuta `op` con un token válido; si Drive rechaza el token (revocado
 * antes de expirar) lo descarta y, en modo manual, reintenta una vez con
 * un token nuevo.
 */
async function withAuthRetry(mode: SyncMode, op: (token: string) => Promise<void>): Promise<void> {
  let token: string;
  try {
    token = await getTokenFor(mode);
  } catch (err) {
    useSyncStore.getState().setStatus("reauth", errorMessage(err));
    return;
  }
  try {
    await op(token);
    return;
  } catch (err) {
    if (!(err instanceof DriveAuthError)) {
      handleSyncError(err);
      return;
    }
  }
  clearStoredToken();
  if (mode === "background") {
    useSyncStore.getState().setStatus("reauth", "La sesión de Google expiró. Vuelve a conectar.");
    return;
  }
  try {
    const fresh = await acquireToken();
    await op(fresh);
  } catch (err) {
    handleSyncError(err);
  }
}

async function pullOnce(mode: SyncMode = "background"): Promise<void> {
  const sync = useSyncStore.getState();
  if (!sync.enabled) return;
  sync.setStatus(sync.bootstrapped ? "syncing" : "loading");
  await withAuthRetry(mode, async (token) => {
    lastPullAt = Date.now();
    let fileId = useSyncStore.getState().fileId ?? (await findStateFileId(token));
    let doc: DriveSyncDocument | null = null;
    if (fileId) {
      try {
        doc = await downloadStateDocument(token, fileId);
      } catch (err) {
        if (!(err instanceof DriveNotFoundError)) throw err;
        fileId = null;
      }
    }
    if (!doc) {
      // Drive vacío (o archivo borrado/corrupto): el estado local de este
      // dispositivo se convierte en la copia inicial de la cuenta.
      const fresh = makeDocument();
      fileId = await uploadStateDocument(token, fileId, fresh);
      const s = useSyncStore.getState();
      s.setFileId(fileId);
      s.setLastSyncedAt(fresh.updatedAt);
      s.markBootstrapped();
      s.setStatus("synced");
      return;
    }
    // Migración v1→v2 en lectura (añade scripts:[] si falta).
    doc = migrateDocument(doc);
    const s = useSyncStore.getState();
    s.setFileId(fileId);
    if (!s.bootstrapped) {
      applyRemote(doc, true);
    } else if (doc.updatedAt > s.lastSyncedAt) {
      applyRemote(doc, false);
    }
    s.setLastSyncedAt(Math.max(s.lastSyncedAt, doc.updatedAt));
    s.markBootstrapped();
    s.setStatus("synced");
  });
}

async function pushOnce(mode: SyncMode = "background"): Promise<void> {
  const sync = useSyncStore.getState();
  if (!sync.enabled) return;
  sync.setStatus("syncing");
  await withAuthRetry(mode, async (token) => {
    const doc = makeDocument();
    let fileId: string;
    try {
      fileId = await uploadStateDocument(token, useSyncStore.getState().fileId, doc);
    } catch (err) {
      if (!(err instanceof DriveNotFoundError)) throw err;
      // El archivo fue borrado desde otro lugar: recrearlo
      fileId = await uploadStateDocument(token, null, doc);
    }
    const s = useSyncStore.getState();
    s.setFileId(fileId);
    s.setLastSyncedAt(doc.updatedAt);
    s.setStatus("synced");
  });
}

function schedulePush(): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    enqueue(pushOnce);
  }, PUSH_DEBOUNCE_MS);
}

function handleStoreChange(state: ChartSnapshot, prev: ChartSnapshot): void {
  if (applyingRemote) return;
  const changed =
    state.drawings !== prev.drawings ||
    state.priceLines !== prev.priceLines ||
    state.indicators !== prev.indicators ||
    state.hidden !== prev.hidden ||
    state.drawingsHidden !== prev.drawingsHidden ||
    state.indicatorsHidden !== prev.indicatorsHidden ||
    state.config !== prev.config ||
    state.drawingDefaults !== prev.drawingDefaults ||
    state.scripts !== prev.scripts;
  if (changed) schedulePush();
}

function handleVisibilityChange(): void {
  if (document.visibilityState !== "visible") return;
  if (Date.now() - lastPullAt < MIN_FOCUS_PULL_INTERVAL_MS) return;
  enqueue(pullOnce);
}

function handleOnline(): void {
  // Al recuperar conexión: baja lo más reciente y sube el estado local
  enqueue(pullOnce);
  enqueue(pushOnce);
}

export function startDriveSync(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  unsubscribeStore = useChartStore.subscribe(handleStoreChange);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("online", handleOnline);
  enqueue(pullOnce);
}

export function stopDriveSync(): void {
  if (!started) return;
  started = false;
  unsubscribeStore?.();
  unsubscribeStore = null;
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  window.removeEventListener("online", handleOnline);
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
}

/** Conexión iniciada por el usuario (gesto de clic: el popup no se bloquea). */
export async function connectDrive(): Promise<void> {
  const wasEnabled = useSyncStore.getState().enabled;
  useSyncStore.getState().setStatus("connecting");
  try {
    // Primera conexión: deja elegir cuenta. Reconexión: reutiliza la sesión.
    const token = getStoredToken() ?? (await acquireToken({ selectAccount: !wasEnabled }));
    const email = await fetchUserEmail(token);
    useSyncStore.getState().connect(email);
    if (started) enqueue(pullOnce);
    else startDriveSync();
  } catch (err) {
    const s = useSyncStore.getState();
    s.setStatus(s.enabled ? "reauth" : "off", errorMessage(err));
  }
}

/** Desactiva la sincronización y revoca el acceso. Los datos locales se conservan. */
export function disconnectDrive(): void {
  stopDriveSync();
  revokeAccess();
  useSyncStore.getState().disconnect();
}

/** Sincronización manual inmediata (clic del usuario): pull y luego push. */
export function syncNow(): void {
  enqueue(() => pullOnce("manual"));
  enqueue(() => pushOnce("manual"));
}
