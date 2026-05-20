"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  LineSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { TV_COLORS } from "@/lib/chart/chart-colors";
import { INDICATOR_COLORS, type IndicatorConfig, type IndicatorKey } from "@/lib/store/chart-store";
import type { Candle } from "@/lib/binance/types";
import { macd } from "@/lib/indicators";

export function useMACDPane(
  chartRef: RefObject<IChartApi | null>,
  candlesRef: RefObject<Candle[]>,
  indicators: Record<IndicatorKey, boolean>,
  hidden: Record<IndicatorKey, boolean>,
  config: IndicatorConfig,
  recomputePaneOffsets: () => void,
) {
  const macdRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdSignalRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdHistRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const configRef = useRef(config);
  // eslint-disable-next-line react-hooks/refs
  configRef.current = config;
  const [lastMACD, setLastMACD] = useState<number | undefined>(undefined);
  const [lastMACDSignal, setLastMACDSignal] = useState<number | undefined>(undefined);
  const [lastMACDHist, setLastMACDHist] = useState<number | undefined>(undefined);

  const updateMACD = useCallback(() => {
    const c = candlesRef.current;
    if (c.length === 0 || !macdRef.current) return;
    const cfg = configRef.current;
    const m = macd(c, cfg.macdFast, cfg.macdSlow, cfg.macdSignal);
    macdRef.current.setData(m.map((p) => ({ time: p.time as UTCTimestamp, value: p.macd })));
    macdSignalRef.current?.setData(m.map((p) => ({ time: p.time as UTCTimestamp, value: p.signal })));
    macdHistRef.current?.setData(
      m.map((p) => ({
        time: p.time as UTCTimestamp,
        value: p.histogram,
        color: p.histogram >= 0 ? `${TV_COLORS.green}80` : `${TV_COLORS.red}80`,
      })),
    );
    const last = m.at(-1);
    setLastMACD(last?.macd);
    setLastMACDSignal(last?.signal);
    setLastMACDHist(last?.histogram);
  }, [candlesRef]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.macd && !macdRef.current) {
      const chart = chartRef.current;
      const paneIndex = indicators.rsi ? 2 : 1;
      const m = chart.addSeries(LineSeries, { color: INDICATOR_COLORS.macd, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, paneIndex);
      const s = chart.addSeries(LineSeries, { color: TV_COLORS.yellow, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, paneIndex);
      const h = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, paneIndex);
      macdRef.current = m;
      macdSignalRef.current = s;
      macdHistRef.current = h;
      m.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
      try { chart.panes()[paneIndex]?.setStretchFactor(1); chart.panes()[0]?.setStretchFactor(3); } catch {}
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
  }, [indicators.macd, indicators.rsi]);

  useEffect(() => {
    const visible = indicators.macd && !hidden.macd;
    macdRef.current?.applyOptions({ visible });
    macdSignalRef.current?.applyOptions({ visible });
    macdHistRef.current?.applyOptions({ visible });
  }, [indicators.macd, hidden.macd]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { updateMACD(); }, [config.macdFast, config.macdSlow, config.macdSignal]);

  return { updateMACD, lastMACD, lastMACDSignal, lastMACDHist };
}
