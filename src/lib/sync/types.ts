import type {
  DrawingDefaults,
  IndicatorConfig,
  IndicatorKey,
  PriceLine,
  Theme,
} from "@/lib/store/chart-store";
import type { Drawing } from "@/lib/drawings/types";

/**
 * Snapshot del estado que se guarda en Google Drive (appDataFolder).
 * Incluye toda la configuración de la plataforma: la primera vez que un
 * dispositivo se conecta se aplica completa; después solo se aplican los
 * campos de sincronización continua (dibujos, líneas e indicadores).
 */
export interface SyncedState {
  theme: Theme;
  initialZoom: number;
  logScale: boolean;
  indicators: Record<IndicatorKey, boolean>;
  hidden: Record<IndicatorKey, boolean>;
  config: IndicatorConfig;
  watchlist: string[];
  priceLines: PriceLine[];
  drawings: Drawing[];
  drawingDefaults: DrawingDefaults;
}

export interface DriveSyncDocument {
  version: 1;
  /** Epoch ms del momento en que se subió el documento (last-write-wins) */
  updatedAt: number;
  state: SyncedState;
}
