"use client";

import React, { useEffect, useReducer, type RefObject } from "react";
import { type IChartApi, type ISeriesApi } from "lightweight-charts";
import type { RectangleInProgress } from "@/hooks/chart/useRectangleTool";
import type { Candle } from "@/lib/binance/types";
import { timeToCoordinateExtended } from "@/lib/drawings/time-coordinate";

interface Props {
  chartRef: RefObject<IChartApi | null>;
  candleSeriesRef: RefObject<ISeriesApi<"Candlestick"> | null>;
  candlesRef: RefObject<Candle[]>;
  inProgress: RectangleInProgress | null;
  chartReady: boolean;
}

export const RectangleLayer = React.memo(function RectangleLayer({
  chartRef, candleSeriesRef, candlesRef, inProgress, chartReady,
}: Props) {
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.timeScale().subscribeVisibleLogicalRangeChange(forceUpdate);
    return () => chart.timeScale().unsubscribeVisibleLogicalRangeChange(forceUpdate);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartReady]);

  if (!inProgress) return null;

  const chart = chartRef.current;
  const series = candleSeriesRef.current;
  if (!chart || !series) return null;

  const getCoordinateForTime = (time: number): number | null =>
    timeToCoordinateExtended(chart, candlesRef.current, time);

  const aX = getCoordinateForTime(inProgress.a.time);
  const aY = series.priceToCoordinate(inProgress.a.price);
  const bX = getCoordinateForTime(inProgress.b.time);
  const bY = series.priceToCoordinate(inProgress.b.price);
  if (aX === null || aY === null || bX === null || bY === null) return null;

  let leftScaleWidth = 0;
  try {
    if (chart.options().leftPriceScale?.visible) {
      leftScaleWidth = chart.priceScale("left").width();
    }
  } catch {}

  const x1 = Math.min(aX, bX) + leftScaleWidth;
  const y1 = Math.min(aY, bY);
  const w = Math.abs(bX - aX);
  const h = Math.abs(bY - aY);

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
      style={{ overflow: "visible" }}
    >
      <rect
        x={x1} y={y1} width={w} height={h}
        fill="#2962ff" fillOpacity={0.1}
        stroke="#2962ff" strokeWidth={1} strokeDasharray="4,3"
      />
      <circle cx={x1} cy={y1} r={4} fill="#2962ff" />
      <circle cx={x1 + w} cy={y1 + h} r={3} fill="#2962ff" />
    </svg>
  );
});
