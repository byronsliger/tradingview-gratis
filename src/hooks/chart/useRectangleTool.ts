"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { type IChartApi, type ISeriesApi } from "lightweight-charts";
import { useChartStore, type DrawingTool } from "@/lib/store/chart-store";
import type { TrendLinePoint } from "@/lib/drawings/types";
import type { Candle } from "@/lib/binance/types";
import { registerLegacyEventBlockers } from "@/lib/chart/event-utils";

export interface RectangleInProgress {
  a: TrendLinePoint;
  b: TrendLinePoint;
}

export function useRectangleTool(
  containerRef: RefObject<HTMLDivElement | null>,
  chartRef: RefObject<IChartApi | null>,
  candleSeriesRef: RefObject<ISeriesApi<"Candlestick"> | null>,
  candlesRef: RefObject<Candle[]>,
  tool: DrawingTool,
  symbol: string,
): { inProgress: RectangleInProgress | null } {
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
  const [inProgress, setInProgress] = useState<RectangleInProgress | null>(null);

  useEffect(() => {
    if (tool !== "rectangle") {
      phaseRef.current = "idle";
      pointARef.current = null;
      setInProgress(null);
    }
  }, [tool]);

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
      } catch (_) {}
      const x = e.clientX - rect.left - leftScaleWidth;
      const y = e.clientY - rect.top;
      const price = series.coordinateToPrice(y);
      if (price === null || !isFinite(price)) return null;
      const time = chart.timeScale().coordinateToTime(x);
      if (time !== null) return { time: time as number, price };
      const logical = chart.timeScale().coordinateToLogical(x);
      if (logical === null) return null;
      const maxIdx = candles.length - 1;
      const interval = maxIdx >= 1 ? candles[maxIdx].time - candles[maxIdx - 1].time : 60;
      const li = Math.round(logical);
      let extTime: number;
      if (li >= 0 && li <= maxIdx) extTime = candles[li].time;
      else if (li < 0) extTime = candles[0].time - Math.abs(li) * interval;
      else extTime = candles[maxIdx].time + (li - maxIdx) * interval;
      return { time: extTime, price };
    };

    const onPointerDown = (e: PointerEvent) => {
      if (toolRef.current !== "rectangle") return;
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
          type: "rectangle",
          a,
          b: point,
          ...drawingDefaultsRef.current.rectangle,
        });
        setToolRef.current("cursor");
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (toolRef.current !== "rectangle") return;
      if (phaseRef.current !== "placing_b") return;
      const point = getPoint(e);
      if (!point || !pointARef.current) return;
      setInProgress({ a: pointARef.current, b: point });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (toolRef.current !== "rectangle") return;
      if (e.key !== "Escape") return;
      phaseRef.current = "idle";
      pointARef.current = null;
      setInProgress(null);
      setToolRef.current("cursor");
    };

    const cleanLegacyBlockers = registerLegacyEventBlockers(container, () => toolRef.current === "rectangle");

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
