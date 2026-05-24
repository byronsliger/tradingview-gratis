"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { type IChartApi, type ISeriesApi } from "lightweight-charts";
import { useChartStore, type DrawingTool } from "@/lib/store/chart-store";
import type { TrendLinePoint } from "@/lib/drawings/types";
import type { Candle } from "@/lib/binance/types";
import { registerLegacyEventBlockers } from "@/lib/chart/event-utils";

export interface TrendLineInProgress {
  a: TrendLinePoint;
  b: TrendLinePoint;
}

export function useTrendLineTool(
  containerRef: RefObject<HTMLDivElement | null>,
  chartRef: RefObject<IChartApi | null>,
  candleSeriesRef: RefObject<ISeriesApi<"Candlestick"> | null>,
  candlesRef: RefObject<Candle[]>,
  tool: DrawingTool,
  symbol: string,
): { inProgress: TrendLineInProgress | null } {
  const addDrawing = useChartStore((s) => s.addDrawing);
  const setTool = useChartStore((s) => s.setTool);
  const drawingDefaults = useChartStore((s) => s.drawingDefaults);

  const addDrawingRef = useRef(addDrawing);
  // eslint-disable-next-line react-hooks/refs
  addDrawingRef.current = addDrawing;
  const setToolRef = useRef(setTool);
  // eslint-disable-next-line react-hooks/refs
  setToolRef.current = setTool;
  const toolRef = useRef(tool);
  // eslint-disable-next-line react-hooks/refs
  toolRef.current = tool;
  const symbolRef = useRef(symbol);
  // eslint-disable-next-line react-hooks/refs
  symbolRef.current = symbol;
  const drawingDefaultsRef = useRef(drawingDefaults);
  // eslint-disable-next-line react-hooks/refs
  drawingDefaultsRef.current = drawingDefaults;

  const phaseRef = useRef<"idle" | "placing_b">("idle");
  const pointARef = useRef<TrendLinePoint | null>(null);
  const [inProgress, setInProgress] = useState<TrendLineInProgress | null>(null);

  // Reset when tool changes away
  useEffect(() => {
    if (tool !== "trendline") {
      phaseRef.current = "idle";
      pointARef.current = null;
      setInProgress(null);
    }
  }, [tool]);

  // Reset when symbol changes
  useEffect(() => {
    phaseRef.current = "idle";
    pointARef.current = null;
    setInProgress(null);
  }, [symbol]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const getPoint = (e: PointerEvent): TrendLinePoint | null => {
      const chart = chartRef.current;
      const series = candleSeriesRef.current;
      const candles = candlesRef.current;
      if (!chart || !series || candles.length === 0) return null;
      const rect = container.getBoundingClientRect();
      let leftScaleWidth = 0;
      try {
        if (chart.options().leftPriceScale?.visible) {
          leftScaleWidth = chart.priceScale("left").width();
        }
      } catch (e) {
        // Ignore internal lightweight-charts initialization errors
      }
      const x = e.clientX - rect.left - leftScaleWidth;
      const y = e.clientY - rect.top;
      const price = series.coordinateToPrice(y);
      if (price === null || !isFinite(price)) return null;
      // 1. Try to get the exact time from the timescale coordinate
      const time = chart.timeScale().coordinateToTime(x);
      if (time !== null) {
        return { time: time as number, price };
      }
      // 2. Fall back to logical index lookup (e.g. in the rightOffset zone) and extrapolate time
      const logical = chart.timeScale().coordinateToLogical(x);
      if (logical === null) return null;
      
      const maxIdx = candles.length - 1;
      const logicalIndex = Math.round(logical);
      let extTime: number;

      if (logicalIndex >= 0 && logicalIndex <= maxIdx) {
        extTime = candles[logicalIndex].time;
      } else {
        const interval = maxIdx >= 1 ? candles[maxIdx].time - candles[maxIdx - 1].time : 60;
        if (logicalIndex < 0) {
          extTime = candles[0].time - Math.abs(logicalIndex) * interval;
        } else {
          extTime = candles[maxIdx].time + (logicalIndex - maxIdx) * interval;
        }
      }
      return { time: extTime, price };
    };

    const onPointerDown = (e: PointerEvent) => {
      if (toolRef.current !== "trendline") return;
      const point = getPoint(e);
      if (!point) return;

      e.stopImmediatePropagation();
      e.preventDefault();

      if (phaseRef.current === "idle") {
        phaseRef.current = "placing_b";
        pointARef.current = point;
        setInProgress({ a: point, b: point });
      } else {
        const a = pointARef.current!;
        phaseRef.current = "idle";
        pointARef.current = null;
        setInProgress(null);
        addDrawingRef.current({
          id: crypto.randomUUID(),
          symbol: symbolRef.current,
          type: "trendline",
          a,
          b: point,
          ...drawingDefaultsRef.current.trendline,
        });
        setToolRef.current("cursor");
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (toolRef.current !== "trendline") return;
      if (phaseRef.current !== "placing_b") return;
      const point = getPoint(e);
      if (!point || !pointARef.current) return;
      setInProgress({ a: pointARef.current, b: point });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (toolRef.current !== "trendline") return;
      if (e.key !== "Escape") return;
      phaseRef.current = "idle";
      pointARef.current = null;
      setInProgress(null);
      setToolRef.current("cursor");
    };

    const cleanLegacyBlockers = registerLegacyEventBlockers(container, () => toolRef.current === "trendline");

    container.addEventListener("pointerdown", onPointerDown, true);
    container.addEventListener("pointermove", onPointerMove);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      container.removeEventListener("pointerdown", onPointerDown, true);
      container.removeEventListener("pointermove", onPointerMove);
      cleanLegacyBlockers();
      window.removeEventListener("keydown", onKeyDown);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { inProgress };
}
