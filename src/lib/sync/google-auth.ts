"use client";

/**
 * Autenticación con Google Identity Services (modelo de token implícito).
 * No requiere backend: el access token se obtiene en el navegador y se
 * guarda en localStorage junto con su expiración (~1 h).
 *
 * GIS no puede renovar tokens sin abrir un popup, y los navegadores
 * bloquean popups que no nacen de un gesto del usuario. Por eso las
 * operaciones en segundo plano usan solo `getStoredToken()`; cuando
 * expira, el motor pasa a "reauth" y la renovación (`acquireToken`)
 * ocurre únicamente al hacer clic en Conectar/Reconectar/Sincronizar.
 */

const GIS_SRC = "https://accounts.google.com/gsi/client";
const SCOPES =
  "https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email";
const TOKEN_STORAGE_KEY = "tv-gratis-gdrive-token";

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GoogleTokenClient {
  requestAccessToken: (config?: { prompt?: string }) => void;
}

interface GoogleOAuth2 {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
    error_callback?: (error: { type?: string; message?: string }) => void;
  }) => GoogleTokenClient;
  revoke: (token: string, callback?: () => void) => void;
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } };
  }
}

export class GoogleAuthError extends Error {}

export function getGoogleClientId(): string | null {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? null;
}

export function isSyncConfigured(): boolean {
  return Boolean(getGoogleClientId());
}

interface StoredToken {
  accessToken: string;
  expiresAt: number;
}

function readStoredToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredToken;
    return typeof parsed.accessToken === "string" && typeof parsed.expiresAt === "number"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function writeStoredToken(token: StoredToken): void {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));
  } catch {
    // localStorage lleno o bloqueado: el token vivirá solo en memoria de GIS
  }
}

export function clearStoredToken(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignorar
  }
}

let gisPromise: Promise<GoogleOAuth2> | null = null;

function loadGis(): Promise<GoogleOAuth2> {
  const existing = window.google?.accounts?.oauth2;
  if (existing) return Promise.resolve(existing);
  if (!gisPromise) {
    gisPromise = new Promise<GoogleOAuth2>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = GIS_SRC;
      script.async = true;
      script.onload = () => {
        const oauth2 = window.google?.accounts?.oauth2;
        if (oauth2) resolve(oauth2);
        else reject(new GoogleAuthError("Google Identity Services no está disponible"));
      };
      script.onerror = () => {
        gisPromise = null;
        reject(new GoogleAuthError("No se pudo cargar Google Identity Services"));
      };
      document.head.appendChild(script);
    });
  }
  return gisPromise;
}

let tokenRequest: Promise<string> | null = null;

async function requestAccessToken(selectAccount: boolean): Promise<string> {
  const clientId = getGoogleClientId();
  if (!clientId) {
    throw new GoogleAuthError("Falta configurar NEXT_PUBLIC_GOOGLE_CLIENT_ID");
  }
  if (tokenRequest) return tokenRequest;
  const oauth2 = await loadGis();
  tokenRequest = new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (res) => {
        if (res.error || !res.access_token) {
          reject(new GoogleAuthError(res.error_description ?? res.error ?? "Autorización rechazada"));
          return;
        }
        writeStoredToken({
          accessToken: res.access_token,
          // 60 s de margen para no usar un token a punto de expirar
          expiresAt: Date.now() + ((res.expires_in ?? 3600) - 60) * 1000,
        });
        resolve(res.access_token);
      },
      error_callback: (err) => {
        reject(new GoogleAuthError(err.message ?? err.type ?? "Error de autenticación"));
      },
    });
    // "" reutiliza la sesión activa sin volver a pedir consentimiento;
    // "select_account" (primera conexión) deja elegir la cuenta.
    client.requestAccessToken({ prompt: selectAccount ? "select_account" : "" });
  }).finally(() => {
    tokenRequest = null;
  });
  return tokenRequest;
}

/** Devuelve el token almacenado si sigue siendo válido. Nunca abre popup. */
export function getStoredToken(): string | null {
  const stored = readStoredToken();
  return stored && stored.expiresAt > Date.now() ? stored.accessToken : null;
}

/**
 * Pide un access token a GIS. Siempre abre un popup, así que solo debe
 * llamarse como resultado de un gesto del usuario (clic); fuera de un
 * gesto el navegador lo bloquea.
 */
export async function acquireToken(opts?: { selectAccount?: boolean }): Promise<string> {
  return requestAccessToken(Boolean(opts?.selectAccount));
}

export async function fetchUserEmail(token: string): Promise<string | null> {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { email?: string };
    return data.email ?? null;
  } catch {
    return null;
  }
}

/** Revoca el acceso concedido y olvida el token local. */
export function revokeAccess(): void {
  const stored = readStoredToken();
  clearStoredToken();
  const oauth2 = window.google?.accounts?.oauth2;
  if (stored && oauth2) oauth2.revoke(stored.accessToken);
}
