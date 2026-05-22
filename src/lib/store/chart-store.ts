"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Timeframe } from "@/lib/binance/types";
import type { Drawing, TrendLineDrawing, RectangleDrawing } from "@/lib/drawings/types";

export type IndicatorKey =
  | "ema20"
  | "ema50"
  | "ema200"
  | "rsi"
  | "macd"
  | "volume"
  | "sqzmom"
  | "adx"
  | "vrvp";

export type DrawingTool = "cursor" | "hline" | "measure" | "trendline" | "rectangle";
export type Theme = "dark" | "light";

export interface PriceLine {
  id: string;
  symbol: string;
  price: number;
  color?: string;
  lineWidth?: 1 | 2 | 3 | 4;
  lineStyle?: number;
  axisLabelVisible?: boolean;
}

export interface IndicatorConfig {
  ema20: number;
  ema50: number;
  ema200: number;
  rsi: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  sqzmomBBLength: number;
  sqzmomBBMult: number;
  sqzmomKCLength: number;
  sqzmomKCMult: number;
  adxLen: number;
  adxDiLen: number;
  adxKeyLevel: number;
  adxStrengthLevel: number;
  // EMA style
  ema20Color: string;
  ema20Width: 1 | 2 | 3 | 4;
  ema20Style: number;
  ema50Color: string;
  ema50Width: 1 | 2 | 3 | 4;
  ema50Style: number;
  ema200Color: string;
  ema200Width: 1 | 2 | 3 | 4;
  ema200Style: number;
  // SQZ style
  sqzmomColorBullUp: string;
  sqzmomColorBullDn: string;
  sqzmomColorBearDn: string;
  sqzmomColorBearUp: string;
  sqzmomColorNoSqz: string;
  sqzmomColorSqzOff: string;
  // ADX style
  adxColorRising: string;
  adxColorFalling: string;
  adxColorKeyLevel: string;
  adxColorStrength: string;
  vrvpRowLayout: "rows" | "ticks";
  vrvpRowSize: number;
  vrvpVolume: "total" | "updown";
  vrvpValueAreaVolume: number;
  vrvpShowProfile: boolean;
  vrvpShowValues: boolean;
  vrvpWidth: number;
  vrvpPlacement: "Left" | "Right";
  vrvpColorUpVol: string;
  vrvpColorDnVol: string;
  vrvpColorUpVolVA: string;
  vrvpColorDnVolVA: string;
  vrvpShowVAH: boolean;
  vrvpShowVAL: boolean;
  vrvpShowPOC: boolean;
  vrvpColorPOC: string;
  vrvpColorVAH: string;
  vrvpColorVAL: string;
  vrvpShowLabels: boolean;
  vrvpShowStatusValues: boolean;
  vrvpShowStatusInputs: boolean;
}

export const DEFAULT_CONFIG: IndicatorConfig = {
  ema20: 10,
  ema50: 55,
  ema200: 200,
  rsi: 14,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  sqzmomBBLength: 20,
  sqzmomBBMult: 2,
  sqzmomKCLength: 20,
  sqzmomKCMult: 1.5,
  adxLen: 14,
  adxDiLen: 14,
  adxKeyLevel: 23,
  adxStrengthLevel: 60,
  ema20Color: "#2962ff",
  ema20Width: 2,
  ema20Style: 0,
  ema50Color: "#ffb74d",
  ema50Width: 2,
  ema50Style: 0,
  ema200Color: "#ab47bc",
  ema200Width: 3,
  ema200Style: 0,
  sqzmomColorBullUp: "#00FF00",
  sqzmomColorBullDn: "#008000",
  sqzmomColorBearDn: "#008eff",
  sqzmomColorBearUp: "#1848cc",
  sqzmomColorNoSqz: "#2962ff",
  sqzmomColorSqzOff: "#787b86",
  adxColorRising: "#008eff",
  adxColorFalling: "#f57f17",
  adxColorKeyLevel: "#13172266",
  adxColorStrength: "#2962ff",
  vrvpRowLayout: "rows",
  vrvpRowSize: 1000,
  vrvpVolume: "total",
  vrvpValueAreaVolume: 100,
  vrvpShowProfile: true,
  vrvpShowValues: false,
  vrvpWidth: 15,
  vrvpPlacement: "Right",
  vrvpColorUpVol: "#2962ff44",
  vrvpColorDnVol: "#ff6d0044",
  vrvpColorUpVolVA: "#2962ffbb",
  vrvpColorDnVolVA: "#ff6d00bb",
  vrvpShowVAH: false,
  vrvpShowVAL: false,
  vrvpShowPOC: true,
  vrvpColorPOC: "#000000",
  vrvpColorVAH: "#787b86",
  vrvpColorVAL: "#787b86",
  vrvpShowLabels: true,
  vrvpShowStatusValues: true,
  vrvpShowStatusInputs: true,
};

export const INDICATOR_COLORS: Record<IndicatorKey, string> = {
  ema20: "#2962ff",
  ema50: "#ffb74d",
  ema200: "#ab47bc",
  rsi: "#ab47bc",
  macd: "#2962ff",
  volume: "#787b86",
  sqzmom: "#ff6d00",
  adx: "#ffffff",
  vrvp: "#2962ff",
};

export const DEFAULT_WATCHLIST = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "MATICUSDT",
];

interface ChartState {
  symbol: string;
  timeframe: Timeframe;
  theme: Theme;
  initialZoom: number;
  /** Indicator is added to the chart (appears in pill + renders unless hidden) */
  indicators: Record<IndicatorKey, boolean>;
  /** Indicator is hidden (eye icon off) — kept in pill list, just not rendered */
  hidden: Record<IndicatorKey, boolean>;
  /** Periods and parameters for each indicator */
  config: IndicatorConfig;
  watchlist: string[];

  // Ephemeral UI state (not persisted)
  tool: DrawingTool;
  priceLines: PriceLine[];
  symbolDialogOpen: boolean;
  /** Which indicator's settings dialog is open (null = closed) */
  settingsTarget: IndicatorKey | null;
  priceLineEditTarget: string | null;
  selectedPriceLineId: string | null;
  drawings: Drawing[];
  drawingEditTarget: string | null;
  selectedDrawingId: string | null;
  /** Shared collapsed state for both ChartLegend and SubPaneLegend */
  legendCollapsed: boolean;
  watchlistCollapsed: boolean;

  // Actions
  setSymbol: (s: string) => void;
  setTimeframe: (t: Timeframe) => void;
  setTheme: (t: Theme) => void;
  setInitialZoom: (z: number) => void;
  toggleIndicator: (key: IndicatorKey) => void;
  removeIndicator: (key: IndicatorKey) => void;
  toggleHidden: (key: IndicatorKey) => void;
  setConfig: (patch: Partial<IndicatorConfig>) => void;
  addToWatchlist: (s: string) => void;
  removeFromWatchlist: (s: string) => void;
  setTool: (t: DrawingTool) => void;
  addPriceLine: (price: number, symbol: string) => void;
  removePriceLine: (id: string) => void;
  updatePriceLine: (id: string, price: number) => void;
  clearPriceLines: (symbol?: string) => void;
  setSymbolDialogOpen: (v: boolean) => void;
  setSettingsTarget: (k: IndicatorKey | null) => void;
  setPriceLineEditTarget: (id: string | null) => void;
  setSelectedPriceLineId: (id: string | null) => void;
  updatePriceLineOptions: (id: string, patch: Partial<Pick<PriceLine, "color" | "lineWidth" | "lineStyle" | "axisLabelVisible">>) => void;
  addDrawing: (d: Drawing) => void;
  removeDrawing: (id: string) => void;
  updateDrawing: (id: string, patch: Partial<Omit<TrendLineDrawing | RectangleDrawing, "id" | "symbol" | "type">>) => void;
  clearDrawings: (symbol?: string) => void;
  setDrawingEditTarget: (id: string | null) => void;
  setSelectedDrawingId: (id: string | null) => void;
  toggleLegendCollapsed: () => void;
  toggleWatchlistCollapsed: () => void;
}

export const useChartStore = create<ChartState>()(
  persist(
    (set) => ({
      symbol: "BTCUSDT",
      timeframe: "1d" as Timeframe,
      theme: "light" as Theme,
      initialZoom: 105,
      indicators: {
        ema20: true,
        ema50: true,
        ema200: false,
        rsi: false,
        macd: false,
        volume: false,
        sqzmom: true,
        adx: true,
        vrvp: true,
      },
      hidden: {
        ema20: false,
        ema50: false,
        ema200: false,
        rsi: false,
        macd: false,
        volume: false,
        sqzmom: false,
        adx: false,
        vrvp: false,
      },
      config: { ...DEFAULT_CONFIG },
      watchlist: DEFAULT_WATCHLIST,
      tool: "cursor",
      priceLines: [],
      symbolDialogOpen: false,
      settingsTarget: null,
      priceLineEditTarget: null,
      selectedPriceLineId: null,
      drawings: [],
      drawingEditTarget: null,
      selectedDrawingId: null,
      legendCollapsed: true,
      watchlistCollapsed: true,

      setSymbol: (symbol) => set({ symbol }),
      setTimeframe: (timeframe) => set({ timeframe }),
      setTheme: (theme) => set({ theme }),
      setInitialZoom: (initialZoom) => set({ initialZoom }),
      toggleIndicator: (key) =>
        set((s) => ({
          indicators: { ...s.indicators, [key]: !s.indicators[key] },
          // When re-adding, ensure not hidden
          hidden: !s.indicators[key]
            ? { ...s.hidden, [key]: false }
            : s.hidden,
        })),
      removeIndicator: (key) =>
        set((s) => ({
          indicators: { ...s.indicators, [key]: false },
          hidden: { ...s.hidden, [key]: false },
        })),
      toggleHidden: (key) =>
        set((s) => ({ hidden: { ...s.hidden, [key]: !s.hidden[key] } })),
      setConfig: (patch) =>
        set((s) => ({ config: { ...s.config, ...patch } })),
      addToWatchlist: (s) =>
        set((state) => ({
          watchlist: state.watchlist.includes(s)
            ? state.watchlist
            : [...state.watchlist, s],
        })),
      removeFromWatchlist: (s) =>
        set((state) => ({
          watchlist: state.watchlist.filter((x) => x !== s),
        })),
      setTool: (tool) => set({ tool }),
      addPriceLine: (price, symbol) =>
        set((state) => ({
          priceLines: [
            ...state.priceLines,
            {
              id:
                typeof crypto !== "undefined" && "randomUUID" in crypto
                  ? crypto.randomUUID()
                  : `${Date.now()}-${Math.random()}`,
              symbol,
              price,
              color: "#2962ff",
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: true,
            },
          ],
        })),
      removePriceLine: (id) =>
        set((state) => ({
          priceLines: state.priceLines.filter((p) => p.id !== id),
        })),
      updatePriceLine: (id, price) =>
        set((state) => ({
          priceLines: state.priceLines.map((p) => p.id === id ? { ...p, price } : p),
        })),
      clearPriceLines: (symbol) =>
        set((state) => ({
          priceLines: symbol
            ? state.priceLines.filter((p) => p.symbol !== symbol)
            : [],
        })),
      setSymbolDialogOpen: (symbolDialogOpen) => set({ symbolDialogOpen }),
      setSettingsTarget: (settingsTarget) => set({ settingsTarget }),
      setPriceLineEditTarget: (priceLineEditTarget) => set({ priceLineEditTarget }),
      setSelectedPriceLineId: (selectedPriceLineId) => set({ selectedPriceLineId }),
      updatePriceLineOptions: (id, patch) =>
        set((state) => ({
          priceLines: state.priceLines.map((p) => p.id === id ? { ...p, ...patch } : p),
        })),
      addDrawing: (d) => set((s) => ({ drawings: [...s.drawings, d] })),
      removeDrawing: (id) => set((s) => ({ drawings: s.drawings.filter((d) => d.id !== id) })),
      updateDrawing: (id, patch) =>
        set((s) => ({
          drawings: s.drawings.map((d) => d.id === id ? { ...d, ...patch } : d),
        })),
      clearDrawings: (symbol) =>
        set((s) => ({
          drawings: symbol ? s.drawings.filter((d) => d.symbol !== symbol) : [],
          selectedDrawingId: null,
          drawingEditTarget: null,
        })),
      setDrawingEditTarget: (drawingEditTarget) => set({ drawingEditTarget }),
      setSelectedDrawingId: (selectedDrawingId) => set({ selectedDrawingId }),
      toggleLegendCollapsed: () => set((s) => ({ legendCollapsed: !s.legendCollapsed })),
      toggleWatchlistCollapsed: () => set((s) => ({ watchlistCollapsed: !s.watchlistCollapsed })),
    }),
    {
      name: "tv-gratis-chart-state",
      partialize: (s) => ({
        symbol: s.symbol,
        timeframe: s.timeframe,
        theme: s.theme,
        initialZoom: s.initialZoom,
        indicators: s.indicators,
        hidden: s.hidden,
        config: s.config,
        watchlist: s.watchlist,
        priceLines: s.priceLines,
        drawings: s.drawings,
        legendCollapsed: s.legendCollapsed,
        watchlistCollapsed: s.watchlistCollapsed,
      }),
      /**
       * Deep-merge persisted state into the current (default) state so that
       * any new fields added after the user's first save always get their
       * default values instead of coming back as `undefined`.
       */
      merge: (persisted, current) => {
        const p = persisted as Partial<typeof current>;
        return {
          ...current,
          ...p,
          // Spread DEFAULT_CONFIG first so new keys are never undefined
          config: { ...DEFAULT_CONFIG, ...(p.config ?? {}) },
          // Same for indicator flags — new keys default to `false`
          indicators: { ...current.indicators, ...(p.indicators ?? {}) },
          hidden: { ...current.hidden, ...(p.hidden ?? {}) },
        };
      },
    },
  ),
);
