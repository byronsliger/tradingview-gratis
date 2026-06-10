"use client";

import React, { useEffect, useReducer, type RefObject } from "react";
import { type IChartApi, type ISeriesApi } from "lightweight-charts";
import type { TrendLineInProgress } from "@/hooks/chart/useTrendLineTool";
import { timeToCoordinateExtended } from "@/lib/drawings/time-coordinate";

interface Props {
  chartRef: RefObject<IChartApi | null>;
  candleSeriesRef: RefObject<ISeriesApi<"Candlestick"> | null>;
  candlesRef: RefObject<import("@/lib/binance/types").Candle[]>;
  inProgress: TrendLineInProgress | null;
  chartReady: boolean;
}

export const TrendLinesLayer = React.memo(function TrendLinesLayer({
  chartRef, candleSeriesRef, candlesRef, inProgress, chartReady,
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

  const getCoordinateForTime = (time: number): number | null =>
    timeToCoordinateExtended(chart, candlesRef.current, time);

  const aX = getCoordinateForTime(inProgress.a.time as number);
  const aY = series.priceToCoordinate(inProgress.a.price);
  const bX = getCoordinateForTime(inProgress.b.time as number);
  const bY = series.priceToCoordinate(inProgress.b.price);
  if (aX === null || aY === null || bX === null || bY === null) return null;

  let leftScaleWidth = 0;
  try {
    if (chart.options().leftPriceScale?.visible) {
      leftScaleWidth = chart.priceScale("left").width();
    }
  } catch {
    // Ignore internal lightweight-charts initialization errors
  }
  const absAX = aX + leftScaleWidth;
  const absBX = bX + leftScaleWidth;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
      style={{ overflow: "visible" }}
    >
      <line
        x1={absAX} y1={aY} x2={absBX} y2={bY}
        stroke="#2962ff"
        strokeWidth={1}
        strokeDasharray="4,3"
      />
      <circle cx={absAX} cy={aY} r={4} fill="#2962ff" />
      <circle cx={absBX} cy={bY} r={3} fill="#2962ff" />
    </svg>
  );
});
