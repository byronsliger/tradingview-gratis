"use client";

import { useEffect, useRef, type RefObject } from "react";
import { type ISeriesApi, type IPriceLine } from "lightweight-charts";
import { TV_COLORS } from "@/lib/chart/chart-colors";
import { useChartStore } from "@/lib/store/chart-store";

export function usePriceLines(
  candleSeriesRef: RefObject<ISeriesApi<"Candlestick"> | null>,
  symbol: string,
) {
  const priceLines = useChartStore((s) => s.priceLines);
  const priceLinesMapRef = useRef<Map<string, IPriceLine>>(new Map());

  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    const map = priceLinesMapRef.current;
    const linesForSymbol = priceLines.filter((p) => p.symbol === symbol);
    const activeIds = new Set(linesForSymbol.map((p) => p.id));

    for (const [id, apiLine] of map.entries()) {
      if (!activeIds.has(id)) {
        try { series.removePriceLine(apiLine); } catch {}
        map.delete(id);
      }
    }
    for (const pl of linesForSymbol) {
      if (!map.has(pl.id)) {
        const apiLine = series.createPriceLine({
          price: pl.price,
          color: TV_COLORS.blue,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "",
        });
        map.set(pl.id, apiLine);
      }
    }
  }, [priceLines, symbol, candleSeriesRef]);
}
