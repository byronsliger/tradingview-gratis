"use client";

import { useEffect, useState, type RefObject } from "react";
import { type IChartApi, type ISeriesApi } from "lightweight-charts";
import { useChartStore } from "@/lib/store/chart-store";

export function useSelectedPriceLineHandle(
  chartRef: RefObject<IChartApi | null>,
  candleSeriesRef: RefObject<ISeriesApi<"Candlestick"> | null>,
): { handleY: number | null } {
  const selectedId = useChartStore((s) => s.selectedPriceLineId);
  const priceLines = useChartStore((s) => s.priceLines);
  const selectedLine = priceLines.find((p) => p.id === selectedId) ?? null;

  const [handleY, setHandleY] = useState<number | null>(null);

  useEffect(() => {
    if (!selectedLine) {
      queueMicrotask(() => setHandleY(null));
      return;
    }

    const update = () => {
      const series = candleSeriesRef.current;
      if (!series) { setHandleY(null); return; }
      const y = series.priceToCoordinate(selectedLine.price);
      setHandleY(typeof y === "number" ? y : null);
    };

    update();

    const chart = chartRef.current;
    if (!chart) return;
    chart.timeScale().subscribeVisibleLogicalRangeChange(update);
    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(update);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLine?.id, selectedLine?.price, chartRef, candleSeriesRef]);

  return { handleY };
}
