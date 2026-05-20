"use client";

import { useEffect, useRef, type RefObject } from "react";
import {
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { TV_COLORS } from "@/lib/chart/chart-colors";
import type { Candle } from "@/lib/binance/types";
import type { IndicatorKey } from "@/lib/store/chart-store";

export function useVolumeSeries(
  chartRef: RefObject<IChartApi | null>,
  candlesRef: RefObject<Candle[]>,
  indicators: Record<IndicatorKey, boolean>,
  hidden: Record<IndicatorKey, boolean>,
  recomputePaneOffsets: () => void,
) {
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      v.setData(
        candlesRef.current.map((k) => ({
          time: k.time as UTCTimestamp,
          value: k.volume,
          color: k.close >= k.open ? `${TV_COLORS.green}66` : `${TV_COLORS.red}66`,
        })),
      );
    } else if (!indicators.volume && volumeSeriesRef.current && chartRef.current) {
      chartRef.current.removeSeries(volumeSeriesRef.current);
      volumeSeriesRef.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
  }, [indicators.volume]);

  useEffect(() => {
    volumeSeriesRef.current?.applyOptions({
      visible: indicators.volume && !hidden.volume,
    });
  }, [indicators.volume, hidden.volume]);

  return { volumeSeriesRef };
}
