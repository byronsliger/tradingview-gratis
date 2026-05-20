"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
  type Time,
  type WhitespaceData,
} from "lightweight-charts";
import { fetchKlines } from "@/lib/binance/rest";
import { getBinanceWS } from "@/lib/binance/ws";
import { ema, rsi, macd, squeezeMomentum, adx, calculateVRVP } from "@/lib/indicators";
import { VRVPSeriesPaneView, type VRVPBarData } from "@/lib/indicators/vrvp-series";
import type { Candle, Timeframe } from "@/lib/binance/types";
import {
  INDICATOR_COLORS,
  useChartStore,
  type IndicatorKey,
} from "@/lib/store/chart-store";
import { formatPrice, formatVolume } from "@/lib/format";
import { IndicatorPill } from "./IndicatorPill";
import { MeasureOverlay } from "./MeasureOverlay";

interface MeasurePoint {
  time: number;
  price: number;
}
interface MeasureState {
  phase: "idle" | "placing" | "done";
  a: MeasurePoint | null;
  b: MeasurePoint | null;
}
const INITIAL_MEASURE: MeasureState = { phase: "idle", a: null, b: null };

function durationLabel(aTime: number, bTime: number): string {
  const diff = Math.abs(bTime - aTime);
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

interface Props {
  symbol: string;
  timeframe: Timeframe;
}

function LegendToggleButton({
  collapsed,
  count,
  onClick,
}: {
  collapsed: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title="Leyenda de los indicadores"
      className="pointer-events-auto group flex h-5 items-center gap-1 rounded border border-transparent px-1.5 text-[10px] text-[#787b86] transition-all hover:border-[#2a2e39] hover:bg-[#1e222d] hover:text-[#d1d4dc] cursor-pointer"
      style={{ position: "relative", zIndex: 30 }}
    >
      <span className="leading-none">{collapsed ? "▼" : "▲"}</span>
      {collapsed && (
        <span className="leading-none tabular-nums">{count}</span>
      )}
      <span className="hidden leading-none group-hover:inline">
        {collapsed ? "Mostrar indicadores" : "Leyenda de los indicadores"}
      </span>
    </button>
  );
}

const TV_COLORS = {
  bg: "#131722",
  panel: "#1e222d",
  border: "#2a2e39",
  text: "#d1d4dc",
  textMuted: "#787b86",
  green: "#26a69a",
  red: "#ef5350",
  blue: "#2962ff",
  yellow: "#ffb74d",
  purple: "#ab47bc",
  grid: "#1e222d",
};

const TV_COLORS_LIGHT = {
  bg: "#ffffff",
  panel: "#f0f3fa",
  border: "#e0e3eb",
  text: "#131722",
  textMuted: "#787b86",
  green: "#26a69a",
  red: "#ef5350",
  blue: "#2962ff",
  yellow: "#f57c00",
  purple: "#ab47bc",
  grid: "#f0f3fa",
};

function getChartColors(theme: "dark" | "light") {
  return theme === "light" ? TV_COLORS_LIGHT : TV_COLORS;
}

interface HoverInfo {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  time: number;
  pct: number;
}

interface LastValues {
  ema20?: number;
  ema50?: number;
  ema200?: number;
  rsi?: number;
  macd?: number;
  macdSignal?: number;
  macdHist?: number;
  volume?: number;
  sqzmom?: number;
  adx?: number;
  plusDI?: number;
  minusDI?: number;
}

interface PaneOffset {
  top: number;
  height: number;
}

export function PriceChart({ symbol, timeframe }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ema20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema200Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsi30Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const rsi70Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const macdRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdSignalRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdHistRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const sqzmomHistRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const sqzmomDotRef = useRef<ISeriesApi<"Line"> | null>(null);
  const adxRef = useRef<ISeriesApi<"Line"> | null>(null);
  const adxKeyLineRef = useRef<IPriceLine | null>(null);
  const adxStrengthLineRef = useRef<IPriceLine | null>(null);
  const candlesRef = useRef<Candle[]>([]);
  const priceLinesMapRef = useRef<Map<string, IPriceLine>>(new Map());
  const vrvpSeriesRef = useRef<ISeriesApi<"Custom", Time, VRVPBarData | WhitespaceData<Time>> | null>(null);

  const indicators = useChartStore((s) => s.indicators);
  const hidden = useChartStore((s) => s.hidden);
  const config = useChartStore((s) => s.config);
  const tool = useChartStore((s) => s.tool);
  const priceLines = useChartStore((s) => s.priceLines);
  const addPriceLine = useChartStore((s) => s.addPriceLine);
  const removeIndicator = useChartStore((s) => s.removeIndicator);
  const toggleHidden = useChartStore((s) => s.toggleHidden);
  const setSettingsTarget = useChartStore((s) => s.setSettingsTarget);
  const theme = useChartStore((s) => s.theme);

  // Refs to avoid recreating subscribeClick on every tool change
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const addPriceLineRef = useRef(addPriceLine);
  addPriceLineRef.current = addPriceLine;
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;
  const configRef = useRef(config);
  configRef.current = config;

  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [lastPrice, setLastPrice] = useState<{ value: number; pct: number } | null>(null);
  const [lastValues, setLastValues] = useState<LastValues>({});
  const [paneOffsets, setPaneOffsets] = useState<PaneOffset[]>([]);
  const [measure, setMeasure] = useState<MeasureState>(INITIAL_MEASURE);
  const [renderTick, setRenderTick] = useState(0);
  const [legendCollapsed, setLegendCollapsed] = useState(true);
  const [subLegendCollapsed, setSubLegendCollapsed] = useState(true);
  const measureRef = useRef(measure);

  // When ADX is active the chart reserves ~60 px for the left price scale.
  // Shift overlays past it so they appear inside the chart content area.
  const leftOffset = indicators.adx ? 72 : 12;
  measureRef.current = measure;

  // Helper — compute pane top offsets from chart layout
  function recomputePaneOffsets() {
    if (!chartRef.current) return;
    const panes = chartRef.current.panes();
    let top = 0;
    const offsets: PaneOffset[] = panes.map((p) => {
      const h = p.getHeight();
      const o = { top, height: h };
      top += h;
      return o;
    });
    setPaneOffsets(offsets);
  }

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: TV_COLORS.bg },
        textColor: TV_COLORS.text,
        fontFamily: "var(--font-sans), Inter, system-ui, sans-serif",
        fontSize: 11,
        panes: { separatorColor: TV_COLORS.border, separatorHoverColor: TV_COLORS.border },
      },
      grid: {
        vertLines: { color: TV_COLORS.grid },
        horzLines: { color: TV_COLORS.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: TV_COLORS.textMuted, width: 1, style: 3, labelBackgroundColor: TV_COLORS.panel },
        horzLine: { color: TV_COLORS.textMuted, width: 1, style: 3, labelBackgroundColor: TV_COLORS.panel },
      },
      rightPriceScale: {
        borderColor: TV_COLORS.border,
        textColor: TV_COLORS.textMuted,
      },
      leftPriceScale: {
        borderColor: TV_COLORS.border,
        textColor: TV_COLORS.textMuted,
        visible: false,
      },
      timeScale: {
        borderColor: TV_COLORS.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 8,
      },
      autoSize: true,
    });

    // PANE 0 — Candles + EMAs
    candleSeriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: TV_COLORS.green,
      downColor: TV_COLORS.red,
      borderUpColor: TV_COLORS.green,
      borderDownColor: TV_COLORS.red,
      wickUpColor: TV_COLORS.green,
      wickDownColor: TV_COLORS.red,
      priceLineColor: TV_COLORS.textMuted,
      priceLineStyle: 2,
    });

    ema20Ref.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.ema20,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    ema50Ref.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.ema50,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    ema200Ref.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.ema200,
      lineWidth: 3,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chartRef.current = chart;

    // Instantiate VRVP Custom Series
    try {
      const vrvpPaneView = new VRVPSeriesPaneView();
      vrvpSeriesRef.current = chart.addCustomSeries(vrvpPaneView, {
        priceLineVisible: false,
        lastValueVisible: false,
      });
    } catch (e) {
      console.error("Failed to add custom VRVP series:", e);
    }

    // Click handler — add horizontal price line when hline tool is active
    chart.subscribeClick((param) => {
      if (!param.point || !candleSeriesRef.current) return;
      const price = candleSeriesRef.current.coordinateToPrice(param.point.y);
      if (price === null || !isFinite(price)) return;

      if (toolRef.current === "hline") {
        addPriceLineRef.current(price, symbolRef.current);
        return;
      }

      if (toolRef.current === "measure") {
        if (!param.time) return;
        const time = Number(param.time);
        const current = measureRef.current;
        if (current.phase === "idle") {
          setMeasure({
            phase: "placing",
            a: { time, price },
            b: { time, price },
          });
        } else if (current.phase === "placing") {
          setMeasure({
            phase: "done",
            a: current.a,
            b: { time, price },
          });
        } else {
          setMeasure({
            phase: "placing",
            a: { time, price },
            b: { time, price },
          });
        }
      }
    });

    // Crosshair handler
    chart.subscribeCrosshairMove((param) => {
      if (
        toolRef.current === "measure" &&
        measureRef.current.phase === "placing" &&
        param.point &&
        param.time &&
        candleSeriesRef.current
      ) {
        const price = candleSeriesRef.current.coordinateToPrice(param.point.y);
        if (price !== null && isFinite(price)) {
          const time = Number(param.time);
          setMeasure((prev) =>
            prev.phase === "placing" ? { ...prev, b: { time, price } } : prev,
          );
        }
      }

      if (!param.time || !candleSeriesRef.current) {
        setHover(null);
        return;
      }
      const data = param.seriesData.get(candleSeriesRef.current);
      const vol = volumeSeriesRef.current
        ? param.seriesData.get(volumeSeriesRef.current)
        : null;
      if (data && "open" in data) {
        const o = data.open as number;
        const c = data.close as number;
        setHover({
          o,
          h: data.high as number,
          l: data.low as number,
          c,
          v: vol && "value" in vol ? (vol.value as number) : 0,
          time: Number(param.time),
          pct: o === 0 ? 0 : ((c - o) / o) * 100,
        });
      }
    });

    // Re-render measure overlay on pan / zoom so pixel coords stay in sync
    const tsRangeHandler = () => setRenderTick((t) => t + 1);
    chart.timeScale().subscribeVisibleTimeRangeChange(tsRangeHandler);
    const logicalRangeHandler = () => {
      setRenderTick((t) => t + 1);
      updateVRVP();
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(logicalRangeHandler);

    // ResizeObserver — recompute pane offsets when chart container resizes
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => recomputePaneOffsets());
    });
    ro.observe(containerRef.current);
    recomputePaneOffsets();

    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(tsRangeHandler);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(logicalRangeHandler);
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      priceLinesMapRef.current.clear();
      ema20Ref.current = null;
      ema50Ref.current = null;
      ema200Ref.current = null;
      rsiRef.current = null;
      rsi30Ref.current = null;
      rsi70Ref.current = null;
      macdRef.current = null;
      macdSignalRef.current = null;
      macdHistRef.current = null;
      sqzmomHistRef.current = null;
      sqzmomDotRef.current = null;
      adxRef.current = null;
      adxKeyLineRef.current = null;
      adxStrengthLineRef.current = null;
      vrvpSeriesRef.current = null;
    };
  }, []);

  // Update chart colors when theme changes
  useEffect(() => {
    if (!chartRef.current) return;
    const c = getChartColors(theme);
    chartRef.current.applyOptions({
      layout: {
        background: { color: c.bg },
        textColor: c.text,
        panes: { separatorColor: c.border, separatorHoverColor: c.border },
      },
      grid: {
        vertLines: { color: c.grid },
        horzLines: { color: c.grid },
      },
      crosshair: {
        vertLine: { color: c.textMuted, labelBackgroundColor: c.panel },
        horzLine: { color: c.textMuted, labelBackgroundColor: c.panel },
      },
      rightPriceScale: { borderColor: c.border, textColor: c.textMuted },
      leftPriceScale: { borderColor: c.border, textColor: c.textMuted },
      timeScale: { borderColor: c.border },
    });
    candleSeriesRef.current?.applyOptions({
      upColor: c.green,
      downColor: c.red,
      borderUpColor: c.green,
      borderDownColor: c.red,
      wickUpColor: c.green,
      wickDownColor: c.red,
      priceLineColor: c.textMuted,
    });
  }, [theme]);

  // Manage volume — overlay at the bottom of the main pane
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.volume && !volumeSeriesRef.current) {
      const v = chartRef.current.addSeries(
        HistogramSeries,
        {
          priceFormat: { type: "volume" },
          priceScaleId: "volume",
          color: TV_COLORS.textMuted,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        0,
      );
      v.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      volumeSeriesRef.current = v;
      const data = candlesRef.current.map((k) => ({
        time: k.time as UTCTimestamp,
        value: k.volume,
        color: k.close >= k.open ? `${TV_COLORS.green}66` : `${TV_COLORS.red}66`,
      }));
      v.setData(data);
    } else if (!indicators.volume && volumeSeriesRef.current && chartRef.current) {
      chartRef.current.removeSeries(volumeSeriesRef.current);
      volumeSeriesRef.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
  }, [indicators.volume]);

  // RSI pane
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.rsi && !rsiRef.current) {
      const paneIndex = 1;
      const r = chartRef.current.addSeries(
        LineSeries,
        {
          color: INDICATOR_COLORS.rsi,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      const r30 = chartRef.current.addSeries(
        LineSeries,
        {
          color: TV_COLORS.textMuted,
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      const r70 = chartRef.current.addSeries(
        LineSeries,
        {
          color: TV_COLORS.textMuted,
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      rsiRef.current = r;
      rsi30Ref.current = r30;
      rsi70Ref.current = r70;
      try {
        chartRef.current.panes()[1]?.setStretchFactor(1);
        chartRef.current.panes()[0]?.setStretchFactor(3);
      } catch { }
      updateRSI();
    } else if (!indicators.rsi && rsiRef.current && chartRef.current) {
      chartRef.current.removeSeries(rsiRef.current);
      if (rsi30Ref.current) chartRef.current.removeSeries(rsi30Ref.current);
      if (rsi70Ref.current) chartRef.current.removeSeries(rsi70Ref.current);
      rsiRef.current = null;
      rsi30Ref.current = null;
      rsi70Ref.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.rsi]);

  // MACD pane
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.macd && !macdRef.current) {
      const paneIndex = indicators.rsi ? 2 : 1;
      const m = chartRef.current.addSeries(
        LineSeries,
        {
          color: INDICATOR_COLORS.macd,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      const s = chartRef.current.addSeries(
        LineSeries,
        {
          color: TV_COLORS.yellow,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      const h = chartRef.current.addSeries(
        HistogramSeries,
        { priceLineVisible: false, lastValueVisible: false },
        paneIndex,
      );
      macdRef.current = m;
      macdSignalRef.current = s;
      macdHistRef.current = h;
      try {
        chartRef.current.panes()[paneIndex]?.setStretchFactor(1);
        chartRef.current.panes()[0]?.setStretchFactor(3);
      } catch { }
      updateMACD();
    } else if (!indicators.macd && macdRef.current && chartRef.current) {
      if (macdRef.current) chartRef.current.removeSeries(macdRef.current);
      if (macdSignalRef.current) chartRef.current.removeSeries(macdSignalRef.current);
      if (macdHistRef.current) chartRef.current.removeSeries(macdHistRef.current);
      macdRef.current = null;
      macdSignalRef.current = null;
      macdHistRef.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.macd, indicators.rsi]);

  // Squeeze Momentum pane
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.sqzmom && !sqzmomHistRef.current) {
      const paneIndex = (indicators.rsi ? 1 : 0) + (indicators.macd ? 1 : 0) + 1;
      const hist = chartRef.current.addSeries(
        HistogramSeries,
        { priceLineVisible: false, lastValueVisible: false },
        paneIndex,
      );
      const dot = chartRef.current.addSeries(
        LineSeries,
        {
          lineWidth: 4,
          pointMarkersVisible: true,
          pointMarkersRadius: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          lineVisible: false,
        },
        paneIndex,
      );
      sqzmomHistRef.current = hist;
      sqzmomDotRef.current = dot;
      try {
        chartRef.current.panes()[paneIndex]?.setStretchFactor(1);
        chartRef.current.panes()[0]?.setStretchFactor(3);
      } catch { }
      updateSqueezeMom();
    } else if (!indicators.sqzmom && sqzmomHistRef.current && chartRef.current) {
      if (sqzmomHistRef.current) chartRef.current.removeSeries(sqzmomHistRef.current);
      if (sqzmomDotRef.current) chartRef.current.removeSeries(sqzmomDotRef.current);
      sqzmomHistRef.current = null;
      sqzmomDotRef.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.sqzmom, indicators.rsi, indicators.macd]);

  // ADX pane
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.adx && !adxRef.current) {
      const paneIndex = (indicators.rsi ? 1 : 0) + (indicators.macd ? 1 : 0) + 1;

      const aSeries = chartRef.current.addSeries(
        LineSeries,
        {
          color: TV_COLORS.text,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          priceScaleId: "left",
        },
        paneIndex,
      );
      adxRef.current = aSeries;

      // Enable left price scale visibility for ADX and show left scale globally
      aSeries.priceScale().applyOptions({ visible: true });
      chartRef.current.applyOptions({
        leftPriceScale: { visible: true },
      });

      try {
        chartRef.current.panes()[paneIndex]?.setStretchFactor(1);
        chartRef.current.panes()[0]?.setStretchFactor(3);
      } catch { }
      updateADX();
    } else if (!indicators.adx && adxRef.current && chartRef.current) {
      // Disable left price scale visibility when ADX is removed
      try {
        adxRef.current.priceScale().applyOptions({ visible: false });
      } catch { }
      chartRef.current.applyOptions({
        leftPriceScale: { visible: false },
      });

      if (adxRef.current) chartRef.current.removeSeries(adxRef.current);
      adxRef.current = null;
      adxKeyLineRef.current = null;
      adxStrengthLineRef.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.adx, indicators.rsi, indicators.macd, indicators.sqzmom]);

  useEffect(() => {
    const v = (key: IndicatorKey) => indicators[key] && !hidden[key];
    ema20Ref.current?.applyOptions({ visible: v("ema20") });
    ema50Ref.current?.applyOptions({ visible: v("ema50") });
    ema200Ref.current?.applyOptions({ visible: v("ema200") });
    if (rsiRef.current) rsiRef.current.applyOptions({ visible: v("rsi") });
    if (rsi30Ref.current) rsi30Ref.current.applyOptions({ visible: v("rsi") });
    if (rsi70Ref.current) rsi70Ref.current.applyOptions({ visible: v("rsi") });
    if (macdRef.current) macdRef.current.applyOptions({ visible: v("macd") });
    if (macdSignalRef.current) macdSignalRef.current.applyOptions({ visible: v("macd") });
    if (macdHistRef.current) macdHistRef.current.applyOptions({ visible: v("macd") });
    if (volumeSeriesRef.current) volumeSeriesRef.current.applyOptions({ visible: v("volume") });
    if (sqzmomHistRef.current) sqzmomHistRef.current.applyOptions({ visible: v("sqzmom") });
    if (sqzmomDotRef.current) sqzmomDotRef.current.applyOptions({ visible: v("sqzmom") });
    if (adxRef.current) adxRef.current.applyOptions({ visible: v("adx") });
  }, [indicators, hidden]);

  // Recompute indicators when config changes (periods)
  useEffect(() => {
    updateEMAs();
  }, [config.ema20, config.ema50, config.ema200]);

  useEffect(() => {
    updateRSI();
  }, [config.rsi]);

  useEffect(() => {
    updateMACD();
  }, [config.macdFast, config.macdSlow, config.macdSignal]);

  useEffect(() => {
    updateSqueezeMom();
  }, [config.sqzmomBBLength, config.sqzmomBBMult, config.sqzmomKCLength, config.sqzmomKCMult]);

  useEffect(() => {
    updateADX();
  }, [config.adxLen, config.adxDiLen, config.adxKeyLevel, config.adxStrengthLevel]);

  // Sync VRVP visibility changes
  useEffect(() => {
    updateVRVP();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.vrvp, hidden.vrvp]);

  // Sync VRVP configuration adjustments
  useEffect(() => {
    updateVRVP();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    config.vrvpRowLayout,
    config.vrvpRowSize,
    config.vrvpVolume,
    config.vrvpValueAreaVolume,
    config.vrvpShowProfile,
    config.vrvpShowValues,
    config.vrvpWidth,
    config.vrvpPlacement,
    config.vrvpColorUpVol,
    config.vrvpColorDnVol,
    config.vrvpColorUpVolVA,
    config.vrvpColorDnVolVA,
    config.vrvpShowVAH,
    config.vrvpShowVAL,
    config.vrvpShowPOC,
    config.vrvpColorPOC,
    config.vrvpColorVAH,
    config.vrvpColorVAL,
  ]);

  // Sync price lines from store to the candle series
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    const map = priceLinesMapRef.current;
    const linesForThisSymbol = priceLines.filter((p) => p.symbol === symbol);
    const activeIds = new Set(linesForThisSymbol.map((p) => p.id));

    for (const [id, apiLine] of map.entries()) {
      if (!activeIds.has(id)) {
        try {
          series.removePriceLine(apiLine);
        } catch { }
        map.delete(id);
      }
    }
    for (const pl of linesForThisSymbol) {
      if (!map.has(pl.id)) {
        const apiLine = series.createPriceLine({
          price: pl.price,
          color: TV_COLORS.blue,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "",
        });
        map.set(pl.id, apiLine);
      }
    }
  }, [priceLines, symbol]);

  // Cursor style when drawing tools are active + reset measure on tool change
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.style.cursor =
        tool === "hline" || tool === "measure" ? "crosshair" : "";
    }
    if (tool !== "measure") {
      setTimeout(() => {
        setMeasure(INITIAL_MEASURE);
      }, 0);
    }
  }, [tool]);

  function updateEMAs() {
    const c = candlesRef.current;
    if (c.length === 0) return;
    const cfg = configRef.current;
    let last20: number | undefined;
    let last50: number | undefined;
    let last200: number | undefined;

    if (ema20Ref.current) {
      const data = ema(c, cfg.ema20);
      ema20Ref.current.setData(
        data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
      last20 = data.at(-1)?.value;
    }
    if (ema50Ref.current) {
      const data = ema(c, cfg.ema50);
      ema50Ref.current.setData(
        data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
      last50 = data.at(-1)?.value;
    }
    if (ema200Ref.current) {
      const data = ema(c, cfg.ema200);
      ema200Ref.current.setData(
        data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
      last200 = data.at(-1)?.value;
    }
    const lastVol = c.at(-1)?.volume;
    setLastValues((prev) => ({
      ...prev,
      ema20: last20,
      ema50: last50,
      ema200: last200,
      volume: lastVol,
    }));
  }

  function updateRSI() {
    const c = candlesRef.current;
    if (c.length === 0 || !rsiRef.current) return;
    const cfg = configRef.current;
    const data = rsi(c, cfg.rsi).map((p) => ({
      time: p.time as UTCTimestamp,
      value: p.value,
    }));
    rsiRef.current.setData(data);
    if (rsi30Ref.current && data.length > 0)
      rsi30Ref.current.setData([
        { time: data[0].time, value: 30 },
        { time: data[data.length - 1].time, value: 30 },
      ]);
    if (rsi70Ref.current && data.length > 0)
      rsi70Ref.current.setData([
        { time: data[0].time, value: 70 },
        { time: data[data.length - 1].time, value: 70 },
      ]);
    setLastValues((prev) => ({ ...prev, rsi: data.at(-1)?.value }));
  }

  function updateMACD() {
    const c = candlesRef.current;
    if (c.length === 0 || !macdRef.current) return;
    const cfg = configRef.current;
    const m = macd(c, cfg.macdFast, cfg.macdSlow, cfg.macdSignal);
    macdRef.current.setData(
      m.map((p) => ({ time: p.time as UTCTimestamp, value: p.macd })),
    );
    macdSignalRef.current?.setData(
      m.map((p) => ({ time: p.time as UTCTimestamp, value: p.signal })),
    );
    macdHistRef.current?.setData(
      m.map((p) => ({
        time: p.time as UTCTimestamp,
        value: p.histogram,
        color: p.histogram >= 0 ? `${TV_COLORS.green}80` : `${TV_COLORS.red}80`,
      })),
    );
    const last = m.at(-1);
    setLastValues((prev) => ({
      ...prev,
      macd: last?.macd,
      macdSignal: last?.signal,
      macdHist: last?.histogram,
    }));
  }


  function updateSqueezeMom() {
    const c = candlesRef.current;
    if (c.length === 0 || !sqzmomHistRef.current) return;
    const cfg = configRef.current;
    const pts = squeezeMomentum(
      c,
      cfg.sqzmomBBLength,
      cfg.sqzmomBBMult,
      cfg.sqzmomKCLength,
      cfg.sqzmomKCMult,
    );

    // Histogram bars (momentum value)
    sqzmomHistRef.current.setData(
      pts.map((p, i) => {
        const prevVal = i > 0 ? pts[i - 1].val : p.val;
        let color = "#808080"; // fallback for gray
        if (p.val > 0 && p.val > prevVal) color = "#00FF00";
        else if (p.val > 0 && p.val < prevVal) color = "#008000";
        else if (p.val < 0 && p.val < prevVal) color = "#008eff";
        else if (p.val < 0 && p.val > prevVal) color = "#1848cc";

        return {
          time: p.time as UTCTimestamp,
          value: p.val,
          color,
        };
      }),
    );

    // Zero-line dots coloured by squeeze state
    sqzmomDotRef.current?.setData(
      pts.map((p) => ({
        time: p.time as UTCTimestamp,
        value: 0,
        color: p.noSqz ? "#2962ff" : p.sqzOn ? "#131722" : "#787b86",
      })),
    );

    setLastValues((prev) => ({ ...prev, sqzmom: pts.at(-1)?.val }));
  }

  function updateADX() {
    const c = candlesRef.current;
    if (c.length === 0 || !adxRef.current) return;
    const cfg = configRef.current;
    const pts = adx(c, cfg.adxLen, cfg.adxDiLen);

    adxRef.current.setData(
      pts.map((p, i) => ({
        time: p.time as UTCTimestamp,
        value: p.adx,
        color: i > 0 && p.adx > pts[i - 1].adx ? "#008eff" : "#f57f17",
      })),
    );

    if (adxKeyLineRef.current) {
      adxRef.current.removePriceLine(adxKeyLineRef.current);
    }
    adxKeyLineRef.current = adxRef.current.createPriceLine({
      price: cfg.adxKeyLevel,
      color: "#13172266",
      lineWidth: 2,
      lineStyle: 0,
      axisLabelVisible: false,
      title: "Key Level",
    });

    if (adxStrengthLineRef.current) {
      adxRef.current.removePriceLine(adxStrengthLineRef.current);
    }
    adxStrengthLineRef.current = adxRef.current.createPriceLine({
      price: cfg.adxStrengthLevel,
      color: TV_COLORS.blue,
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: false,
      title: "Strength Level",
    });

    const last = pts.at(-1);
    setLastValues((prev) => ({
      ...prev,
      adx: last?.adx,
      plusDI: last?.plusDI,
      minusDI: last?.minusDI,
    }));
  }

  function updateVRVP() {
    if (!chartRef.current || !vrvpSeriesRef.current) return;

    const showIndicator = indicators.vrvp && !hidden.vrvp;
    if (!showIndicator) {
      vrvpSeriesRef.current.setData([]);
      return;
    }

    const range = chartRef.current.timeScale().getVisibleLogicalRange();
    if (range === null || candlesRef.current.length === 0) {
      vrvpSeriesRef.current.setData([]);
      return;
    }

    const logicalFrom = Math.max(0, Math.floor(range.from));
    const logicalTo = Math.min(candlesRef.current.length - 1, Math.ceil(range.to));

    if (logicalFrom > logicalTo) {
      vrvpSeriesRef.current.setData([]);
      return;
    }

    const visibleCandles = candlesRef.current.slice(logicalFrom, logicalTo + 1);
    if (visibleCandles.length === 0) {
      vrvpSeriesRef.current.setData([]);
      return;
    }

    const cfg = configRef.current;
    const vrvpResult = calculateVRVP(
      visibleCandles,
      cfg.vrvpRowLayout,
      cfg.vrvpRowSize,
      cfg.vrvpValueAreaVolume
    );

    const lastVisibleCandle = visibleCandles[visibleCandles.length - 1];
    if (!lastVisibleCandle) return;

    vrvpSeriesRef.current.setData([
      {
        time: lastVisibleCandle.time as UTCTimestamp,
        vrvp: vrvpResult,
        rowLayout: cfg.vrvpRowLayout,
        rowSize: cfg.vrvpRowSize,
        valueAreaVolumePct: cfg.vrvpValueAreaVolume,
        widthPercent: cfg.vrvpWidth,
        placement: cfg.vrvpPlacement,
        volumeType: cfg.vrvpVolume,
        showProfile: cfg.vrvpShowProfile,
        showPOC: cfg.vrvpShowPOC,
        showVAH: cfg.vrvpShowVAH,
        showVAL: cfg.vrvpShowVAL,
        colorUpVol: cfg.vrvpColorUpVol,
        colorDnVol: cfg.vrvpColorDnVol,
        colorUpVolVA: cfg.vrvpColorUpVolVA,
        colorDnVolVA: cfg.vrvpColorDnVolVA,
        colorPOC: cfg.vrvpColorPOC,
        colorVAH: cfg.vrvpColorVAH,
        colorVAL: cfg.vrvpColorVAL,
      }
    ]);
  }

  // Load historical data + subscribe live
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;

    async function load() {
      try {
        const klines = await fetchKlines(symbol, timeframe, 1000);
        if (cancelled) return;
        candlesRef.current = klines;
        if (candleSeriesRef.current) {
          candleSeriesRef.current.setData(
            klines.map((k) => ({
              time: k.time as UTCTimestamp,
              open: k.open,
              high: k.high,
              low: k.low,
              close: k.close,
            })),
          );
        }
        if (volumeSeriesRef.current) {
          volumeSeriesRef.current.setData(
            klines.map((k) => ({
              time: k.time as UTCTimestamp,
              value: k.volume,
              color: k.close >= k.open ? `${TV_COLORS.green}66` : `${TV_COLORS.red}66`,
            })),
          );
        }
        updateEMAs();
        updateRSI();
        updateMACD();
        updateSqueezeMom();
        updateADX();
        chartRef.current?.timeScale().fitContent();
        // Defer VRVP until after fitContent has set the visible range
        requestAnimationFrame(() => {
          updateVRVP();
          recomputePaneOffsets();
        });

        if (klines.length > 0) {
          const last = klines[klines.length - 1];
          const prev = klines[klines.length - 2] ?? last;
          setLastPrice({
            value: last.close,
            pct: prev.close === 0 ? 0 : ((last.close - prev.close) / prev.close) * 100,
          });
        }

        const ws = getBinanceWS();
        unsub = ws.subscribeKline({
          symbol,
          interval: timeframe,
          onCandle: (k) => {
            if (!candleSeriesRef.current) return;
            const arr = candlesRef.current;
            const lastCandle = arr[arr.length - 1];
            if (lastCandle && lastCandle.time === k.time) {
              arr[arr.length - 1] = k;
            } else if (!lastCandle || k.time > lastCandle.time) {
              arr.push(k);
              if (arr.length > 2000) arr.shift();
            } else {
              return;
            }
            candleSeriesRef.current.update({
              time: k.time as UTCTimestamp,
              open: k.open,
              high: k.high,
              low: k.low,
              close: k.close,
            });
            if (volumeSeriesRef.current) {
              volumeSeriesRef.current.update({
                time: k.time as UTCTimestamp,
                value: k.volume,
                color: k.close >= k.open ? `${TV_COLORS.green}66` : `${TV_COLORS.red}66`,
              });
            }
            updateEMAs();
            updateRSI();
            updateMACD();
            updateSqueezeMom();
            updateADX();
            updateVRVP();
            const prev = arr[arr.length - 2] ?? lastCandle;
            setLastPrice({
              value: k.close,
              pct: prev && prev.close !== 0 ? ((k.close - prev.close) / prev.close) * 100 : 0,
            });
          },
        });
      } catch (e) {
        console.error("Failed to load chart data:", e);
      }
    }

    load();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe]);

  const greenOrRed = (n: number) =>
    n >= 0 ? "text-tv-green" : "text-tv-red";

  // Helpers for pill rendering
  const isShown = (key: IndicatorKey) =>
    indicators[key] && (key === "volume" || true); // always renderable if enabled
  void isShown;

  // Determine which pane each indicator lives in (based on current layout)
  const rsiPaneIdx = 1;
  const macdPaneIdx = indicators.rsi ? 2 : 1;
  const sqzmomAdxPaneIdx = (indicators.rsi ? 1 : 0) + (indicators.macd ? 1 : 0) + 1;
  const sqzmomPaneIdx = sqzmomAdxPaneIdx;
  const adxPaneIdx = sqzmomAdxPaneIdx;

  let measureRender: React.ReactNode = null;
  if (
    measure.a &&
    measure.b &&
    chartRef.current &&
    candleSeriesRef.current
  ) {
    const ts = chartRef.current.timeScale();
    const aX = ts.timeToCoordinate(measure.a.time as UTCTimestamp);
    const bX = ts.timeToCoordinate(measure.b.time as UTCTimestamp);
    const aY = candleSeriesRef.current.priceToCoordinate(measure.a.price);
    const bY = candleSeriesRef.current.priceToCoordinate(measure.b.price);

    if (aX !== null && bX !== null && aY !== null && bY !== null) {
      const priceDiff = measure.b.price - measure.a.price;
      const pctChange =
        measure.a.price === 0 ? 0 : (priceDiff / measure.a.price) * 100;
      const isUp = priceDiff >= 0;
      const start = Math.min(measure.a.time, measure.b.time);
      const end = Math.max(measure.a.time, measure.b.time);
      const inRange = candlesRef.current.filter(
        (c) => c.time >= start && c.time <= end,
      );
      const bars = inRange.length;
      const volume = inRange.reduce((s, c) => s + c.volume, 0);
      const dur = durationLabel(measure.a.time, measure.b.time);

      measureRender = (
        <MeasureOverlay
          aX={aX}
          aY={aY}
          bX={bX}
          bY={bY}
          priceDiff={priceDiff}
          pctChange={pctChange}
          bars={bars}
          volume={volume}
          durationText={dur}
          isUp={isUp}
          isPreview={measure.phase === "placing"}
        />
      );
    }
  }
  void renderTick;

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {measureRender}

      {/* Top-left of main pane: symbol info + OHLC + Volume pill + EMA pills */}
      <div
        style={{ top: (paneOffsets[0]?.top ?? 0) + 16, left: leftOffset }}
        className="pointer-events-none absolute z-10 flex flex-col gap-1 text-xs tabular-nums"
      >
        {/* Row 1: symbol info + OHLC stats inline on hover (fixed height, never wraps) */}
        <div className="flex h-5 flex-nowrap items-center gap-x-3 overflow-hidden whitespace-nowrap">
          <div className="flex shrink-0 items-center gap-2 text-[13px] font-semibold">
            <span className="text-tv-text">{symbol}</span>
            <span className="text-tv-text-muted">·</span>
            <span className="uppercase text-tv-text-muted">{timeframe}</span>
            <span className="text-tv-text-muted">·</span>
            <span className="text-tv-text-muted">Binance</span>
          </div>
          {hover && (
            <div className="flex items-center gap-x-3 text-[11px]">
              <span className="text-tv-text-muted">
                O <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.o)}</span>
              </span>
              <span className="text-tv-text-muted">
                H <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.h)}</span>
              </span>
              <span className="text-tv-text-muted">
                L <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.l)}</span>
              </span>
              <span className="text-tv-text-muted">
                C <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.c)}</span>
              </span>
              <span className={greenOrRed(hover.pct)}>
                {hover.pct >= 0 ? "+" : ""}
                {hover.pct.toFixed(2)}%
              </span>
              <span className="text-tv-text-muted">
                Vol <span className="text-tv-text">{formatVolume(hover.v)}</span>
              </span>
            </div>
          )}
        </div>

        {/* Row 2: big live price (always present — reserves space even while loading) */}
        <div className="flex h-7 items-center gap-2">
          {lastPrice ? (
            <>
              <span className={`text-lg font-semibold tabular-nums ${greenOrRed(lastPrice.pct)}`}>
                {formatPrice(lastPrice.value)}
              </span>
              <span className={`text-xs ${greenOrRed(lastPrice.pct)}`}>
                {lastPrice.pct >= 0 ? "+" : ""}
                {lastPrice.pct.toFixed(2)}%
              </span>
            </>
          ) : (
            <span className="text-xs text-tv-text-muted">Cargando…</span>
          )}
        </div>

        {/* Indicator pills for the main pane (fixed position below price) */}
        <div className="mt-1 flex flex-col items-start gap-0.5">
          {/* Toggle button always at top, above the pills */}
          {Object.values(indicators).some(Boolean) && (
            <LegendToggleButton
              collapsed={legendCollapsed}
              count={Object.values(indicators).filter(Boolean).length}
              onClick={() => setLegendCollapsed((v) => !v)}
            />
          )}
          {!legendCollapsed && (
            <div className="mt-0.5 flex flex-col items-start gap-1">
              {indicators.ema20 && (
                <IndicatorPill
                  name={`EMA ${config.ema20}`}
                  value={lastValues.ema20 !== undefined ? formatPrice(lastValues.ema20) : undefined}
                  color={INDICATOR_COLORS.ema20}
                  hidden={hidden.ema20}
                  onToggleHide={() => toggleHidden("ema20")}
                  onSettings={() => setSettingsTarget("ema20")}
                  onRemove={() => removeIndicator("ema20")}
                />
              )}
              {indicators.ema50 && (
                <IndicatorPill
                  name={`EMA ${config.ema50}`}
                  value={lastValues.ema50 !== undefined ? formatPrice(lastValues.ema50) : undefined}
                  color={INDICATOR_COLORS.ema50}
                  hidden={hidden.ema50}
                  onToggleHide={() => toggleHidden("ema50")}
                  onSettings={() => setSettingsTarget("ema50")}
                  onRemove={() => removeIndicator("ema50")}
                />
              )}
              {indicators.ema200 && (
                <IndicatorPill
                  name={`EMA ${config.ema200}`}
                  value={lastValues.ema200 !== undefined ? formatPrice(lastValues.ema200) : undefined}
                  color={INDICATOR_COLORS.ema200}
                  hidden={hidden.ema200}
                  onToggleHide={() => toggleHidden("ema200")}
                  onSettings={() => setSettingsTarget("ema200")}
                  onRemove={() => removeIndicator("ema200")}
                />
              )}
              {indicators.volume && (
                <IndicatorPill
                  name="Vol"
                  value={lastValues.volume !== undefined ? formatVolume(lastValues.volume) : undefined}
                  color={INDICATOR_COLORS.volume}
                  hidden={hidden.volume}
                  onToggleHide={() => toggleHidden("volume")}
                  onSettings={() => setSettingsTarget("volume")}
                  onRemove={() => removeIndicator("volume")}
                />
              )}
              {indicators.vrvp && (
                <IndicatorPill
                  name="VRVP"
                  value={undefined}
                  color={INDICATOR_COLORS.vrvp}
                  hidden={hidden.vrvp}
                  onToggleHide={() => toggleHidden("vrvp")}
                  onSettings={() => setSettingsTarget("vrvp")}
                  onRemove={() => removeIndicator("vrvp")}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sub-pane toggle button — anchored to first visible sub-pane */}
      {(() => {
        const subCount = [indicators.rsi, indicators.macd, indicators.sqzmom, indicators.adx].filter(Boolean).length;
        if (subCount === 0) return null;
        const firstPane = indicators.rsi
          ? paneOffsets[rsiPaneIdx]
          : indicators.macd
            ? paneOffsets[macdPaneIdx]
            : paneOffsets[sqzmomPaneIdx];
        if (!firstPane) return null;
        return (
          <div
            style={{ top: firstPane.top + 10, left: leftOffset }}
            className="absolute z-30"
          >
            <LegendToggleButton
              collapsed={subLegendCollapsed}
              count={subCount}
              onClick={() => setSubLegendCollapsed((v) => !v)}
            />
          </div>
        );
      })()}

      {/* RSI pane label */}
      {!subLegendCollapsed && indicators.rsi && paneOffsets[rsiPaneIdx] && (
        <div
          style={{ top: paneOffsets[rsiPaneIdx].top + 32, left: leftOffset }}
          className="pointer-events-none absolute z-10"
        >
          <IndicatorPill
            name={`RSI ${config.rsi}`}
            value={lastValues.rsi !== undefined ? lastValues.rsi.toFixed(2) : undefined}
            color={INDICATOR_COLORS.rsi}
            hidden={hidden.rsi}
            onToggleHide={() => toggleHidden("rsi")}
            onSettings={() => setSettingsTarget("rsi")}
            onRemove={() => removeIndicator("rsi")}
          />
        </div>
      )}

      {/* MACD pane label */}
      {!subLegendCollapsed && indicators.macd && paneOffsets[macdPaneIdx] && (
        <div
          style={{ top: paneOffsets[macdPaneIdx].top + 32, left: leftOffset }}
          className="pointer-events-none absolute z-10"
        >
          <IndicatorPill
            name={`MACD ${config.macdFast}, ${config.macdSlow}, ${config.macdSignal}`}
            value={
              lastValues.macd !== undefined
                ? `${lastValues.macd.toFixed(2)} / ${(lastValues.macdSignal ?? 0).toFixed(2)}`
                : undefined
            }
            color={INDICATOR_COLORS.macd}
            hidden={hidden.macd}
            onToggleHide={() => toggleHidden("macd")}
            onSettings={() => setSettingsTarget("macd")}
            onRemove={() => removeIndicator("macd")}
          />
        </div>
      )}

      {/* Squeeze Momentum pane label */}
      {!subLegendCollapsed && indicators.sqzmom && paneOffsets[sqzmomPaneIdx] && (
        <div
          style={{ top: paneOffsets[sqzmomPaneIdx].top + 32, left: leftOffset }}
          className="pointer-events-none absolute z-10"
        >
          <IndicatorPill
            name={`SQZ MOM (${config.sqzmomBBLength}, ${config.sqzmomKCLength})`}
            value={
              lastValues.sqzmom !== undefined
                ? lastValues.sqzmom.toFixed(4)
                : undefined
            }
            color={INDICATOR_COLORS.sqzmom}
            hidden={hidden.sqzmom}
            onToggleHide={() => toggleHidden("sqzmom")}
            onSettings={() => setSettingsTarget("sqzmom")}
            onRemove={() => removeIndicator("sqzmom")}
          />
        </div>
      )}

      {/* ADX pane label */}
      {!subLegendCollapsed && indicators.adx && paneOffsets[adxPaneIdx] && (
        <div
          style={{ top: paneOffsets[adxPaneIdx].top + (indicators.sqzmom ? 54 : 32), left: leftOffset }}
          className="pointer-events-none absolute z-10"
        >
          <IndicatorPill
            name={`DMI/ADX (${config.adxDiLen}, ${config.adxLen})`}
            value={
              lastValues.adx !== undefined
                ? lastValues.adx.toFixed(2)
                : undefined
            }
            color={INDICATOR_COLORS.adx}
            hidden={hidden.adx}
            onToggleHide={() => toggleHidden("adx")}
            onSettings={() => setSettingsTarget("adx")}
            onRemove={() => removeIndicator("adx")}
          />
        </div>
      )}
    </div>
  );
}
