"use client";

import { useEffect, useRef, type RefObject } from "react";
import { type ISeriesApi } from "lightweight-charts";
import { useChartStore } from "@/lib/store/chart-store";
import type { RectangleDrawing } from "@/lib/drawings/types";
import { RectanglePrimitive } from "@/lib/drawings/primitives/RectanglePrimitive";
import type { Candle } from "@/lib/binance/types";

export function useRectanglePrimitives(
  candleSeriesRef: RefObject<ISeriesApi<"Candlestick"> | null>,
  symbol: string,
  candlesRef: RefObject<Candle[]>,
): { primitivesRef: RefObject<Map<string, RectanglePrimitive>> } {
  const drawings = useChartStore((s) => s.drawings);
  const selectedDrawingId = useChartStore((s) => s.selectedDrawingId);
  const drawingsHidden = useChartStore((s) => s.drawingsHidden);

  const primitivesRef = useRef(new Map<string, RectanglePrimitive>());

  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    // Con dibujos ocultos se detachan todos (el Map vacío también inhabilita el hit-test)
    const relevant = drawingsHidden
      ? []
      : drawings.filter(
          (d): d is RectangleDrawing => d.symbol === symbol && d.type === "rectangle",
        );
    const existing = primitivesRef.current;
    const ids = new Set(relevant.map((d) => d.id));

    for (const [id, prim] of existing) {
      if (!ids.has(id)) {
        series.detachPrimitive(prim);
        existing.delete(id);
      }
    }

    for (const d of relevant) {
      const isSelected = d.id === selectedDrawingId;
      const prim = existing.get(d.id);
      if (!prim) {
        const newPrim = new RectanglePrimitive(d, isSelected, candlesRef);
        series.attachPrimitive(newPrim);
        existing.set(d.id, newPrim);
      } else {
        prim.update(d, isSelected);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawings, selectedDrawingId, symbol, drawingsHidden]);

  useEffect(() => {
    const series = candleSeriesRef.current;
    return () => {
      for (const [, prim] of primitivesRef.current) {
        series?.detachPrimitive(prim);
      }
      primitivesRef.current = new Map();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { primitivesRef };
}
