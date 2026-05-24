"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import {
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
  type WhitespaceData,
} from "lightweight-charts";
import { VRVPSeriesPaneView, type VRVPBarData } from "@/lib/indicators/vrvp-series";
import { calculateVRVP } from "@/lib/indicators";
import { type IndicatorConfig, type IndicatorKey } from "@/lib/store/chart-store";
import type { Candle } from "@/lib/binance/types";

export function useVRVPSeries(
  chartRef: RefObject<IChartApi | null>,
  candlesRef: RefObject<Candle[]>,
  indicators: Record<IndicatorKey, boolean>,
  hidden: Record<IndicatorKey, boolean>,
  config: IndicatorConfig,
) {
  const vrvpSeriesRef = useRef<ISeriesApi<"Custom", Time, VRVPBarData | WhitespaceData<Time>> | null>(null);
  const configRef = useRef(config);
  // eslint-disable-next-line react-hooks/refs
  configRef.current = config;
  const indicatorsRef = useRef(indicators);
  // eslint-disable-next-line react-hooks/refs
  indicatorsRef.current = indicators;
  const hiddenRef = useRef(hidden);
  // eslint-disable-next-line react-hooks/refs
  hiddenRef.current = hidden;

   
  useEffect(() => {
    if (!chartRef.current) return;
    try {
      const paneView = new VRVPSeriesPaneView();
      vrvpSeriesRef.current = chartRef.current.addCustomSeries(paneView, {
        priceLineVisible: false,
        lastValueVisible: false,
      });
    } catch (e) {
      console.error("Failed to add custom VRVP series:", e);
    }
    return () => { vrvpSeriesRef.current = null; };
  }, [chartRef]);

  const updateVRVP = useCallback(() => {
    if (!chartRef.current || !vrvpSeriesRef.current) return;
    const inds = indicatorsRef.current;
    const hid = hiddenRef.current;
    const cfg = configRef.current;

    if (!inds.vrvp || hid.vrvp) {
      vrvpSeriesRef.current.setData([]);
      return;
    }

    const range = chartRef.current.timeScale().getVisibleLogicalRange();
    if (range === null || candlesRef.current.length === 0) {
      vrvpSeriesRef.current.setData([]);
      return;
    }

    const from = Math.max(0, Math.floor(range.from));
    const to = Math.min(candlesRef.current.length - 1, Math.ceil(range.to));
    if (from > to) { vrvpSeriesRef.current.setData([]); return; }

    const visible = candlesRef.current.slice(from, to + 1);
    if (visible.length === 0) { vrvpSeriesRef.current.setData([]); return; }

    const vrvpResult = calculateVRVP(visible, cfg.vrvpRowLayout, cfg.vrvpRowSize, cfg.vrvpValueAreaVolume);
    const last = visible[visible.length - 1];
    if (!last) return;

    vrvpSeriesRef.current.setData([{
      time: last.time as UTCTimestamp,
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
    }]);
  }, [chartRef, candlesRef]);

  // rightOffset management
   
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = chartRef.current;

    const handler = () => {
      const active = indicators.vrvp && !hidden.vrvp && config.vrvpPlacement === "Right";
      const currentOffset = chart.options().timeScale.rightOffset;

      if (!active) {
        const isMobile = window.innerWidth < 768;
        const defaultOffset = isMobile ? 1 : 4;
        // Only apply if different to avoid blocking pan interactions
        if (Math.abs(currentOffset - defaultOffset) > 0.1) {
          chart.applyOptions({ timeScale: { rightOffset: defaultOffset } });
        }
        return;
      }

      const range = chart.timeScale().getVisibleLogicalRange();
      if (!range) return;

      const visibleBars = range.to - range.from;
      const pct = Math.max(0.05, Math.min(0.5, config.vrvpWidth / 100));
      const isMobile = window.innerWidth < 768;
      // Correct math: rightOffset should be exactly pct of the total visible viewport bars.
      const extraBars = Math.ceil(visibleBars * pct);

      // Gap padding to prevent candles from sticking completely to the VRVP
      const padding = isMobile ? 0 : 2; 
      const newOffset = extraBars + padding;

      // Only apply if the difference is significant (e.g. > 1 bar) to avoid infinite loops and micro-jitters
      if (Math.abs(currentOffset - newOffset) > 1) {
        chart.applyOptions({ timeScale: { rightOffset: newOffset } });
      }
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
    // Initial application
    handler();

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler);
    };
  }, [chartRef, indicators.vrvp, hidden.vrvp, config.vrvpWidth, config.vrvpPlacement]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { updateVRVP(); }, [indicators.vrvp, hidden.vrvp]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { updateVRVP(); }, [
    config.vrvpRowLayout, config.vrvpRowSize, config.vrvpVolume, config.vrvpValueAreaVolume,
    config.vrvpShowProfile, config.vrvpShowValues, config.vrvpWidth, config.vrvpPlacement,
    config.vrvpColorUpVol, config.vrvpColorDnVol, config.vrvpColorUpVolVA, config.vrvpColorDnVolVA,
    config.vrvpShowVAH, config.vrvpShowVAL, config.vrvpShowPOC,
    config.vrvpColorPOC, config.vrvpColorVAH, config.vrvpColorVAL,
  ]);

  return { updateVRVP, vrvpSeriesRef };
}
