"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SyncStatus =
  | "off" // sin cuenta conectada
  | "connecting" // abriendo el popup de Google
  | "loading" // primera descarga completa desde Drive
  | "syncing" // subiendo/bajando cambios
  | "synced" // todo al día
  | "reauth" // la sesión de Google expiró: requiere reconectar manualmente
  | "error";

export const UNKNOWN_WATCHLIST_ACCOUNT_ERROR =
  "No podemos identificar a qué cuenta pertenece esta lista local. Para conservarla, elige explícitamente una cuenta e impórtala; no se subirá automáticamente.";

interface SyncState {
  /** El usuario activó la sincronización con Google Drive (opt-in) */
  enabled: boolean;
  email: string | null;
  /** id del archivo de estado dentro de appDataFolder */
  fileId: string | null;
  /** `updatedAt` del último documento subido o aplicado (last-write-wins) */
  lastSyncedAt: number;
  /** La configuración completa ya se descargó una vez en este dispositivo */
  bootstrapped: boolean;
  /** Local watchlist edits not yet acknowledged by a successful Drive upload. */
  watchlistDirty: boolean;
  /** Last watchlist acknowledged by Drive, including section names and order. */
  watchlistBaseline: string | null;
  /** Account owning the persisted Drive file and watchlist baseline. */
  syncedEmail: string | null;

  // Efímero (no persistido)
  status: SyncStatus;
  error: string | null;

  setStatus: (status: SyncStatus, error?: string | null) => void;
  setFileId: (fileId: string | null) => void;
  setLastSyncedAt: (t: number) => void;
  markBootstrapped: () => void;
  setWatchlistDirty: (dirty: boolean) => void;
  acknowledgeWatchlist: (baseline: string, current: string) => void;
  /** Refuses a different account while its predecessor has pending edits. */
  connect: (email: string | null) => boolean;
  disconnect: () => void;
}

export const useSyncStore = create<SyncState>()(
  persist(
    (set) => ({
      enabled: false,
      email: null,
      fileId: null,
      lastSyncedAt: 0,
      bootstrapped: false,
      watchlistDirty: false,
      watchlistBaseline: null,
      syncedEmail: null,
      status: "off",
      error: null,

      setStatus: (status, error = null) => set({ status, error }),
      setFileId: (fileId) => set({ fileId }),
      setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
      markBootstrapped: () => set({ bootstrapped: true }),
      setWatchlistDirty: (watchlistDirty) => set({ watchlistDirty }),
      acknowledgeWatchlist: (watchlistBaseline, current) =>
        set({ watchlistBaseline, watchlistDirty: current !== watchlistBaseline }),
      connect: (email) => {
        let accepted = true;
        set((state) => {
          // Older persisted states have `email` but not `syncedEmail`.
          const previousEmail = state.syncedEmail ?? state.email;
          const switching = previousEmail !== null && previousEmail !== email;
          if (switching && state.watchlistDirty) {
            accepted = false;
            return {
              enabled: false,
              email: null,
              syncedEmail: previousEmail,
              status: "off",
              error: "Hay cambios pendientes de la lista en la cuenta anterior. Reconecta esa cuenta para subirlos antes de cambiar.",
            };
          }
          return {
            enabled: true,
            email,
            syncedEmail: email,
            // A file ID and watchlist baseline must never cross accounts.
            fileId: switching ? null : state.fileId,
            lastSyncedAt: switching ? 0 : state.lastSyncedAt,
            bootstrapped: switching ? false : state.bootstrapped,
            watchlistBaseline: switching ? null : state.watchlistBaseline,
            watchlistDirty: switching ? false : state.watchlistDirty,
            status: "loading",
            error: null,
          };
        });
        return accepted;
      },
      disconnect: () =>
        set({
          enabled: false,
          email: null,
          // Keep the baseline and pending edits so offline changes survive reconnect.
          status: "off",
          error: null,
        }),
    }),
    {
      name: "tv-gratis-sync",
      partialize: (s) => ({
        enabled: s.enabled,
        email: s.email,
        fileId: s.fileId,
        lastSyncedAt: s.lastSyncedAt,
        bootstrapped: s.bootstrapped,
        watchlistDirty: s.watchlistDirty,
        watchlistBaseline: s.watchlistBaseline,
        syncedEmail: s.syncedEmail,
      }),
    },
  ),
);
