"use client";

import {
  DEFAULT_CONFIG,
  DEFAULT_DRAWING_DEFAULTS,
  DEFAULT_WATCHLIST,
  useChartStore,
} from "@/lib/store/chart-store";
import { UNKNOWN_WATCHLIST_ACCOUNT_ERROR, useSyncStore } from "@/lib/store/sync-store";
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
import { DEFAULT_SECTION_ID, flattenWatchlist, normalizeWatchlistSections, type WatchlistSection } from "@/lib/store/watchlist-sections";

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
let syncGeneration = 0;
let verifiedToken: string | null = null;
let verifiedEmail: string | null = null;
let unsubscribeStore: (() => void) | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
/** Evita que aplicar un documento remoto dispare un push de vuelta (eco) */
let applyingRemote = false;
let lastPullAt = 0;
/** Serializa pulls y pushes para que no se pisen entre sí */
let queue: Promise<void> = Promise.resolve();

function enqueue(op: () => Promise<unknown>): void {
  const generation = syncGeneration;
  queue = queue.then(async () => {
    if (generation === syncGeneration) await op();
  }).catch(() => {
    // Cada operación reporta su propio error vía sync-store
  });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function buildSnapshot(): SyncedState {
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
    watchlistSections: s.watchlistSections,
    priceLines: s.priceLines,
    drawings: s.drawings,
    drawingDefaults: s.drawingDefaults,
    scripts: s.scripts,
  };
}

function makeDocument(): DriveSyncDocument {
  return { version: 2, updatedAt: Date.now(), state: buildSnapshot() };
}

function currentSession(generation: number, email: string | null): boolean {
  const sync = useSyncStore.getState();
  return started && generation === syncGeneration && sync.enabled && sync.email === email;
}

function watchlistKey(sections: WatchlistSection[]): string {
  return JSON.stringify(sections);
}

function watchlistPending(): boolean {
  const sync = useSyncStore.getState();
  return sync.watchlistDirty || (sync.watchlistBaseline !== null
    && sync.watchlistBaseline !== watchlistKey(useChartStore.getState().watchlistSections));
}

function hasLocalCustomization(sections: WatchlistSection[]): boolean {
  return watchlistKey(sections) !== watchlistKey([
    { id: DEFAULT_SECTION_ID, name: "Main", symbols: [...DEFAULT_WATCHLIST] },
  ]);
}

function hasUnknownWatchlistAccount(): boolean {
  const sync = useSyncStore.getState();
  return sync.syncedEmail === null && sync.email === null && (
    sync.fileId !== null || sync.lastSyncedAt > 0 || sync.bootstrapped ||
    sync.watchlistBaseline !== null || sync.watchlistDirty ||
    hasLocalCustomization(useChartStore.getState().watchlistSections)
  );
}

/** On upgrade without a baseline, preserve local order and add remote-only data. */
function mergeLegacyWatchlists(local: WatchlistSection[], remote: WatchlistSection[]): WatchlistSection[] {
  const seen = new Set(flattenWatchlist(local));
  const merged = local.map((section) => ({ ...section, symbols: [...section.symbols] }));
  for (const section of remote) {
    const missing = section.symbols.filter((symbol) => !seen.has(symbol));
    missing.forEach((symbol) => seen.add(symbol));
    const target = merged.find((candidate) => candidate.id === section.id);
    if (target) target.symbols.push(...missing);
    else merged.push({ ...section, symbols: missing });
  }
  return merged;
}

/**
 * Normaliza un documento descargado al formato v2. Los documentos v1 (sin
 * `scripts`) se migran en lectura añadiendo `scripts: []` — last-write-wins
 * por documento completo, así que no se pierde nada del resto del estado.
 */
export function migrateDocument(doc: DriveSyncDocument): DriveSyncDocument {
  const watchlistSections = normalizeWatchlistSections(doc.state?.watchlistSections, doc.state?.watchlist);
  return {
    ...doc,
    version: 2,
    state: {
      ...doc.state,
      scripts: Array.isArray(doc.state?.scripts) ? doc.state.scripts : [],
      watchlistSections,
      watchlist: flattenWatchlist(watchlistSections),
    },
  };
}

/**
 * Aplica un documento remoto al store. Con `full` (primera vez en el
 * dispositivo) se aplica toda la configuración; si no, solo los campos
 * de sincronización continua.
 */
export function applyRemote(doc: DriveSyncDocument, full: boolean): void {
  const remote = doc.state;
  const current = useChartStore.getState();
  const watchlistSections = normalizeWatchlistSections(remote.watchlistSections, remote.watchlist);
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
  // A newer remote document must not erase local offline edits awaiting upload.
  if (!watchlistPending()) {
    patch.watchlistSections = watchlistSections;
    patch.watchlist = flattenWatchlist(watchlistSections);
  }
  if (full) {
    patch.theme = remote.theme ?? current.theme;
    patch.initialZoom = remote.initialZoom ?? current.initialZoom;
    patch.logScale = remote.logScale ?? current.logScale;
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

async function verifyTokenAccount(token: string): Promise<boolean> {
  const sync = useSyncStore.getState();
  const expected = sync.syncedEmail ?? sync.email;
  if (expected && verifiedToken === token && verifiedEmail === expected) return true;
  const actual = await fetchUserEmail(token);
  if (expected && actual === expected) {
    verifiedToken = token;
    verifiedEmail = actual;
    return true;
  }
  verifiedToken = null;
  verifiedEmail = null;
  clearStoredToken();
  sync.setStatus("reauth", actual
    ? "La cuenta del token de Google no coincide con la cuenta sincronizada. Reconecta la cuenta original."
    : "No se pudo verificar la cuenta de Google. Reconecta para continuar.");
  return false;
}

/**
 * Ejecuta `op` con un token válido; si Drive rechaza el token (revocado
 * antes de expirar) lo descarta y, en modo manual, reintenta una vez con
 * un token nuevo.
 */
async function withAuthRetry(mode: SyncMode, op: (token: string) => Promise<void>): Promise<boolean> {
  let token: string;
  try {
    token = await getTokenFor(mode);
  } catch (err) {
    useSyncStore.getState().setStatus("reauth", errorMessage(err));
    return false;
  }
  if (!(await verifyTokenAccount(token))) return false;
  try {
    await op(token);
    return true;
  } catch (err) {
    if (!(err instanceof DriveAuthError)) {
      handleSyncError(err);
      return false;
    }
  }
  clearStoredToken();
  verifiedToken = null;
  verifiedEmail = null;
  if (mode === "background") {
    useSyncStore.getState().setStatus("reauth", "La sesión de Google expiró. Vuelve a conectar.");
    return false;
  }
  try {
    const fresh = await acquireToken();
    if (!(await verifyTokenAccount(fresh))) return false;
    await op(fresh);
    return true;
  } catch (err) {
    handleSyncError(err);
    return false;
  }
}

async function pullOnce(mode: SyncMode = "background", queuePendingPush = true): Promise<boolean> {
  const sync = useSyncStore.getState();
  const generation = syncGeneration;
  if (!currentSession(generation, sync.email)) return false;
  sync.setStatus(sync.bootstrapped ? "syncing" : "loading");
  const succeeded = await withAuthRetry(mode, async (token) => {
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
    if (!currentSession(generation, sync.email)) return;
    if (!doc) {
      // Drive vacío (o archivo borrado/corrupto): el estado local de este
      // dispositivo se convierte en la copia inicial de la cuenta.
      const fresh = makeDocument();
      fileId = await uploadStateDocument(token, fileId, fresh);
      if (!currentSession(generation, sync.email)) return;
      const s = useSyncStore.getState();
      s.setFileId(fileId);
      s.setLastSyncedAt(fresh.updatedAt);
      s.acknowledgeWatchlist(
        watchlistKey(fresh.state.watchlistSections!),
        watchlistKey(useChartStore.getState().watchlistSections),
      );
      s.markBootstrapped();
      return;
    }
    // Migración v1→v2 en lectura (añade scripts:[] si falta).
    doc = migrateDocument(doc);
    const s = useSyncStore.getState();
    s.setFileId(fileId);
    const remoteSections = doc.state.watchlistSections!;
    const localSections = useChartStore.getState().watchlistSections;
    const remoteKey = watchlistKey(remoteSections);
    if (s.watchlistBaseline === null && !watchlistPending()
      && hasLocalCustomization(localSections) && watchlistKey(localSections) !== remoteKey) {
      const merged = mergeLegacyWatchlists(localSections, remoteSections);
      useChartStore.setState({ watchlistSections: merged, watchlist: flattenWatchlist(merged) });
      s.setWatchlistDirty(true);
    }
    if (!s.bootstrapped || s.watchlistBaseline === null) {
      applyRemote(doc, true);
    } else if (doc.updatedAt > s.lastSyncedAt) {
      applyRemote(doc, false);
    }
    s.acknowledgeWatchlist(remoteKey, watchlistKey(useChartStore.getState().watchlistSections));
    s.setLastSyncedAt(Math.max(s.lastSyncedAt, doc.updatedAt));
    s.markBootstrapped();
  });
  if (!succeeded || !currentSession(generation, sync.email)) return false;
  if (watchlistPending()) {
    useSyncStore.getState().setStatus("syncing");
    if (queuePendingPush) enqueue(pushOnce);
  } else {
    useSyncStore.getState().setStatus("synced");
  }
  return true;
}

async function pushOnce(mode: SyncMode = "background"): Promise<void> {
  const sync = useSyncStore.getState();
  const generation = syncGeneration;
  if (!currentSession(generation, sync.email)) return;
  sync.setStatus("syncing");
  const succeeded = await withAuthRetry(mode, async (token) => {
    // A whole-document push must not restore an old watchlist from this device.
    let fileId = useSyncStore.getState().fileId ?? (await findStateFileId(token));
    let remote: DriveSyncDocument | null = null;
    if (fileId) {
      try {
        remote = await downloadStateDocument(token, fileId);
      } catch (err) {
        if (!(err instanceof DriveNotFoundError)) throw err;
        fileId = null;
      }
    }
    if (!currentSession(generation, sync.email)) return;
    if (remote && !watchlistPending()) {
      const sections = migrateDocument(remote).state.watchlistSections!;
      if (!watchlistPending()) {
        if (watchlistKey(useChartStore.getState().watchlistSections) !== watchlistKey(sections)) {
          applyingRemote = true;
          try {
            useChartStore.setState({ watchlistSections: sections, watchlist: flattenWatchlist(sections) });
          } finally {
            applyingRemote = false;
          }
        }
        useSyncStore.getState().acknowledgeWatchlist(
          watchlistKey(sections), watchlistKey(useChartStore.getState().watchlistSections),
        );
      }
    }
    const doc = makeDocument();
    try {
      fileId = await uploadStateDocument(token, fileId, doc);
    } catch (err) {
      if (!(err instanceof DriveNotFoundError)) throw err;
      // El archivo fue borrado desde otro lugar: recrearlo
      fileId = await uploadStateDocument(token, null, doc);
    }
    if (!currentSession(generation, sync.email)) return;
    const s = useSyncStore.getState();
    s.setFileId(fileId);
    s.setLastSyncedAt(doc.updatedAt);
    s.acknowledgeWatchlist(
      watchlistKey(doc.state.watchlistSections!),
      watchlistKey(useChartStore.getState().watchlistSections),
    );
  });
  if (!succeeded || !currentSession(generation, sync.email)) return;
  if (watchlistPending()) {
    useSyncStore.getState().setStatus("syncing");
    enqueue(pushOnce);
  } else {
    useSyncStore.getState().setStatus("synced");
  }
}

function schedulePush(): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    enqueue(pushOnce);
  }, PUSH_DEBOUNCE_MS);
}

export function shouldPushChartChange(state: ChartSnapshot, prev: ChartSnapshot): boolean {
  return (
    state.drawings !== prev.drawings ||
    state.priceLines !== prev.priceLines ||
    state.indicators !== prev.indicators ||
    state.hidden !== prev.hidden ||
    state.drawingsHidden !== prev.drawingsHidden ||
    state.indicatorsHidden !== prev.indicatorsHidden ||
    state.config !== prev.config ||
    state.drawingDefaults !== prev.drawingDefaults ||
    state.scripts !== prev.scripts ||
    state.watchlistSections !== prev.watchlistSections ||
    state.watchlist !== prev.watchlist
  );
}

export function watchlistChanged(state: ChartSnapshot, prev: ChartSnapshot): boolean {
  return state.watchlistSections !== prev.watchlistSections || state.watchlist !== prev.watchlist;
}

function handleStoreChange(state: ChartSnapshot, prev: ChartSnapshot): void {
  if (applyingRemote) return;
  if (shouldPushChartChange(state, prev)) schedulePush();
}

function handleVisibilityChange(): void {
  if (document.visibilityState !== "visible") return;
  if (Date.now() - lastPullAt < MIN_FOCUS_PULL_INTERVAL_MS) return;
  enqueue(pullOnce);
}

function handleOnline(): void {
  // Do not push if the preceding pull failed.
  enqueue(async () => { if (await pullOnce("background", false)) await pushOnce(); });
}

export function startDriveSync(): void {
  if (started || typeof window === "undefined") return;
  if (hasUnknownWatchlistAccount()) {
    useSyncStore.getState().setStatus("error", UNKNOWN_WATCHLIST_ACCOUNT_ERROR);
    return;
  }
  started = true;
  syncGeneration += 1;
  unsubscribeStore = useChartStore.subscribe(handleStoreChange);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("online", handleOnline);
  enqueue(pullOnce);
}

export function stopDriveSync(): void {
  if (!started) return;
  started = false;
  syncGeneration += 1;
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
export async function connectDrive(importUnknownWatchlist = false): Promise<void> {
  const wasEnabled = useSyncStore.getState().enabled;
  const unknownAccount = hasUnknownWatchlistAccount();
  if (unknownAccount && !importUnknownWatchlist) {
    stopDriveSync();
    useSyncStore.getState().setStatus(wasEnabled ? "error" : "off", UNKNOWN_WATCHLIST_ACCOUNT_ERROR);
    return;
  }
  useSyncStore.getState().setStatus("connecting");
  try {
    // Primera conexión: deja elegir cuenta. Reconexión: reutiliza la sesión.
    const token = importUnknownWatchlist && unknownAccount
      ? await acquireToken({ selectAccount: true })
      : getStoredToken() ?? (await acquireToken({ selectAccount: !wasEnabled }));
    const email = await fetchUserEmail(token);
    if (!email) {
      clearStoredToken();
      throw new GoogleAuthError("No se pudo verificar la cuenta de Google. Vuelve a intentar la conexión.");
    }
    const current = useSyncStore.getState();
    const previousEmail = current.syncedEmail ?? current.email;
    const switching = previousEmail !== null && previousEmail !== email;
    if (switching) {
      stopDriveSync();
      if (watchlistPending()) current.setWatchlistDirty(true);
    }
    if (unknownAccount) {
      stopDriveSync();
      // Explicit import is the only path that can assign an unknown local list
      // to a new account. Never reuse a file ID from an unidentified account.
      useSyncStore.setState({ fileId: null, lastSyncedAt: 0, bootstrapped: false,
        watchlistBaseline: null, watchlistDirty: false });
    }
    if (!useSyncStore.getState().connect(email)) {
      clearStoredToken();
      verifiedToken = null;
      verifiedEmail = null;
      return;
    }
    verifiedToken = token;
    verifiedEmail = email;
    if (switching) {
      // Do not carry account A's clean local watchlist into an empty B Drive.
      const watchlistSections = [{ id: DEFAULT_SECTION_ID, name: "Main", symbols: [...DEFAULT_WATCHLIST] }];
      useChartStore.setState({ watchlistSections, watchlist: [...DEFAULT_WATCHLIST] });
      useSyncStore.getState().setWatchlistDirty(false);
    }
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
  verifiedToken = null;
  verifiedEmail = null;
  useSyncStore.getState().disconnect();
}

/** Sincronización manual inmediata (clic del usuario): pull y luego push. */
export function syncNow(): void {
  enqueue(async () => { if (await pullOnce("manual", false)) await pushOnce("manual"); });
}
