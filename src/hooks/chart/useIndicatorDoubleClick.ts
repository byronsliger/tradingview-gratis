"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { type IChartApi, type ISeriesApi, type SeriesType, type MouseEventParams } from "lightweight-charts";
import { useChartStore, type DrawingTool, type IndicatorKey } from "@/lib/store/chart-store";

type AnySeriesRef = RefObject<ISeriesApi<SeriesType> | null>;

interface SeriesRefs {
  ema20Ref: AnySeriesRef;
  ema50Ref: AnySeriesRef;
  ema200Ref: AnySeriesRef;
  rsiRef: AnySeriesRef;
  macdRef: AnySeriesRef;
  macdSignalRef: AnySeriesRef;
  macdHistRef: AnySeriesRef;
  sqzmomHistRef: AnySeriesRef;
  adxRef: AnySeriesRef;
  vrvpSeriesRef?: AnySeriesRef;
}

export function useIndicatorDoubleClick(
  chartRef: RefObject<IChartApi | null>,
  containerRef: RefObject<HTMLDivElement | null>,
  tool: DrawingTool,
  seriesRefs: SeriesRefs,
  paneOffsets: { top: number; height: number }[],
  seriesPaneIndices: Record<IndicatorKey, number>
): { selectedIndicatorKey: IndicatorKey | null } {
  const setSettingsTarget = useChartStore((s) => s.setSettingsTarget);
  const setSettingsTargetRef = useRef(setSettingsTarget);
  // eslint-disable-next-line react-hooks/refs
  setSettingsTargetRef.current = setSettingsTarget;

  const refsRef = useRef(seriesRefs);
  // eslint-disable-next-line react-hooks/refs
  refsRef.current = seriesRefs;

  const toolRef = useRef(tool);
  // eslint-disable-next-line react-hooks/refs
  toolRef.current = tool;

  const paneOffsetsRef = useRef(paneOffsets);
  // eslint-disable-next-line react-hooks/refs
  paneOffsetsRef.current = paneOffsets;
  
  const paneIndicesRef = useRef(seriesPaneIndices);
  // eslint-disable-next-line react-hooks/refs
  paneIndicesRef.current = seriesPaneIndices;

  const lastMouseParamRef = useRef<MouseEventParams | null>(null);
  const [selectedIndicatorKey, setSelectedIndicatorKey] = useState<IndicatorKey | null>(null);
  const selectedRef = useRef<IndicatorKey | null>(null);
  // eslint-disable-next-line react-hooks/refs
  selectedRef.current = selectedIndicatorKey;

  const getKey = (series: ISeriesApi<SeriesType>): IndicatorKey | null => {
    const r = refsRef.current;
    if (series === r.ema20Ref.current) return "ema20";
    if (series === r.ema50Ref.current) return "ema50";
    if (series === r.ema200Ref.current) return "ema200";
    if (series === r.rsiRef.current) return "rsi";
    if (
      series === r.macdRef.current ||
      series === r.macdSignalRef.current ||
      series === r.macdHistRef.current
    ) return "macd";
    if (series === r.sqzmomHistRef.current) return "sqzmom";
    if (series === r.adxRef.current) return "adx";
    if (r.vrvpSeriesRef && series === r.vrvpSeriesRef.current) return "vrvp";
    return null;
  };
  const getKeyRef = useRef(getKey);
  // eslint-disable-next-line react-hooks/refs
  getKeyRef.current = getKey;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const chart = chartRef.current;
    const container = containerRef.current;
    if (!chart || !container) return;

    const getHitSeries = (param: MouseEventParams): ISeriesApi<SeriesType> | null => {
      if (param.hoveredSeries) return param.hoveredSeries;
      if (!param.point || !param.seriesData) return null;
      
      const y = param.point.y;
      const offsets = paneOffsetsRef.current;
      const indices = paneIndicesRef.current;
      
      const activePaneIndex = offsets.findIndex(p => y >= p.top && y <= p.top + p.height);
      if (activePaneIndex === -1) return null;
      
      const activePane = offsets[activePaneIndex];
      const localY = y - activePane.top; 
      
      let closestSeries: ISeriesApi<SeriesType> | null = null;
      let minDistance = 20; 

      param.seriesData.forEach((data, series) => {
        const key = getKeyRef.current(series);
        if (!key) return; 

        const seriesPaneIdx = indices[key];
        if (seriesPaneIdx !== activePaneIndex) return;

        let price: number | undefined;
        if (data && 'value' in data) {
          price = (data as any).value;
        } else if (data && 'close' in data) {
          price = (data as any).close;
        }

        if (price !== undefined) {
          const seriesY = series.priceToCoordinate(price);
          if (seriesY !== null) {
            const distance = Math.abs(seriesY - localY);
            if (distance < minDistance) {
              minDistance = distance;
              closestSeries = series;
            }
          }
        }
      });

      return closestSeries;
    };

    const crosshairHandler = (param: MouseEventParams) => {
      lastMouseParamRef.current = param;
      
      if (toolRef.current !== "cursor") return;
      
      const hovered = getHitSeries(param);
      const key = hovered ? getKeyRef.current(hovered) : null;
      
      if (key) {
        if (!document.getElementById("tv-force-pointer")) {
          const style = document.createElement("style");
          style.id = "tv-force-pointer";
          style.innerHTML = ".force-pointer, .force-pointer * { cursor: pointer !important; }";
          document.head.appendChild(style);
        }
        container.classList.add("force-pointer");
      } else {
        container.classList.remove("force-pointer");
      }
    };

    const clickHandler = (param: MouseEventParams) => {
      lastMouseParamRef.current = param;
      
      const hovered = getHitSeries(param);
      if (!hovered) {
        setSelectedIndicatorKey(null);
        return;
      }
      
      const key = getKeyRef.current(hovered);
      setSelectedIndicatorKey(key || null);
    };

    const dblClickHandler = (e: MouseEvent) => {
      if (!lastMouseParamRef.current) return;
      const hovered = getHitSeries(lastMouseParamRef.current);
      if (hovered) {
        const key = getKeyRef.current(hovered);
        if (key) {
          setSettingsTargetRef.current(key);
        }
      }
    };

    chart.subscribeCrosshairMove(crosshairHandler);
    chart.subscribeClick(clickHandler);
    container.addEventListener("dblclick", dblClickHandler);

    return () => {
      chart.unsubscribeCrosshairMove(crosshairHandler);
      chart.unsubscribeClick(clickHandler);
      container.removeEventListener("dblclick", dblClickHandler);
    };
  }, []);

  return { selectedIndicatorKey };
}
