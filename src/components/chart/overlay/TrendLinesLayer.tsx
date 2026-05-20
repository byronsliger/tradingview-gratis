"use client";

import React, { useEffect, useReducer, type RefObject } from "react";
import { type IChartApi, type ISeriesApi, type Time } from "lightweight-charts";
import type { TrendLineInProgress } from "@/hooks/chart/useTrendLineTool";

interface Props {
  chartRef: RefObject<IChartApi | null>;
  candleSeriesRef: RefObject<ISeriesApi<"Candlestick"> | null>;
  inProgress: TrendLineInProgress | null;
  chartReady: boolean;
}

export const TrendLinesLayer = React.memo(function TrendLinesLayer({
  chartRef, candleSeriesRef, inProgress, chartReady,
}: Props) {
  // Force re-render on pan/zoom so the in-progress preview stays aligned
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

  const aX = chart.timeScale().timeToCoordinate(inProgress.a.time as Time);
  const aY = series.priceToCoordinate(inProgress.a.price);
  const bX = chart.timeScale().timeToCoordinate(inProgress.b.time as Time);
  const bY = series.priceToCoordinate(inProgress.b.price);
  if (aX === null || aY === null || bX === null || bY === null) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
      style={{ overflow: "visible" }}
    >
      <line
        x1={aX} y1={aY} x2={bX} y2={bY}
        stroke="#2962ff"
        strokeWidth={1}
        strokeDasharray="4,3"
      />
      <circle cx={aX} cy={aY} r={4} fill="#2962ff" />
      <circle cx={bX} cy={bY} r={3} fill="#2962ff" />
    </svg>
  );
});
