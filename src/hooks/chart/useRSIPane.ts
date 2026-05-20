"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { TV_COLORS } from "@/lib/chart/chart-colors";
import { INDICATOR_COLORS, type IndicatorConfig, type IndicatorKey } from "@/lib/store/chart-store";
import type { Candle } from "@/lib/binance/types";
import { rsi } from "@/lib/indicators";

export function useRSIPane(
  chartRef: RefObject<IChartApi | null>,
  candlesRef: RefObject<Candle[]>,
  indicators: Record<IndicatorKey, boolean>,
  hidden: Record<IndicatorKey, boolean>,
  config: IndicatorConfig,
  recomputePaneOffsets: () => void,
) {
  const rsiRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsi30Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const rsi70Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const configRef = useRef(config);
  // eslint-disable-next-line react-hooks/refs
  configRef.current = config;
  const [lastRSI, setLastRSI] = useState<number | undefined>(undefined);

  const updateRSI = useCallback(() => {
    const c = candlesRef.current;
    if (c.length === 0 || !rsiRef.current) return;
    const cfg = configRef.current;
    const data = rsi(c, cfg.rsi).map((p) => ({ time: p.time as UTCTimestamp, value: p.value }));
    rsiRef.current.setData(data);
    if (rsi30Ref.current && data.length > 0) {
      rsi30Ref.current.setData([
        { time: data[0].time, value: 30 },
        { time: data[data.length - 1].time, value: 30 },
      ]);
    }
    if (rsi70Ref.current && data.length > 0) {
      rsi70Ref.current.setData([
        { time: data[0].time, value: 70 },
        { time: data[data.length - 1].time, value: 70 },
      ]);
    }
    setLastRSI(data.at(-1)?.value);
  }, [candlesRef]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.rsi && !rsiRef.current) {
      const chart = chartRef.current;
      const paneIndex = 1;
      const r = chart.addSeries(LineSeries, { color: INDICATOR_COLORS.rsi, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, paneIndex);
      const r30 = chart.addSeries(LineSeries, { color: TV_COLORS.textMuted, lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false }, paneIndex);
      const r70 = chart.addSeries(LineSeries, { color: TV_COLORS.textMuted, lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false }, paneIndex);
      rsiRef.current = r;
      rsi30Ref.current = r30;
      rsi70Ref.current = r70;
      r.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
      try { chart.panes()[1]?.setStretchFactor(1); chart.panes()[0]?.setStretchFactor(3); } catch {}
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
  }, [indicators.rsi]);

  useEffect(() => {
    const visible = indicators.rsi && !hidden.rsi;
    rsiRef.current?.applyOptions({ visible });
    rsi30Ref.current?.applyOptions({ visible });
    rsi70Ref.current?.applyOptions({ visible });
  }, [indicators.rsi, hidden.rsi]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { updateRSI(); }, [config.rsi]);

  return { updateRSI, lastRSI };
}
