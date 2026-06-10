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

  // Efímero (no persistido)
  status: SyncStatus;
  error: string | null;

  setStatus: (status: SyncStatus, error?: string | null) => void;
  setFileId: (fileId: string | null) => void;
  setLastSyncedAt: (t: number) => void;
  markBootstrapped: () => void;
  connect: (email: string | null) => void;
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
      status: "off",
      error: null,

      setStatus: (status, error = null) => set({ status, error }),
      setFileId: (fileId) => set({ fileId }),
      setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
      markBootstrapped: () => set({ bootstrapped: true }),
      connect: (email) =>
        set({ enabled: true, email, status: "loading", error: null }),
      disconnect: () =>
        set({
          enabled: false,
          email: null,
          fileId: null,
          lastSyncedAt: 0,
          bootstrapped: false,
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
      }),
    },
  ),
);
