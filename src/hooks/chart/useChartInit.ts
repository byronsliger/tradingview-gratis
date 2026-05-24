"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createChart, CrosshairMode, type IChartApi } from "lightweight-charts";
import { getChartColors, TV_COLORS } from "@/lib/chart/chart-colors";

export function useChartInit(
  containerRef: RefObject<HTMLDivElement | null>,
  theme: "dark" | "light",
): { chartRef: RefObject<IChartApi | null>; chartReady: boolean } {
  const chartRef = useRef<IChartApi | null>(null);
  const [chartReady, setChartReady] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!containerRef.current) return;
    const c = TV_COLORS;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: c.bg },
        textColor: c.text,
        fontFamily: "var(--font-sans), Inter, system-ui, sans-serif",
        fontSize: window.innerWidth < 768 ? 6 : 11,
        panes: { separatorColor: c.border, separatorHoverColor: c.border },
      },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: c.textMuted, width: 1, style: 3, labelBackgroundColor: c.panel },
        horzLine: { color: c.textMuted, width: 1, style: 3, labelBackgroundColor: c.panel },
      },
      rightPriceScale: { borderColor: c.border, textColor: c.textMuted },
      leftPriceScale: { borderColor: c.border, textColor: c.textMuted, visible: false },
      timeScale: {
        borderColor: c.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 8,
      },
      autoSize: true,
    });
    chartRef.current = chart;
    setChartReady(true);
    return () => {
      chart.remove();
      chartRef.current = null;
      setChartReady(false);
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    const c = getChartColors(theme);
    chartRef.current.applyOptions({
      layout: {
        background: { color: c.bg },
        textColor: c.text,
        panes: { separatorColor: c.border, separatorHoverColor: c.border },
      },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      crosshair: {
        vertLine: { color: c.textMuted, labelBackgroundColor: c.panel },
        horzLine: { color: c.textMuted, labelBackgroundColor: c.panel },
      },
      rightPriceScale: { borderColor: c.border, textColor: c.textMuted },
      leftPriceScale: { borderColor: c.border, textColor: c.textMuted },
      timeScale: { borderColor: c.border },
    });
  }, [theme]);

  return { chartRef, chartReady };
}
