"use client";

import { Cloud, CloudAlert, CloudCheck, CloudOff, LogOut, RefreshCw } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSyncStore, type SyncStatus } from "@/lib/store/sync-store";
import { connectDrive, disconnectDrive, syncNow } from "@/lib/sync/drive-sync";
import { isSyncConfigured } from "@/lib/sync/google-auth";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<SyncStatus, string> = {
  off: "Sin conectar",
  connecting: "Conectando…",
  loading: "Cargando datos de Drive…",
  syncing: "Sincronizando…",
  synced: "Sincronizado",
  reauth: "Sesión expirada",
  error: "Error de sincronización",
};

function formatLastSync(t: number): string | null {
  if (!t) return null;
  const mins = Math.round((Date.now() - t) / 60_000);
  if (mins < 1) return "hace un momento";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return new Date(t).toLocaleString();
}

function StatusIcon({ enabled, status, className }: { enabled: boolean; status: SyncStatus; className?: string }) {
  if (!enabled) return <CloudOff className={className} />;
  if (status === "connecting" || status === "loading" || status === "syncing") {
    return <RefreshCw className={cn(className, "animate-spin text-tv-blue")} />;
  }
  if (status === "reauth" || status === "error") {
    return <CloudAlert className={cn(className, "text-amber-500")} />;
  }
  if (status === "synced") return <CloudCheck className={cn(className, "text-tv-blue")} />;
  return <Cloud className={className} />;
}

/** Menú de sincronización con Google Drive para el header de escritorio. */
export function SyncMenu() {
  const enabled = useSyncStore((s) => s.enabled);
  const email = useSyncStore((s) => s.email);
  const status = useSyncStore((s) => s.status);
  const error = useSyncStore((s) => s.error);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const configured = isSyncConfigured();

  const lastSync = formatLastSync(lastSyncedAt);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title="Sincronización con Google Drive"
        className="flex h-7 w-7 items-center justify-center rounded text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
      >
        <StatusIcon enabled={enabled} status={status} className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 bg-tv-panel">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-tv-text-muted">
            Sincronización · Google Drive
          </DropdownMenuLabel>

          {!configured ? (
            <p className="px-1.5 py-1 text-xs text-tv-text-muted">
              Define <code className="text-tv-text">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> en{" "}
              <code className="text-tv-text">.env.local</code> para habilitar la sincronización
              con Google Drive. Mientras tanto, todo se guarda en este dispositivo.
            </p>
          ) : !enabled ? (
            <>
              <p className="px-1.5 py-1 text-xs text-tv-text-muted">
                Guarda tus dibujos, líneas e indicadores en tu cuenta de Google y
                sincronízalos entre dispositivos. Si no conectas, todo sigue
                funcionando en local.
              </p>
              <DropdownMenuItem
                onClick={() => void connectDrive()}
                className="text-xs font-medium text-tv-blue"
              >
                <Cloud className="h-3.5 w-3.5" />
                Conectar con Google
              </DropdownMenuItem>
              {status === "off" && error && (
                <p className="px-1.5 py-1 text-[11px] text-tv-red">{error}</p>
              )}
            </>
          ) : (
            <>
              <div className="px-1.5 py-1">
                <div className="truncate text-xs font-medium text-tv-text">
                  {email ?? "Cuenta de Google"}
                </div>
                <div className="text-[11px] text-tv-text-muted">
                  {STATUS_LABEL[status]}
                  {status === "synced" && lastSync ? ` · ${lastSync}` : ""}
                </div>
                {(status === "error" || status === "reauth") && error && (
                  <div className="mt-0.5 text-[11px] text-amber-500">{error}</div>
                )}
              </div>
              <DropdownMenuSeparator />
              {status === "reauth" ? (
                <DropdownMenuItem
                  onClick={() => void connectDrive()}
                  className="text-xs font-medium text-tv-blue"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Reconectar con Google
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => syncNow()} className="text-xs">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Sincronizar ahora
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                variant="destructive"
                onClick={() => disconnectDrive()}
                className="text-xs"
              >
                <LogOut className="h-3.5 w-3.5" />
                Desconectar (los datos locales se conservan)
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Tarjeta de sincronización para la hoja "Más opciones" del modo móvil. */
export function SyncSheetSection() {
  const enabled = useSyncStore((s) => s.enabled);
  const email = useSyncStore((s) => s.email);
  const status = useSyncStore((s) => s.status);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);

  if (!isSyncConfigured()) return null;

  const lastSync = formatLastSync(lastSyncedAt);

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-tv-bg px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-medium text-tv-text">Google Drive</span>
          <span className="truncate text-[11px] text-tv-text-muted">
            {enabled
              ? `${email ?? "Conectado"} · ${STATUS_LABEL[status]}${
                  status === "synced" && lastSync ? ` · ${lastSync}` : ""
                }`
              : "Sincroniza tus dibujos e indicadores entre dispositivos"}
          </span>
        </div>
        <StatusIcon enabled={enabled} status={status} className="h-4 w-4 shrink-0 text-tv-text-muted" />
      </div>
      {enabled ? (
        <div className="flex gap-2">
          {status === "reauth" ? (
            <button
              onClick={() => void connectDrive()}
              className="flex-1 rounded-lg bg-tv-blue/10 py-1.5 text-xs font-medium text-tv-blue hover:bg-tv-blue/20"
            >
              Reconectar
            </button>
          ) : (
            <button
              onClick={() => syncNow()}
              className="flex-1 rounded-lg bg-tv-blue/10 py-1.5 text-xs font-medium text-tv-blue hover:bg-tv-blue/20"
            >
              Sincronizar ahora
            </button>
          )}
          <button
            onClick={() => disconnectDrive()}
            className="flex-1 rounded-lg bg-tv-red/10 py-1.5 text-xs font-medium text-tv-red hover:bg-tv-red/20"
          >
            Desconectar
          </button>
        </div>
      ) : (
        <button
          onClick={() => void connectDrive()}
          className="rounded-lg bg-tv-blue py-1.5 text-xs font-medium text-white hover:bg-tv-blue/90"
        >
          Conectar con Google
        </button>
      )}
    </div>
  );
}
