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
  sqzmomDotRef?: AnySeriesRef;
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
  const lastTouchRef = useRef<{ time: number } | null>(null);
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
    if (
      series === r.sqzmomHistRef.current ||
      (r.sqzmomDotRef && series === r.sqzmomDotRef.current)
    ) return "sqzmom";
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

    const getHitSeries = (x: number, y: number, param: MouseEventParams): ISeriesApi<SeriesType> | null => {
      if (!param.seriesData) return null;
      
      const indices = paneIndicesRef.current;
      
      const panes = chart.panes();
      let activePaneIndex = -1;
      let currentTop = 0;
      let activePaneTop = 0;
      
      for (let i = 0; i < panes.length; i++) {
        const h = panes[i].getHeight();
        if (y >= currentTop && y <= currentTop + h) {
          activePaneIndex = i;
          activePaneTop = currentTop;
          break;
        }
        currentTop += h;
      }
      
      if (activePaneIndex === -1) return null;
      const localY = y - activePaneTop; 
      
      let closestSeries: ISeriesApi<SeriesType> | null = null;
      let minDistance = 20; 

      param.seriesData.forEach((data, series) => {
        const key = getKeyRef.current(series);
        if (!key) return; 

        const seriesPaneIdx = indices[key];
        if (seriesPaneIdx !== activePaneIndex) return;

        let price: number | undefined;
        let vrvpData: any = undefined;
        if (data && 'value' in data) {
          price = (data as any).value;
        } else if (data && 'close' in data) {
          price = (data as any).close;
        } else if (data && 'vrvp' in data) {
          vrvpData = data;
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

      // Special hit-test for VRVP since its data is only at the last candle
      const vrvpSeries = refsRef.current.vrvpSeriesRef?.current;
      if (vrvpSeries) {
        const seriesPaneIdx = indices["vrvp"];
        if (seriesPaneIdx === activePaneIndex) {
          const allData = typeof (vrvpSeries as any).data === "function" ? (vrvpSeries as any).data() : [];
          if (allData && allData.length > 0) {
            const vrvpData = allData[allData.length - 1];
            if (vrvpData && vrvpData.vrvp && vrvpData.vrvp.bins && vrvpData.vrvp.bins.length > 0) {
              const minPrice = Math.min(...vrvpData.vrvp.bins.map((b: any) => b.low));
              const maxPrice = Math.max(...vrvpData.vrvp.bins.map((b: any) => b.high));
              const y1 = vrvpSeries.priceToCoordinate(minPrice);
              const y2 = vrvpSeries.priceToCoordinate(maxPrice);
              if (y1 !== null && y2 !== null) {
                const top = Math.min(y1, y2);
                const bottom = Math.max(y1, y2);
                if (localY >= top && localY <= bottom) {
                  const rect = containerRef.current?.getBoundingClientRect();
                  if (rect) {
                    const chartWidth = rect.width - 60;
                    const profileWidth = chartWidth * (vrvpData.widthPercent / 100);
                    let hit = false;
                    if (vrvpData.placement === "Right" && x > chartWidth - profileWidth && x < chartWidth) {
                      hit = true;
                    } else if (vrvpData.placement === "Left" && x < profileWidth && x > 0) {
                      hit = true;
                    }
                    if (hit) {
                      closestSeries = vrvpSeries;
                    }
                  }
                }
              }
            }
          }
        }
      }

      return closestSeries;
    };

    const crosshairHandler = (param: MouseEventParams) => {
      lastMouseParamRef.current = param;
      
      if (!param.point) {
        setSelectedIndicatorKey(null);
        return;
      }
    };

    const clickHandler = (param: MouseEventParams) => {
      lastMouseParamRef.current = param;
      
      if (!param.point) {
        setSelectedIndicatorKey(null);
        return;
      }
      
      const hovered = getHitSeries(param.point.x, param.point.y, param);
      if (!hovered) {
        setSelectedIndicatorKey(null);
        return;
      }
      
      const key = getKeyRef.current(hovered);
      setSelectedIndicatorKey(key || null);
    };

    const getExactPos = (e: MouseEvent | PointerEvent) => {
      const container = containerRef.current;
      if (!container) return null;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      if (x > rect.width - 60 || y > rect.height - 30) return null;
      return { x, y };
    };

    const dblClickHandler = (e: MouseEvent) => {
      const pos = getExactPos(e);
      if (!pos || !lastMouseParamRef.current) return;
      
      const hovered = getHitSeries(pos.x, pos.y, lastMouseParamRef.current);
      if (hovered) {
        const key = getKeyRef.current(hovered);
        if (key) {
          setSettingsTargetRef.current(key);
        }
      }
    };

    const pointerUpHandler = (e: PointerEvent) => {
      if (toolRef.current !== "cursor") return;
      
      const pos = getExactPos(e);
      if (!pos) return;
      
      const now = Date.now();
      const last = lastTouchRef.current;
      
      if (last && now - last.time < 350) {
        if (lastMouseParamRef.current) {
          const hovered = getHitSeries(pos.x, pos.y, lastMouseParamRef.current);
          if (hovered) {
            const key = getKeyRef.current(hovered);
            if (key) {
              setSettingsTargetRef.current(key);
              e.stopPropagation();
            }
          }
        }
        lastTouchRef.current = null;
      } else {
        lastTouchRef.current = { time: now };
      }
    };

    const mouseMoveHandler = (e: MouseEvent) => {
      if (toolRef.current !== "cursor") return;
      
      const pos = getExactPos(e);
      if (!pos || !lastMouseParamRef.current) {
        container.classList.remove("force-pointer");
        return;
      }
      
      const hovered = getHitSeries(pos.x, pos.y, lastMouseParamRef.current);
      if (hovered && getKeyRef.current(hovered)) {
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

    chart.subscribeCrosshairMove(crosshairHandler);
    chart.subscribeClick(clickHandler);
    
    container.addEventListener("dblclick", dblClickHandler);
    container.addEventListener("pointerup", pointerUpHandler, { capture: true });
    container.addEventListener("mousemove", mouseMoveHandler);

    return () => {
      chart.unsubscribeCrosshairMove(crosshairHandler);
      chart.unsubscribeClick(clickHandler);
      container.removeEventListener("dblclick", dblClickHandler);
      container.removeEventListener("pointerup", pointerUpHandler, { capture: true });
      container.removeEventListener("mousemove", mouseMoveHandler);
    };
  }, []);

  return { selectedIndicatorKey };
}
