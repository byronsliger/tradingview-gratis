"use client";

import React, { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { MeasureOverlay } from "@/components/chart/MeasureOverlay";
import type { Candle } from "@/lib/binance/types";
import type { DrawingTool } from "@/lib/store/chart-store";

export interface MeasurePoint {
  time: number;
  price: number;
}

export interface MeasureState {
  phase: "idle" | "placing" | "done";
  a: MeasurePoint | null;
  b: MeasurePoint | null;
}

const INITIAL_MEASURE: MeasureState = { phase: "idle", a: null, b: null };

function durationLabel(aTime: number, bTime: number): string {
  const diff = Math.abs(bTime - aTime);
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

export function useMeasureTool(
  chartRef: RefObject<IChartApi | null>,
  candleSeriesRef: RefObject<ISeriesApi<"Candlestick"> | null>,
  candlesRef: RefObject<Candle[]>,
  tool: DrawingTool,
): {
  measure: MeasureState;
  setMeasure: Dispatch<SetStateAction<MeasureState>>;
  measureRef: RefObject<MeasureState>;
  measureRender: React.ReactNode;
} {
  const [measure, setMeasure] = useState<MeasureState>(INITIAL_MEASURE);
  const measureRef = useRef(measure);
  // eslint-disable-next-line react-hooks/refs
  measureRef.current = measure;
  const [renderTick, setRenderTick] = useState(0);

  // Subscribe to range changes to keep pixel coords in sync
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!chartRef.current) return;
    const handler = () => setRenderTick((t) => t + 1);
    chartRef.current.timeScale().subscribeVisibleTimeRangeChange(handler);
    chartRef.current.timeScale().subscribeVisibleLogicalRangeChange(handler);
    return () => {
      chartRef.current?.timeScale().unsubscribeVisibleTimeRangeChange(handler);
      chartRef.current?.timeScale().unsubscribeVisibleLogicalRangeChange(handler);
    };
  }, []);

  useEffect(() => {
    if (tool !== "measure") {
      setTimeout(() => setMeasure(INITIAL_MEASURE), 0);
    }
  }, [tool]);

  let measureRender: React.ReactNode = null;
  // eslint-disable-next-line react-hooks/refs
  if (measure.a && measure.b && chartRef.current && candleSeriesRef.current) {
    // eslint-disable-next-line react-hooks/refs
    const ts = chartRef.current.timeScale();
    const aX = ts.timeToCoordinate(measure.a.time as UTCTimestamp);
    const bX = ts.timeToCoordinate(measure.b.time as UTCTimestamp);
    // eslint-disable-next-line react-hooks/refs
    const aY = candleSeriesRef.current.priceToCoordinate(measure.a.price);
    // eslint-disable-next-line react-hooks/refs
    const bY = candleSeriesRef.current.priceToCoordinate(measure.b.price);

    if (aX !== null && bX !== null && aY !== null && bY !== null) {
      let leftScaleWidth = 0;
      try {
        if (chartRef.current.options().leftPriceScale?.visible) {
          leftScaleWidth = chartRef.current.priceScale("left").width();
        }
      } catch (e) {
        // Ignore internal lightweight-charts initialization errors
      }
      const absAX = aX + leftScaleWidth;
      const absBX = bX + leftScaleWidth;

      const priceDiff = measure.b.price - measure.a.price;
      const pctChange = measure.a.price === 0 ? 0 : (priceDiff / measure.a.price) * 100;
      const isUp = priceDiff >= 0;
      const start = Math.min(measure.a.time, measure.b.time);
      const end = Math.max(measure.a.time, measure.b.time);
      // eslint-disable-next-line react-hooks/refs
      const inRange = candlesRef.current.filter((c) => c.time >= start && c.time <= end);
      const bars = inRange.length;
      const volume = inRange.reduce((s, c) => s + c.volume, 0);
      const dur = durationLabel(measure.a.time, measure.b.time);

      measureRender = (
        <MeasureOverlay
          aX={absAX}
          aY={aY}
          bX={absBX}
          bY={bY}
          priceDiff={priceDiff}
          pctChange={pctChange}
          bars={bars}
          volume={volume}
          durationText={dur}
          isUp={isUp}
          isPreview={measure.phase === "placing"}
        />
      );
    }
  }
  void renderTick;

  return { measure, setMeasure, measureRef, measureRender };
}
