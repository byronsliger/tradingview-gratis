"use client";

import { useEffect, useRef, type RefObject } from "react";
import { type ISeriesApi } from "lightweight-charts";
import { useChartStore } from "@/lib/store/chart-store";
import type { TrendLineDrawing } from "@/lib/drawings/types";
import { TrendLinePrimitive } from "@/lib/drawings/primitives/TrendLinePrimitive";

export function useTrendLinePrimitives(
  candleSeriesRef: RefObject<ISeriesApi<"Candlestick"> | null>,
  symbol: string,
): { primitivesRef: RefObject<Map<string, TrendLinePrimitive>> } {
  const drawings = useChartStore((s) => s.drawings);
  const selectedDrawingId = useChartStore((s) => s.selectedDrawingId);

  const primitivesRef = useRef(new Map<string, TrendLinePrimitive>());

  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    const symbolDrawings = drawings.filter(
      (d): d is TrendLineDrawing => d.symbol === symbol && d.type === "trendline",
    );
    const existing = primitivesRef.current;
    const drawingIds = new Set(symbolDrawings.map((d) => d.id));

    // Detach removed drawings
    for (const [id, prim] of existing) {
      if (!drawingIds.has(id)) {
        series.detachPrimitive(prim);
        existing.delete(id);
      }
    }

    // Attach new / update existing
    for (const d of symbolDrawings) {
      const isSelected = d.id === selectedDrawingId;
      const prim = existing.get(d.id);
      if (!prim) {
        const newPrim = new TrendLinePrimitive(d, isSelected);
        series.attachPrimitive(newPrim);
        existing.set(d.id, newPrim);
      } else {
        prim.update(d, isSelected);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawings, selectedDrawingId, symbol]);

  // Full cleanup on unmount
  useEffect(() => {
    // Capture series at effect-run time so cleanup uses the same instance
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
