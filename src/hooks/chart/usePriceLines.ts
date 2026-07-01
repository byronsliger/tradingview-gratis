"use client";

import { useEffect, useRef, type RefObject } from "react";
import { type ISeriesApi, type IPriceLine, type LineWidth } from "lightweight-charts";
import { TV_COLORS } from "@/lib/chart/chart-colors";
import { useChartStore } from "@/lib/store/chart-store";

export function usePriceLines(
  candleSeriesRef: RefObject<ISeriesApi<"Candlestick"> | null>,
  symbol: string,
) {
  const priceLines = useChartStore((s) => s.priceLines);
  const drawingsHidden = useChartStore((s) => s.drawingsHidden);
  const priceLinesMapRef = useRef<Map<string, IPriceLine>>(new Map());

  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    const map = priceLinesMapRef.current;
    // Con dibujos ocultos la lista efectiva es vacía → se remueven todas
    const linesForSymbol = drawingsHidden
      ? []
      : priceLines.filter((p) => p.symbol === symbol);
    const activeIds = new Set(linesForSymbol.map((p) => p.id));

    // Remove deleted lines
    for (const [id, apiLine] of map.entries()) {
      if (!activeIds.has(id)) {
        try { series.removePriceLine(apiLine); } catch {}
        map.delete(id);
      }
    }

    // Add new lines or update existing ones
    for (const pl of linesForSymbol) {
      const opts = {
        price: pl.price,
        color: pl.color ?? TV_COLORS.blue,
        lineWidth: (pl.lineWidth ?? 1) as LineWidth,
        lineStyle: pl.lineStyle ?? 2,
        axisLabelVisible: pl.axisLabelVisible ?? true,
        title: "",
      };
      if (!map.has(pl.id)) {
        const apiLine = series.createPriceLine(opts);
        map.set(pl.id, apiLine);
      } else {
        map.get(pl.id)!.applyOptions(opts);
      }
    }
  }, [priceLines, symbol, candleSeriesRef, drawingsHidden]);
}
