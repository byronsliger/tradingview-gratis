"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
} from "lightweight-charts";
import { TV_COLORS } from "@/lib/chart/chart-colors";
import { type IndicatorConfig, type IndicatorKey } from "@/lib/store/chart-store";
import type { Candle } from "@/lib/binance/types";
import { adx } from "@/lib/indicators";

export function useADXPane(
  chartRef: RefObject<IChartApi | null>,
  candlesRef: RefObject<Candle[]>,
  indicators: Record<IndicatorKey, boolean>,
  hidden: Record<IndicatorKey, boolean>,
  config: IndicatorConfig,
  recomputePaneOffsets: () => void,
) {
  const adxRef = useRef<ISeriesApi<"Line"> | null>(null);
  const adxKeyLineRef = useRef<IPriceLine | null>(null);
  const adxStrengthLineRef = useRef<IPriceLine | null>(null);
  const configRef = useRef(config);
  // eslint-disable-next-line react-hooks/refs
  configRef.current = config;
  const [lastADX, setLastADX] = useState<number | undefined>(undefined);
  const [lastPlusDI, setLastPlusDI] = useState<number | undefined>(undefined);
  const [lastMinusDI, setLastMinusDI] = useState<number | undefined>(undefined);

  const updateADX = useCallback(() => {
    const c = candlesRef.current;
    if (c.length === 0 || !adxRef.current) return;
    const cfg = configRef.current;
    const pts = adx(c, cfg.adxLen, cfg.adxDiLen);

    adxRef.current.setData(
      pts.map((p, i) => ({
        time: p.time as UTCTimestamp,
        value: p.adx,
        color: i > 0 && p.adx > pts[i - 1].adx ? cfg.adxColorRising : cfg.adxColorFalling,
      })),
    );

    if (adxKeyLineRef.current) adxRef.current.removePriceLine(adxKeyLineRef.current);
    adxKeyLineRef.current = adxRef.current.createPriceLine({
      price: cfg.adxKeyLevel,
      color: cfg.adxColorKeyLevel,
      lineWidth: 2,
      lineStyle: 0,
      axisLabelVisible: false,
      title: "Key Level",
    });
    if (adxStrengthLineRef.current) adxRef.current.removePriceLine(adxStrengthLineRef.current);
    adxStrengthLineRef.current = adxRef.current.createPriceLine({
      price: cfg.adxStrengthLevel,
      color: cfg.adxColorStrength,
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: false,
      title: "Strength Level",
    });

    const last = pts.at(-1);
    setLastADX(last?.adx);
    setLastPlusDI(last?.plusDI);
    setLastMinusDI(last?.minusDI);
  }, [candlesRef]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.adx && !adxRef.current) {
      const chart = chartRef.current;
      const paneIndex = (indicators.rsi ? 1 : 0) + (indicators.macd ? 1 : 0) + 1;
      const showLabel = configRef.current.adxAxisLabel ?? true;
      const aSeries = chart.addSeries(
        LineSeries,
        { color: TV_COLORS.text, lineWidth: 2, priceLineVisible: false, lastValueVisible: showLabel, priceScaleId: "adx-right" },
        paneIndex,
      );
      adxRef.current = aSeries;
      aSeries.priceScale().applyOptions({ visible: false, scaleMargins: { top: 0.1, bottom: 0.1 } });
      try { chart.panes()[paneIndex]?.setStretchFactor(1); chart.panes()[0]?.setStretchFactor(3); } catch {}
      updateADX();
    } else if (!indicators.adx && adxRef.current && chartRef.current) {
      try { adxRef.current.priceScale().applyOptions({ visible: false }); } catch {}
      chartRef.current.removeSeries(adxRef.current);
      adxRef.current = null;
      adxKeyLineRef.current = null;
      adxStrengthLineRef.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
  }, [indicators.adx, indicators.rsi, indicators.macd, indicators.sqzmom]);

  useEffect(() => {
    adxRef.current?.applyOptions({ visible: indicators.adx && !hidden.adx });
  }, [indicators.adx, hidden.adx]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { updateADX(); }, [config.adxLen, config.adxDiLen, config.adxKeyLevel, config.adxStrengthLevel]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { updateADX(); }, [config.adxColorRising, config.adxColorFalling, config.adxColorKeyLevel, config.adxColorStrength]);

  useEffect(() => {
    if (!adxRef.current || !chartRef.current) return;
    adxRef.current.applyOptions({ lastValueVisible: config.adxAxisLabel ?? true });
    adxRef.current.priceScale().applyOptions({ visible: false });
  }, [config.adxAxisLabel]);

  return { updateADX, adxRef, lastADX, lastPlusDI, lastMinusDI };
}
