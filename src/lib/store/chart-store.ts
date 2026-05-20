"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Timeframe } from "@/lib/binance/types";

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

export type DrawingTool = "cursor" | "hline" | "measure" | "eraser";

export interface PriceLine {
  id: string;
  symbol: string;
  price: number;
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
  ema20: 20,
  ema50: 50,
  ema200: 200,
  rsi: 14,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  sqzmomBBLength: 20,
  sqzmomBBMult: 2.0,
  sqzmomKCLength: 20,
  sqzmomKCMult: 1.5,
  adxLen: 14,
  adxDiLen: 14,
  adxKeyLevel: 23,
  adxStrengthLevel: 60,
  vrvpRowLayout: "rows",
  vrvpRowSize: 24,
  vrvpVolume: "total",
  vrvpValueAreaVolume: 70,
  vrvpShowProfile: true,
  vrvpShowValues: false,
  vrvpWidth: 20,
  vrvpPlacement: "Right",
  vrvpColorUpVol: "#2962ff44",
  vrvpColorDnVol: "#ff6d0044",
  vrvpColorUpVolVA: "#2962ffbb",
  vrvpColorDnVolVA: "#ff6d00bb",
  vrvpShowVAH: false,
  vrvpShowVAL: false,
  vrvpShowPOC: true,
  vrvpColorPOC: "#455a64",
  vrvpColorVAH: "#787b86",
  vrvpColorVAL: "#787b86",
  vrvpShowLabels: true,
  vrvpShowStatusValues: true,
  vrvpShowStatusInputs: true,
};

export const INDICATOR_COLORS: Record<IndicatorKey, string> = {
  ema20: "#ffb74d",
  ema50: "#2962ff",
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

  // Actions
  setSymbol: (s: string) => void;
  setTimeframe: (t: Timeframe) => void;
  toggleIndicator: (key: IndicatorKey) => void;
  removeIndicator: (key: IndicatorKey) => void;
  toggleHidden: (key: IndicatorKey) => void;
  setConfig: (patch: Partial<IndicatorConfig>) => void;
  addToWatchlist: (s: string) => void;
  removeFromWatchlist: (s: string) => void;
  setTool: (t: DrawingTool) => void;
  addPriceLine: (price: number, symbol: string) => void;
  clearPriceLines: (symbol?: string) => void;
  setSymbolDialogOpen: (v: boolean) => void;
  setSettingsTarget: (k: IndicatorKey | null) => void;
}

export const useChartStore = create<ChartState>()(
  persist(
    (set) => ({
      symbol: "BTCUSDT",
      timeframe: "15m" as Timeframe,
      indicators: {
        ema20: true,
        ema50: true,
        ema200: false,
        rsi: true,
        macd: false,
        volume: true,
        sqzmom: false,
        adx: false,
        vrvp: false,
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

      setSymbol: (symbol) => set({ symbol }),
      setTimeframe: (timeframe) => set({ timeframe }),
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
            },
          ],
        })),
      clearPriceLines: (symbol) =>
        set((state) => ({
          priceLines: symbol
            ? state.priceLines.filter((p) => p.symbol !== symbol)
            : [],
        })),
      setSymbolDialogOpen: (symbolDialogOpen) => set({ symbolDialogOpen }),
      setSettingsTarget: (settingsTarget) => set({ settingsTarget }),
    }),
    {
      name: "tv-gratis-chart-state",
      partialize: (s) => ({
        symbol: s.symbol,
        timeframe: s.timeframe,
        indicators: s.indicators,
        hidden: s.hidden,
        config: s.config,
        watchlist: s.watchlist,
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
          hidden:     { ...current.hidden,     ...(p.hidden     ?? {}) },
        };
      },
    },
  ),
);
