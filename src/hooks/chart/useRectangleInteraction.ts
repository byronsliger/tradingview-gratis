"use client";

import { useEffect, useRef, type RefObject } from "react";
import { type IChartApi } from "lightweight-charts";
import { useChartStore, type DrawingTool } from "@/lib/store/chart-store";
import type { RectangleDrawing } from "@/lib/drawings/types";
import type { RectanglePrimitive, RectHandle } from "@/lib/drawings/primitives/RectanglePrimitive";
import type { Candle } from "@/lib/binance/types";
import { registerLegacyEventBlockers, toggleChartScroll } from "@/lib/chart/event-utils";

const DRAG_THRESHOLD_PX = 4;
const DBLCLICK_MS = 400;

type DragState =
  | { type: "none" }
  | { type: "body"; id: string; startPx: number; startPy: number; ax: number; ay: number; bx: number; by: number }
  | { type: "corner"; id: string; handle: RectHandle };

export function useRectangleInteraction(
  containerRef: RefObject<HTMLDivElement | null>,
  chartRef: RefObject<IChartApi | null>,
  primitivesRef: RefObject<Map<string, RectanglePrimitive>>,
  candlesRef: RefObject<Candle[]>,
  symbol: string,
  tool: DrawingTool,
): void {
  const updateDrawing = useChartStore((s) => s.updateDrawing);
  const removeDrawing = useChartStore((s) => s.removeDrawing);
  const selectedDrawingId = useChartStore((s) => s.selectedDrawingId);
  const setSelectedDrawingId = useChartStore((s) => s.setSelectedDrawingId);
  const setDrawingEditTarget = useChartStore((s) => s.setDrawingEditTarget);
  const drawings = useChartStore((s) => s.drawings);

  const toolRef = useRef(tool);
  // eslint-disable-next-line react-hooks/refs
  toolRef.current = tool;
  const updateDrawingRef = useRef(updateDrawing);
  // eslint-disable-next-line react-hooks/refs
  updateDrawingRef.current = updateDrawing;
  const removeDrawingRef = useRef(removeDrawing);
  // eslint-disable-next-line react-hooks/refs
  removeDrawingRef.current = removeDrawing;
  const selectedIdRef = useRef(selectedDrawingId);
  // eslint-disable-next-line react-hooks/refs
  selectedIdRef.current = selectedDrawingId;
  const setSelectedRef = useRef(setSelectedDrawingId);
  // eslint-disable-next-line react-hooks/refs
  setSelectedRef.current = setSelectedDrawingId;
  const setEditTargetRef = useRef(setDrawingEditTarget);
  // eslint-disable-next-line react-hooks/refs
  setEditTargetRef.current = setDrawingEditTarget;
  const drawingsRef = useRef(drawings);
  // eslint-disable-next-line react-hooks/refs
  drawingsRef.current = drawings;

  const dragRef = useRef<DragState>({ type: "none" });
  const pendingRef = useRef<{
    id: string; startClientX: number; startClientY: number;
    ax: number; ay: number; bx: number; by: number;
  } | null>(null);
  const lastDownRef = useRef<{ id: string; time: number } | null>(null);
  const hoveredIdRef = useRef<string | null>(null);

  useEffect(() => {
    setSelectedDrawingId(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const getCursorPos = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      let leftScaleWidth = 0;
      try {
        if (chartRef.current?.options().leftPriceScale?.visible) {
          leftScaleWidth = chartRef.current.priceScale("left").width();
        }
      } catch {}
      return { px: e.clientX - rect.left - leftScaleWidth, py: e.clientY - rect.top };
    };

    const extrapolatePoint = (px: number, py: number, prim: RectanglePrimitive) => {
      if (!chartRef.current || !prim._series) return null;
      const price = prim._series.coordinateToPrice(py);
      if (price === null || !isFinite(price)) return null;
      const time = chartRef.current.timeScale().coordinateToTime(px);
      if (time !== null) return { time: time as number, price };
      const logical = chartRef.current.timeScale().coordinateToLogical(px);
      if (logical === null) return null;
      const candles = candlesRef.current;
      if (!candles || candles.length === 0) return null;
      const maxIdx = candles.length - 1;
      const interval = maxIdx >= 1 ? candles[maxIdx].time - candles[maxIdx - 1].time : 60;
      const li = Math.round(logical);
      let extTime: number;
      if (li >= 0 && li <= maxIdx) extTime = candles[li].time;
      else if (li < 0) extTime = candles[0].time - Math.abs(li) * interval;
      else extTime = candles[maxIdx].time + (li - maxIdx) * interval;
      return { time: extTime, price };
    };

    const updateCorner = (id: string, handle: RectHandle, newTime: number, newPrice: number) => {
      const d = drawingsRef.current.find((x) => x.id === id && x.type === "rectangle") as RectangleDrawing | undefined;
      if (!d) return;
      const { a, b } = d;
      const aIsLeft = a.time <= b.time;
      const aIsTop = a.price >= b.price;

      const newA = { ...a };
      const newB = { ...b };

      if (handle === "tl") {
        if (aIsLeft) newA.time = newTime; else newB.time = newTime;
        if (aIsTop) newA.price = newPrice; else newB.price = newPrice;
      } else if (handle === "tr") {
        if (!aIsLeft) newA.time = newTime; else newB.time = newTime;
        if (aIsTop) newA.price = newPrice; else newB.price = newPrice;
      } else if (handle === "bl") {
        if (aIsLeft) newA.time = newTime; else newB.time = newTime;
        if (!aIsTop) newA.price = newPrice; else newB.price = newPrice;
      } else {
        if (!aIsLeft) newA.time = newTime; else newB.time = newTime;
        if (!aIsTop) newA.price = newPrice; else newB.price = newPrice;
      }

      updateDrawingRef.current(id, { a: newA, b: newB });
    };

    const findHit = (px: number, py: number) => {
      const primitives = primitivesRef.current;
      const selId = selectedIdRef.current;
      const width = container.clientWidth;

      if (selId) {
        const prim = primitives.get(selId);
        if (prim) {
          const ep = prim.testEndpoint(px, py);
          if (ep) {
            return { type: "corner" as const, id: selId, handle: ep };
          }
        }
      }

      for (const [id, prim] of primitives) {
        if (prim.testHit(px, py, width)) {
          const ep = prim.getEndpointPixels();
          if (!ep) continue;
          return { type: "body" as const, id, ax: ep.ax, ay: ep.ay, bx: ep.bx, by: ep.by };
        }
      }
      return null;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (toolRef.current !== "cursor") return;
      const { px, py } = getCursorPos(e);
      const drag = dragRef.current;

      if (drag.type === "body") {
        e.stopImmediatePropagation();
        const dx = px - drag.startPx;
        const dy = py - drag.startPy;
        const prim = primitivesRef.current.get(drag.id);
        if (!prim) return;
        const newA = extrapolatePoint(drag.ax + dx, drag.ay + dy, prim);
        const newB = extrapolatePoint(drag.bx + dx, drag.by + dy, prim);
        if (!newA || !newB) return;
        updateDrawingRef.current(drag.id, { a: newA, b: newB });
        return;
      }

      if (drag.type === "corner") {
        e.stopImmediatePropagation();
        const prim = primitivesRef.current.get(drag.id);
        if (!prim) return;
        const pt = extrapolatePoint(px, py, prim);
        if (!pt) return;
        updateCorner(drag.id, drag.handle, pt.time, pt.price);
        return;
      }

      if (pendingRef.current) {
        const p = pendingRef.current;
        const dx = Math.abs(e.clientX - p.startClientX);
        const dy = Math.abs(e.clientY - p.startClientY);
        if (dx > DRAG_THRESHOLD_PX || dy > DRAG_THRESHOLD_PX) {
          dragRef.current = {
            type: "body", id: p.id,
            startPx: px - (e.clientX - p.startClientX),
            startPy: py - (e.clientY - p.startClientY),
            ax: p.ax, ay: p.ay, bx: p.bx, by: p.by,
          };
          pendingRef.current = null;
          container.style.cursor = "move";
        }
        e.stopImmediatePropagation();
        return;
      }

      const hit = findHit(px, py);
      if (hit) {
        hoveredIdRef.current = hit.id;
        container.style.cursor = hit.type === "corner" ? "crosshair" : "move";
        toggleChartScroll(chartRef.current, false);
      } else {
        hoveredIdRef.current = null;
        container.style.cursor = "";
        if (dragRef.current.type === "none" && pendingRef.current === null) {
          toggleChartScroll(chartRef.current, true);
        }
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (toolRef.current !== "cursor") return;
      const { px, py } = getCursorPos(e);
      const hit = findHit(px, py);
      if (!hit) return;

      e.stopImmediatePropagation();
      e.preventDefault();

      const now = Date.now();
      const last = lastDownRef.current;
      if (last?.id === hit.id && now - last.time < DBLCLICK_MS) {
        lastDownRef.current = null;
        pendingRef.current = null;
        dragRef.current = { type: "none" };
        try { container.releasePointerCapture(e.pointerId); } catch {}
        setTimeout(() => setEditTargetRef.current(hit.id), 0);
        return;
      }
      lastDownRef.current = { id: hit.id, time: now };
      setSelectedRef.current(hit.id);
      try { container.setPointerCapture(e.pointerId); } catch {}

      toggleChartScroll(chartRef.current, false);

      if (hit.type === "corner") {
        dragRef.current = { type: "corner", id: hit.id, handle: hit.handle };
        container.style.cursor = "crosshair";
      } else {
        pendingRef.current = {
          id: hit.id, startClientX: e.clientX, startClientY: e.clientY,
          ax: hit.ax, ay: hit.ay, bx: hit.bx, by: hit.by,
        };
        container.style.cursor = "move";
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const wasDragging = dragRef.current.type !== "none" || pendingRef.current !== null;
      dragRef.current = { type: "none" };
      pendingRef.current = null;
      try { container.releasePointerCapture(e.pointerId); } catch {}
      if (wasDragging) {
        container.style.cursor = "";
        e.stopImmediatePropagation();
        e.preventDefault();
      }

      toggleChartScroll(chartRef.current, true);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (toolRef.current !== "cursor") return;
      const selId = selectedIdRef.current;
      if (e.key === "Escape") { setSelectedRef.current(null); return; }
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const id = selId ?? hoveredIdRef.current;
      if (!id) return;
      e.preventDefault();
      dragRef.current = { type: "none" };
      pendingRef.current = null;
      hoveredIdRef.current = null;
      setSelectedRef.current(null);
      container.style.cursor = "";
      removeDrawingRef.current(id);
    };

    const cleanLegacyBlockers = registerLegacyEventBlockers(container, (e) => {
      const isDragging = dragRef.current.type !== "none" || pendingRef.current !== null;
      const isHovering = hoveredIdRef.current !== null;
      return isDragging || (isHovering && (e.type === "mousedown" || e.type === "touchstart"));
    });

    container.addEventListener("pointermove", onPointerMove, true);
    container.addEventListener("pointerdown", onPointerDown, true);
    container.addEventListener("pointerup", onPointerUp, true);
    container.addEventListener("pointercancel", onPointerUp, true);
    window.addEventListener("keydown", onKeyDown);

    const chartCleanup = chartRef.current;
    return () => {
      container.removeEventListener("pointermove", onPointerMove, true);
      container.removeEventListener("pointerdown", onPointerDown, true);
      container.removeEventListener("pointerup", onPointerUp, true);
      container.removeEventListener("pointercancel", onPointerUp, true);
      cleanLegacyBlockers();
      window.removeEventListener("keydown", onKeyDown);
      if (chartCleanup) {
        try {
          chartCleanup.applyOptions({
            handleScroll: {
              pressedMouseMove: true,
              horzTouchDrag: true,
              vertTouchDrag: true,
            },
          });
        } catch {}
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
