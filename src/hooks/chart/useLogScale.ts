"use client";

import { useEffect, type RefObject } from "react";
import { PriceScaleMode, type IChartApi } from "lightweight-charts";
import { useChartStore } from "@/lib/store/chart-store";

/** Applies the persisted log-scale mode to the main pane's right price scale. */
export function useLogScale(chartRef: RefObject<IChartApi | null>, chartReady: boolean) {
  const logScale = useChartStore((s) => s.logScale);

  useEffect(() => {
    if (!chartReady) return;
    chartRef.current?.priceScale("right").applyOptions({
      mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
    });
  }, [logScale, chartReady, chartRef]);
}
