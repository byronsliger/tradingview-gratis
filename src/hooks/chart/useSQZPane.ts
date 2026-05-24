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
import { formatPrice } from "@/lib/format";

export function useSQZPane(
  chartRef: RefObject<IChartApi | null>,
  candlesRef: RefObject<Candle[]>,
  indicators: Record<IndicatorKey, boolean>,
  hidden: Record<IndicatorKey, boolean>,
  config: IndicatorConfig,
  recomputePaneOffsets: () => void,
) {
  const sqzmomHistRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const activePaneIndexRef = useRef<number>(-1);
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

    const { sqzmomColorBullUp, sqzmomColorBullDn, sqzmomColorBearDn, sqzmomColorBearUp, sqzmomColorNoSqz, sqzmomColorSqzOff } = cfg;
    sqzmomHistRef.current.setData(
      pts.map((p, i) => {
        const prevVal = i > 0 ? pts[i - 1].val : p.val;
        let color = "#808080";
        if (p.val > 0 && p.val > prevVal) color = sqzmomColorBullUp;
        else if (p.val > 0 && p.val < prevVal) color = sqzmomColorBullDn;
        else if (p.val < 0 && p.val < prevVal) color = sqzmomColorBearDn;
        else if (p.val < 0 && p.val > prevVal) color = sqzmomColorBearUp;
        return { time: p.time as UTCTimestamp, value: p.val, color };
      }),
    );

    sqzmomDotRef.current?.setData(
      pts.map((p) => ({
        time: p.time as UTCTimestamp,
        value: 0,
        color: p.noSqz ? sqzmomColorNoSqz : p.sqzOn ? "#131722" : sqzmomColorSqzOff,
      })),
    );

    setLastSQZ(pts.at(-1)?.val);
  }, [candlesRef]);

   
  useEffect(() => {
    if (!chartRef.current) return;
    const targetPaneIndex = (indicators.rsi ? 1 : 0) + (indicators.macd ? 1 : 0) + 1;

    if (sqzmomHistRef.current && activePaneIndexRef.current !== targetPaneIndex) {
      chartRef.current.removeSeries(sqzmomHistRef.current);
      if (sqzmomDotRef.current) chartRef.current.removeSeries(sqzmomDotRef.current);
      sqzmomHistRef.current = null;
      sqzmomDotRef.current = null;
    }

    if (indicators.sqzmom && !sqzmomHistRef.current) {
      const chart = chartRef.current;
      const paneIndex = targetPaneIndex;
      activePaneIndexRef.current = targetPaneIndex;
      const hist = chart.addSeries(HistogramSeries, { 
        priceLineVisible: false, 
        lastValueVisible: configRef.current.sqzmomAxisLabel ?? true,
        priceFormat: { type: "custom", minMove: 0.00000001, formatter: (price: number) => formatPrice(price) }
      }, paneIndex);
      const dot = chart.addSeries(LineSeries, {
        lineWidth: 4,
        pointMarkersVisible: true,
        pointMarkersRadius: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        lineVisible: false,
        priceFormat: { type: "custom", minMove: 0.00000001, formatter: (price: number) => formatPrice(price) }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.sqzmom, indicators.rsi, indicators.macd]);

  useEffect(() => {
    const visible = indicators.sqzmom && !hidden.sqzmom;
    sqzmomHistRef.current?.applyOptions({ visible });
    sqzmomDotRef.current?.applyOptions({ visible });
  }, [indicators.sqzmom, hidden.sqzmom]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { updateSQZ(); }, [config.sqzmomBBLength, config.sqzmomBBMult, config.sqzmomKCLength, config.sqzmomKCMult]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { updateSQZ(); }, [config.sqzmomColorBullUp, config.sqzmomColorBullDn, config.sqzmomColorBearDn, config.sqzmomColorBearUp, config.sqzmomColorNoSqz, config.sqzmomColorSqzOff]);

  useEffect(() => {
    sqzmomHistRef.current?.applyOptions({ lastValueVisible: config.sqzmomAxisLabel ?? true });
  }, [config.sqzmomAxisLabel]);

  return { updateSQZ, sqzmomHistRef, sqzmomDotRef, lastSQZ };
}
