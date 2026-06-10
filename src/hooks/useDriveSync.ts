"use client";

import { useEffect } from "react";
import { useSyncStore } from "@/lib/store/sync-store";
import { startDriveSync, stopDriveSync } from "@/lib/sync/drive-sync";

/**
 * Arranca el motor de sincronización con Google Drive cuando el usuario
 * tiene la sincronización habilitada (persistido en sync-store). Si nunca
 * conectó su cuenta, no hace nada y la app sigue funcionando 100% local.
 */
export function useDriveSync(): void {
  const enabled = useSyncStore((s) => s.enabled);

  useEffect(() => {
    if (!enabled) return;
    startDriveSync();
    return () => stopDriveSync();
  }, [enabled]);
}
