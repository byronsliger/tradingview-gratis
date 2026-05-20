"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import type { IChartApi } from "lightweight-charts";

export interface PaneOffset {
  top: number;
  height: number;
}

export function usePaneLayout(
  chartRef: RefObject<IChartApi | null>,
  containerRef: RefObject<HTMLDivElement | null>,
) {
  const [paneOffsets, setPaneOffsets] = useState<PaneOffset[]>([]);

  const recomputePaneOffsets = useCallback(() => {
    if (!chartRef.current) return;
    const panes = chartRef.current.panes();
    let top = 0;
    const offsets: PaneOffset[] = panes.map((p) => {
      const h = p.getHeight();
      const o = { top, height: h };
      top += h;
      return o;
    });
    setPaneOffsets(offsets);
  }, [chartRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => recomputePaneOffsets());
    });
    ro.observe(el);
    recomputePaneOffsets();
    return () => ro.disconnect();
  }, [containerRef, recomputePaneOffsets]);

  return { paneOffsets, recomputePaneOffsets };
}
