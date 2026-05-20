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

  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  }, []);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!chartRef.current) return;
    const active = indicators.vrvp && !hidden.vrvp && config.vrvpPlacement === "Right";
    if (active) {
      const range = chartRef.current.timeScale().getVisibleLogicalRange();
      const visible = range ? Math.max(50, range.to - range.from) : 300;
      const pct = Math.max(0.05, Math.min(0.5, config.vrvpWidth / 100));
      const extraBars = Math.ceil((visible * pct) / (1 - pct));
      chartRef.current.applyOptions({ timeScale: { rightOffset: 12 + extraBars } });
    } else {
      chartRef.current.applyOptions({ timeScale: { rightOffset: 12 } });
    }
  }, [indicators.vrvp, hidden.vrvp, config.vrvpWidth, config.vrvpPlacement]);

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

  return { updateVRVP };
}
