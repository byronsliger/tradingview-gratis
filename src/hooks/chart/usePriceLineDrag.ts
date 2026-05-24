"use client";

import { useEffect, useRef, type RefObject } from "react";
import { type ISeriesApi } from "lightweight-charts";
import { useChartStore, type DrawingTool } from "@/lib/store/chart-store";

const SNAP_PX = 10;
const DRAG_THRESHOLD_PX = 4;
const DBLCLICK_MS = 400;

export function usePriceLineDrag(
  containerRef: RefObject<HTMLDivElement | null>,
  candleSeriesRef: RefObject<ISeriesApi<"Candlestick"> | null>,
  symbol: string,
  tool: DrawingTool,
): void {
  const updatePriceLine = useChartStore((s) => s.updatePriceLine);
  const removePriceLine = useChartStore((s) => s.removePriceLine);
  const priceLines = useChartStore((s) => s.priceLines);
  const setPriceLineEditTarget = useChartStore((s) => s.setPriceLineEditTarget);
  const setSelectedPriceLineId = useChartStore((s) => s.setSelectedPriceLineId);
  const selectedPriceLineId = useChartStore((s) => s.selectedPriceLineId);
  const setSelectedDrawingId = useChartStore((s) => s.setSelectedDrawingId);

  const priceLinesRef = useRef(priceLines);
  // eslint-disable-next-line react-hooks/refs
  priceLinesRef.current = priceLines;
  const updatePriceLineRef = useRef(updatePriceLine);
  // eslint-disable-next-line react-hooks/refs
  updatePriceLineRef.current = updatePriceLine;
  const removePriceLineRef = useRef(removePriceLine);
  // eslint-disable-next-line react-hooks/refs
  removePriceLineRef.current = removePriceLine;
  const setSelectedPriceLineIdRef = useRef(setSelectedPriceLineId);
  // eslint-disable-next-line react-hooks/refs
  setSelectedPriceLineIdRef.current = setSelectedPriceLineId;
  const selectedPriceLineIdRef = useRef(selectedPriceLineId);
  // eslint-disable-next-line react-hooks/refs
  selectedPriceLineIdRef.current = selectedPriceLineId;
  const setSelectedDrawingIdRef = useRef(setSelectedDrawingId);
  // eslint-disable-next-line react-hooks/refs
  setSelectedDrawingIdRef.current = setSelectedDrawingId;
  const setPriceLineEditTargetRef = useRef(setPriceLineEditTarget);
  // eslint-disable-next-line react-hooks/refs
  setPriceLineEditTargetRef.current = setPriceLineEditTarget;
  const symbolRef = useRef(symbol);
  // eslint-disable-next-line react-hooks/refs
  symbolRef.current = symbol;
  const toolRef = useRef(tool);
  // eslint-disable-next-line react-hooks/refs
  toolRef.current = tool;

  // Drag state
  const draggingIdRef = useRef<string | null>(null);
  // Pending: pointerdown detected near a line, waiting to confirm it's a drag (not dblclick)
  const pendingRef = useRef<{ id: string; startX: number; startY: number } | null>(null);
  // Double-click detection
  const lastDownRef = useRef<{ id: string; time: number } | null>(null);
  // Currently hovered line (for Delete key)
  const hoveredLineIdRef = useRef<string | null>(null);

  // Clear selection when symbol changes
  useEffect(() => {
    setSelectedPriceLineId(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const getY = (e: PointerEvent) =>
      e.clientY - container.getBoundingClientRect().top;

    const findNearbyLine = (y: number): string | null => {
      const series = candleSeriesRef.current;
      if (!series) return null;
      let closestId: string | null = null;
      let closestDist = Infinity;
      for (const pl of priceLinesRef.current) {
        if (pl.symbol !== symbolRef.current) continue;
        const lineY = series.priceToCoordinate(pl.price);
        if (lineY === null) continue;
        const dist = Math.abs(lineY - y);
        if (dist < SNAP_PX && dist < closestDist) {
          closestDist = dist;
          closestId = pl.id;
        }
      }
      return closestId;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (toolRef.current !== "cursor") return;
      const series = candleSeriesRef.current;
      if (!series) return;
      const y = getY(e);

      // If we have an active drag, update price
      if (draggingIdRef.current) {
        e.stopImmediatePropagation();
        const price = series.coordinateToPrice(y);
        if (price !== null && isFinite(price)) {
          updatePriceLineRef.current(draggingIdRef.current, price);
        }
        return;
      }

      // If we have a pending drag, check if moved enough to commit
      if (pendingRef.current) {
        const dx = Math.abs(e.clientX - pendingRef.current.startX);
        const dy = Math.abs(e.clientY - pendingRef.current.startY);
        if (dx > DRAG_THRESHOLD_PX || dy > DRAG_THRESHOLD_PX) {
          draggingIdRef.current = pendingRef.current.id;
          pendingRef.current = null;
          container.style.cursor = "ns-resize";
        }
        e.stopImmediatePropagation();
        return;
      }

      // Hover: show ns-resize cursor near lines, track for Delete key
      const nearby = findNearbyLine(y);
      hoveredLineIdRef.current = nearby;
      if (nearby) {
        container.style.cursor = "ns-resize";
      } else if (container.style.cursor === "ns-resize") {
        // Only clear cursor if we set it — don't override "move"/"crosshair" from other hooks
        container.style.cursor = "";
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (toolRef.current !== "cursor") return;
      const id = findNearbyLine(getY(e));

      if (!id) {
        // Clicked on empty chart → deselect both price lines and drawings
        if (selectedPriceLineIdRef.current) {
          setSelectedPriceLineIdRef.current(null);
        }
        setSelectedDrawingIdRef.current(null);
        return;
      }

      // Always intercept when near a line
      e.stopImmediatePropagation();
      e.preventDefault();

      const now = Date.now();
      const last = lastDownRef.current;
      if (last?.id === id && now - last.time < DBLCLICK_MS) {
        // Double-click: open settings dialog
        lastDownRef.current = null;
        pendingRef.current = null;
        draggingIdRef.current = null;
        try { container.releasePointerCapture(e.pointerId); } catch {}
        setTimeout(() => setPriceLineEditTargetRef.current(id), 0);
        return;
      }
      lastDownRef.current = { id, time: now };

      // Single click: select the line + start pending drag
      setSelectedPriceLineIdRef.current(id);
      pendingRef.current = { id, startX: e.clientX, startY: e.clientY };
      try { container.setPointerCapture(e.pointerId); } catch {}
      container.style.cursor = "ns-resize";
    };

    const onPointerUp = (e: PointerEvent) => {
      const wasDragging = !!draggingIdRef.current;
      const wasPending = !!pendingRef.current;
      draggingIdRef.current = null;
      pendingRef.current = null;
      try { container.releasePointerCapture(e.pointerId); } catch {}
      if (wasDragging || toolRef.current !== "cursor") {
        container.style.cursor = "";
      }
      if (wasDragging || wasPending) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (toolRef.current !== "cursor") return;
      if (e.key === "Escape") {
        setSelectedPriceLineIdRef.current(null);
        return;
      }
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      // Priority: dragging > selected > hovered
      const id = draggingIdRef.current ?? selectedPriceLineIdRef.current ?? hoveredLineIdRef.current;
      if (!id) return;
      e.preventDefault();
      draggingIdRef.current = null;
      pendingRef.current = null;
      hoveredLineIdRef.current = null;
      setSelectedPriceLineIdRef.current(null);
      container.style.cursor = "";
      removePriceLineRef.current(id);
    };

    // capture: true → our handlers run BEFORE the chart's canvas handlers
    container.addEventListener("pointermove", onPointerMove, true);
    container.addEventListener("pointerdown", onPointerDown, true);
    container.addEventListener("pointerup", onPointerUp, true);
    container.addEventListener("pointercancel", onPointerUp, true);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      container.removeEventListener("pointermove", onPointerMove, true);
      container.removeEventListener("pointerdown", onPointerDown, true);
      container.removeEventListener("pointerup", onPointerUp, true);
      container.removeEventListener("pointercancel", onPointerUp, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
