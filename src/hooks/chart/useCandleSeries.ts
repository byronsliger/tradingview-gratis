"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  CandlestickSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { getChartColors, TV_COLORS } from "@/lib/chart/chart-colors";
import {
  type IndicatorConfig,
  type IndicatorKey,
} from "@/lib/store/chart-store";
import type { Candle } from "@/lib/binance/types";
import { ema } from "@/lib/indicators";

export function useCandleSeries(
  chartRef: RefObject<IChartApi | null>,
  candlesRef: RefObject<Candle[]>,
  indicators: Record<IndicatorKey, boolean>,
  hidden: Record<IndicatorKey, boolean>,
  config: IndicatorConfig,
  theme: "dark" | "light",
) {
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const ema20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema200Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const configRef = useRef(config);
  // eslint-disable-next-line react-hooks/refs
  configRef.current = config;

  const [lastEMA20, setLastEMA20] = useState<number | undefined>(undefined);
  const [lastEMA50, setLastEMA50] = useState<number | undefined>(undefined);
  const [lastEMA200, setLastEMA200] = useState<number | undefined>(undefined);
  const [lastVolume, setLastVolume] = useState<number | undefined>(undefined);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!chartRef.current) return;
    const c = TV_COLORS;
    const cs = chartRef.current.addSeries(CandlestickSeries, {
      upColor: c.green,
      downColor: c.red,
      borderUpColor: c.green,
      borderDownColor: c.red,
      wickUpColor: c.green,
      wickDownColor: c.red,
      priceLineColor: c.textMuted,
      priceLineStyle: 2,
    });
    cs.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.06 } });
    candleSeriesRef.current = cs;

    const cfg0 = configRef.current;
    ema20Ref.current = chartRef.current.addSeries(LineSeries, {
      color: cfg0.ema20Color,
      lineWidth: cfg0.ema20Width,
      lineStyle: cfg0.ema20Style,
      priceLineVisible: false,
      lastValueVisible: cfg0.ema20AxisLabel ?? true,
    });
    ema50Ref.current = chartRef.current.addSeries(LineSeries, {
      color: cfg0.ema50Color,
      lineWidth: cfg0.ema50Width,
      lineStyle: cfg0.ema50Style,
      priceLineVisible: false,
      lastValueVisible: cfg0.ema50AxisLabel ?? true,
    });
    ema200Ref.current = chartRef.current.addSeries(LineSeries, {
      color: cfg0.ema200Color,
      lineWidth: cfg0.ema200Width,
      lineStyle: cfg0.ema200Style,
      priceLineVisible: false,
      lastValueVisible: cfg0.ema200AxisLabel ?? true,
    });

    return () => {
      candleSeriesRef.current = null;
      ema20Ref.current = null;
      ema50Ref.current = null;
      ema200Ref.current = null;
    };
  }, []);

  useEffect(() => {
    if (!candleSeriesRef.current) return;
    const c = getChartColors(theme);
    candleSeriesRef.current.applyOptions({
      upColor: c.green,
      downColor: c.red,
      borderUpColor: c.green,
      borderDownColor: c.red,
      wickUpColor: c.green,
      wickDownColor: c.red,
      priceLineColor: c.textMuted,
    });
  }, [theme]);

  useEffect(() => {
    const v = (key: IndicatorKey) => indicators[key] && !hidden[key];
    ema20Ref.current?.applyOptions({ visible: v("ema20") });
    ema50Ref.current?.applyOptions({ visible: v("ema50") });
    ema200Ref.current?.applyOptions({ visible: v("ema200") });
  }, [indicators, hidden]);

  const updateEMAs = useCallback(() => {
    const c = candlesRef.current;
    if (c.length === 0) return;
    const cfg = configRef.current;

    if (ema20Ref.current) {
      const data = ema(c, cfg.ema20);
      ema20Ref.current.setData(data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
      setLastEMA20(data.at(-1)?.value);
    }
    if (ema50Ref.current) {
      const data = ema(c, cfg.ema50);
      ema50Ref.current.setData(data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
      setLastEMA50(data.at(-1)?.value);
    }
    if (ema200Ref.current) {
      const data = ema(c, cfg.ema200);
      ema200Ref.current.setData(data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
      setLastEMA200(data.at(-1)?.value);
    }
    setLastVolume(c.at(-1)?.volume);
  }, [candlesRef]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { updateEMAs(); }, [config.ema20, config.ema50, config.ema200]);

  useEffect(() => {
    ema20Ref.current?.applyOptions({ color: config.ema20Color, lineWidth: config.ema20Width, lineStyle: config.ema20Style, lastValueVisible: config.ema20AxisLabel ?? true });
  }, [config.ema20Color, config.ema20Width, config.ema20Style, config.ema20AxisLabel]);

  useEffect(() => {
    ema50Ref.current?.applyOptions({ color: config.ema50Color, lineWidth: config.ema50Width, lineStyle: config.ema50Style, lastValueVisible: config.ema50AxisLabel ?? true });
  }, [config.ema50Color, config.ema50Width, config.ema50Style, config.ema50AxisLabel]);

  useEffect(() => {
    ema200Ref.current?.applyOptions({ color: config.ema200Color, lineWidth: config.ema200Width, lineStyle: config.ema200Style, lastValueVisible: config.ema200AxisLabel ?? true });
  }, [config.ema200Color, config.ema200Width, config.ema200Style, config.ema200AxisLabel]);

  return { candleSeriesRef, updateEMAs, lastEMA20, lastEMA50, lastEMA200, lastVolume };
}
