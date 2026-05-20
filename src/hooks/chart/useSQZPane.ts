"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  LineSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { type IndicatorConfig, type IndicatorKey } from "@/lib/store/chart-store";
import type { Candle } from "@/lib/binance/types";
import { squeezeMomentum } from "@/lib/indicators";

export function useSQZPane(
  chartRef: RefObject<IChartApi | null>,
  candlesRef: RefObject<Candle[]>,
  indicators: Record<IndicatorKey, boolean>,
  hidden: Record<IndicatorKey, boolean>,
  config: IndicatorConfig,
  recomputePaneOffsets: () => void,
) {
  const sqzmomHistRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const sqzmomDotRef = useRef<ISeriesApi<"Line"> | null>(null);
  const configRef = useRef(config);
  // eslint-disable-next-line react-hooks/refs
  configRef.current = config;
  const [lastSQZ, setLastSQZ] = useState<number | undefined>(undefined);

  const updateSQZ = useCallback(() => {
    const c = candlesRef.current;
    if (c.length === 0 || !sqzmomHistRef.current) return;
    const cfg = configRef.current;
    const pts = squeezeMomentum(c, cfg.sqzmomBBLength, cfg.sqzmomBBMult, cfg.sqzmomKCLength, cfg.sqzmomKCMult);

    sqzmomHistRef.current.setData(
      pts.map((p, i) => {
        const prevVal = i > 0 ? pts[i - 1].val : p.val;
        let color = "#808080";
        if (p.val > 0 && p.val > prevVal) color = "#00FF00";
        else if (p.val > 0 && p.val < prevVal) color = "#008000";
        else if (p.val < 0 && p.val < prevVal) color = "#008eff";
        else if (p.val < 0 && p.val > prevVal) color = "#1848cc";
        return { time: p.time as UTCTimestamp, value: p.val, color };
      }),
    );

    sqzmomDotRef.current?.setData(
      pts.map((p) => ({
        time: p.time as UTCTimestamp,
        value: 0,
        color: p.noSqz ? "#2962ff" : p.sqzOn ? "#131722" : "#787b86",
      })),
    );

    setLastSQZ(pts.at(-1)?.val);
  }, [candlesRef]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.sqzmom && !sqzmomHistRef.current) {
      const chart = chartRef.current;
      const paneIndex = (indicators.rsi ? 1 : 0) + (indicators.macd ? 1 : 0) + 1;
      const hist = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, paneIndex);
      const dot = chart.addSeries(LineSeries, {
        lineWidth: 4,
        pointMarkersVisible: true,
        pointMarkersRadius: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        lineVisible: false,
      }, paneIndex);
      sqzmomHistRef.current = hist;
      sqzmomDotRef.current = dot;
      hist.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
      try { chart.panes()[paneIndex]?.setStretchFactor(1); chart.panes()[0]?.setStretchFactor(3); } catch {}
      updateSQZ();
    } else if (!indicators.sqzmom && sqzmomHistRef.current && chartRef.current) {
      chartRef.current.removeSeries(sqzmomHistRef.current);
      if (sqzmomDotRef.current) chartRef.current.removeSeries(sqzmomDotRef.current);
      sqzmomHistRef.current = null;
      sqzmomDotRef.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
  }, [indicators.sqzmom, indicators.rsi, indicators.macd]);

  useEffect(() => {
    const visible = indicators.sqzmom && !hidden.sqzmom;
    sqzmomHistRef.current?.applyOptions({ visible });
    sqzmomDotRef.current?.applyOptions({ visible });
  }, [indicators.sqzmom, hidden.sqzmom]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { updateSQZ(); }, [config.sqzmomBBLength, config.sqzmomBBMult, config.sqzmomKCLength, config.sqzmomKCMult]);

  return { updateSQZ, lastSQZ };
}
