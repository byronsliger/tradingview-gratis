"use client";

import { useEffect, useState, type RefObject } from "react";
import type { IChartApi } from "lightweight-charts";
import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

/** Distance in px from the toggle's corner at which it becomes visible. */
const PROXIMITY_X = 220;
const PROXIMITY_Y = 90;

interface Props {
  containerRef: RefObject<HTMLDivElement | null>;
  chartRef: RefObject<IChartApi | null>;
  /** Bottom edge (px) of the main pane within the container. */
  mainPaneBottom: number;
}

/**
 * "log" price-scale toggle pinned to the bottom-right corner of the main
 * pane, just left of the price axis. Hidden until the cursor gets near the
 * corner, so it never obstructs the chart. Uses a mousemove listener instead
 * of CSS :hover because the hidden state must keep pointer-events disabled
 * to not block chart interaction.
 */
export function LogScaleToggle({ containerRef, chartRef, mainPaneBottom }: Props) {
  const logScale = useChartStore((s) => s.logScale);
  const setLogScale = useChartStore((s) => s.setLogScale);
  const [near, setNear] = useState(false);
  const [scaleWidth, setScaleWidth] = useState(70);

  // Measure the price axis width when the toggle becomes visible so the
  // button sits right next to the scale regardless of label length.
  useEffect(() => {
    if (!near) return;
    try {
      const w = chartRef.current?.priceScale("right").width();
      if (w) setScaleWidth(w);
    } catch {}
  }, [near, chartRef]);

  useEffect(() => {
    // Listen on document, not the chart container: the button is a sibling of
    // the container, so hovering the button itself would fire the container's
    // mouseleave and hide it right before the click lands.
    const onMove = (e: MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cornerY = r.top + mainPaneBottom;
      setNear(
        e.clientX > r.left &&
        e.clientX < r.right &&
        r.right - e.clientX < PROXIMITY_X &&
        cornerY - e.clientY < PROXIMITY_Y &&
        e.clientY < cornerY + 8,
      );
    };
    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
  }, [containerRef, mainPaneBottom]);

  if (mainPaneBottom <= 0) return null;

  return (
    <button
      onClick={() => setLogScale(!logScale)}
      title={logScale ? "Escala logarítmica (activa)" : "Escala logarítmica"}
      style={{ top: mainPaneBottom - 26, right: scaleWidth + 6 }}
      className={cn(
        "absolute z-30 rounded border border-tv-border bg-tv-panel px-1.5 py-0.5 text-[10px] font-medium leading-none shadow-sm transition-opacity",
        near ? "opacity-100" : "pointer-events-none opacity-0",
        logScale ? "text-[#2962ff]" : "text-tv-text-muted hover:text-tv-text",
      )}
    >
      log
    </button>
  );
}
