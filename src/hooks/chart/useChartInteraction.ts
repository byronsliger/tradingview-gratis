"use client";

import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { type IChartApi, type ISeriesApi } from "lightweight-charts";
import { useChartStore, type DrawingTool } from "@/lib/store/chart-store";
import type { MeasureState } from "./useMeasureTool";

export interface HoverInfo {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  time: number;
  pct: number;
}

export function useChartInteraction(
  containerRef: RefObject<HTMLDivElement | null>,
  chartRef: RefObject<IChartApi | null>,
  candleSeriesRef: RefObject<ISeriesApi<"Candlestick"> | null>,
  volumeSeriesRef: RefObject<ISeriesApi<"Histogram"> | null>,
  tool: DrawingTool,
  symbol: string,
  measureRef: RefObject<MeasureState>,
  setMeasure: Dispatch<SetStateAction<MeasureState>>,
  onLogicalRangeChange: () => void,
): { hover: HoverInfo | null } {
  const [hover, setHover] = useState<HoverInfo | null>(null);

  const addPriceLine = useChartStore((s) => s.addPriceLine);
  const removePriceLine = useChartStore((s) => s.removePriceLine);
  const priceLines = useChartStore((s) => s.priceLines);
  const toolRef = useRef(tool);
  // eslint-disable-next-line react-hooks/refs
  toolRef.current = tool;
  const addPriceLineRef = useRef(addPriceLine);
  // eslint-disable-next-line react-hooks/refs
  addPriceLineRef.current = addPriceLine;
  const removePriceLineRef = useRef(removePriceLine);
  // eslint-disable-next-line react-hooks/refs
  removePriceLineRef.current = removePriceLine;
  const priceLinesRef = useRef(priceLines);
  // eslint-disable-next-line react-hooks/refs
  priceLinesRef.current = priceLines;
  const symbolRef = useRef(symbol);
  // eslint-disable-next-line react-hooks/refs
  symbolRef.current = symbol;
  const onRangeChangeRef = useRef(onLogicalRangeChange);
  // eslint-disable-next-line react-hooks/refs
  onRangeChangeRef.current = onLogicalRangeChange;

  // Subscribe chart events on mount (stable subscription — reads from refs)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = chartRef.current;

    const onClickHandler: Parameters<typeof chart.subscribeClick>[0] = (param) => {
      if (!param.point || !candleSeriesRef.current) return;
      const price = candleSeriesRef.current.coordinateToPrice(param.point.y);
      if (price === null || !isFinite(price)) return;

      if (toolRef.current === "hline") {
        addPriceLineRef.current(price, symbolRef.current);
        return;
      }

      if (toolRef.current === "eraser") {
        const THRESHOLD_PX = 8;
        let closestId: string | null = null;
        let closestDist = Infinity;
        for (const pl of priceLinesRef.current) {
          if (pl.symbol !== symbolRef.current) continue;
          const lineY = candleSeriesRef.current.priceToCoordinate(pl.price);
          if (lineY === null) continue;
          const dist = Math.abs(lineY - param.point.y);
          if (dist < THRESHOLD_PX && dist < closestDist) {
            closestDist = dist;
            closestId = pl.id;
          }
        }
        if (closestId) removePriceLineRef.current(closestId);
        return;
      }

      if (toolRef.current === "measure") {
        if (!param.time) return;
        const time = Number(param.time);
        const current = measureRef.current;
        if (current.phase === "idle") {
          setMeasure({ phase: "placing", a: { time, price }, b: { time, price } });
        } else if (current.phase === "placing") {
          setMeasure({ phase: "done", a: current.a, b: { time, price } });
        } else {
          setMeasure({ phase: "placing", a: { time, price }, b: { time, price } });
        }
      }
    };
    chart.subscribeClick(onClickHandler);

    const onCrosshairMove: Parameters<typeof chart.subscribeCrosshairMove>[0] = (param) => {
      if (
        toolRef.current === "measure" &&
        measureRef.current.phase === "placing" &&
        param.point && param.time && candleSeriesRef.current
      ) {
        const price = candleSeriesRef.current.coordinateToPrice(param.point.y);
        if (price !== null && isFinite(price)) {
          const time = Number(param.time);
          setMeasure((prev) => prev.phase === "placing" ? { ...prev, b: { time, price } } : prev);
        }
      }

      if (!param.time || !candleSeriesRef.current) {
        setHover(null);
        return;
      }
      const data = param.seriesData.get(candleSeriesRef.current);
      const vol = volumeSeriesRef.current ? param.seriesData.get(volumeSeriesRef.current) : null;
      if (data && "open" in data) {
        const o = data.open as number;
        const c = data.close as number;
        setHover({
          o, h: data.high as number, l: data.low as number, c,
          v: vol && "value" in vol ? (vol.value as number) : 0,
          time: Number(param.time),
          pct: o === 0 ? 0 : ((c - o) / o) * 100,
        });
      }
    };
    chart.subscribeCrosshairMove(onCrosshairMove);

    const logicalRangeHandler = () => onRangeChangeRef.current();
    chart.timeScale().subscribeVisibleLogicalRangeChange(logicalRangeHandler);

    return () => {
      chart.unsubscribeClick(onClickHandler);
      chart.unsubscribeCrosshairMove(onCrosshairMove);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(logicalRangeHandler);
    };
  }, []);

  // Cursor style
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.style.cursor =
        tool === "hline" || tool === "measure" || tool === "trendline" ? "crosshair" :
        tool === "eraser" ? "cell" : "";
    }
  }, [tool, containerRef]);

  return { hover };
}
