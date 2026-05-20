"use client";

import type {
  IChartApiBase,
  ISeriesApi,
  SeriesType,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  SeriesAttachedParameter,
  Time,
} from "lightweight-charts";
import type { TrendLineDrawing, TrendLinePoint } from "../types";
import type { RefObject } from "react";
import type { Candle } from "@/lib/binance/types";
import type { Logical } from "lightweight-charts";

type CanvasRenderingTarget2D = Parameters<IPrimitivePaneRenderer["draw"]>[0];

function getLineDash(lineStyle: number): number[] {
  if (lineStyle === 1) return [2, 4];
  if (lineStyle === 2) return [6, 4];
  if (lineStyle === 3) return [12, 4];
  return [];
}

function computeExtended(
  x1: number, y1: number, x2: number, y2: number,
  width: number, extendLeft: boolean, extendRight: boolean,
): { x1: number; y1: number; x2: number; y2: number } {
  if (x1 === x2) return { x1, y1, x2, y2 };
  const slope = (y2 - y1) / (x2 - x1);
  let rx1 = x1, ry1 = y1, rx2 = x2, ry2 = y2;
  if (extendLeft && x1 > 0) { ry1 = y1 + slope * (0 - x1); rx1 = 0; }
  if (extendRight && x2 < width) { ry2 = y1 + slope * (width - x1); rx2 = width; }
  return { x1: rx1, y1: ry1, x2: rx2, y2: ry2 };
}

function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// ── Renderer ────────────────────────────────────────────────────────────────

class TrendLinePaneRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly _primitive: TrendLinePrimitive) {}

  draw(target: CanvasRenderingTarget2D): void {
    const { _chart: chart, _series: series, drawing, selected } = this._primitive;
    if (!chart || !series) return;

    const aX = this._primitive.getCoordinateForTime(drawing.a.time as number);
    const aY = series.priceToCoordinate(drawing.a.price);
    const bX = this._primitive.getCoordinateForTime(drawing.b.time as number);
    const bY = series.priceToCoordinate(drawing.b.price);
    if (aX === null || aY === null || bX === null || bY === null) return;

    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: pr, verticalPixelRatio: vpr, mediaSize }) => {
      const ext = computeExtended(aX, aY, bX, bY, mediaSize.width, drawing.extendLeft, drawing.extendRight);

      ctx.save();
      ctx.strokeStyle = drawing.color;
      ctx.lineWidth = drawing.lineWidth * pr;
      const dash = getLineDash(drawing.lineStyle);
      ctx.setLineDash(dash.map((v) => v * pr));

      ctx.beginPath();
      ctx.moveTo(ext.x1 * pr, ext.y1 * vpr);
      ctx.lineTo(ext.x2 * pr, ext.y2 * vpr);
      ctx.stroke();

      if (selected) {
        ctx.setLineDash([]);
        ctx.lineWidth = 2 * pr;
        ctx.strokeStyle = drawing.color;

        const bg = chart.options().layout.background;
        ctx.fillStyle = bg.type === "solid" ? bg.color : "#ffffff";

        for (const { x, y } of [{ x: aX, y: aY }, { x: bX, y: bY }]) {
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect((x - 5) * pr, (y - 5) * vpr, 10 * pr, 10 * vpr, 2 * pr);
          } else {
            ctx.rect((x - 5) * pr, (y - 5) * vpr, 10 * pr, 10 * vpr);
          }
          ctx.fill();
          ctx.stroke();
        }
      }

      ctx.restore();
    });
  }
}

// ── Pane view ────────────────────────────────────────────────────────────────

class TrendLinePaneView implements IPrimitivePaneView {
  private readonly _renderer: TrendLinePaneRenderer;
  constructor(primitive: TrendLinePrimitive) {
    this._renderer = new TrendLinePaneRenderer(primitive);
  }
  zOrder(): "normal" { return "normal"; }
  renderer(): IPrimitivePaneRenderer { return this._renderer; }
}

// ── Public primitive ─────────────────────────────────────────────────────────

export class TrendLinePrimitive {
  drawing: TrendLineDrawing;
  selected: boolean;

  _chart: IChartApiBase<Time> | null = null;
  _series: ISeriesApi<SeriesType, Time> | null = null;
  _candlesRef: RefObject<Candle[]> | null = null;
  private _requestUpdate: (() => void) | null = null;
  private readonly _paneViews: TrendLinePaneView[];

  constructor(drawing: TrendLineDrawing, selected: boolean, candlesRef?: RefObject<Candle[]>) {
    this.drawing = drawing;
    this.selected = selected;
    this._candlesRef = candlesRef ?? null;
    this._paneViews = [new TrendLinePaneView(this)];
  }

  attached(params: SeriesAttachedParameter<Time>): void {
    this._chart = params.chart as IChartApiBase<Time>;
    this._series = params.series as ISeriesApi<SeriesType, Time>;
    this._requestUpdate = params.requestUpdate;
  }

  detached(): void {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this._paneViews;
  }

  update(drawing: TrendLineDrawing, selected: boolean): void {
    this.drawing = drawing;
    this.selected = selected;
    this._requestUpdate?.();
  }

  // ── Hit testing (called from interaction hook in CSS-pixel space) ──────────

  /** Returns true if (px, py) is within HIT_RADIUS px of the line segment. */
  testHit(px: number, py: number, containerWidth: number): boolean {
    const coords = this._getLineCoords(containerWidth);
    if (!coords) return false;
    return distanceToSegment(px, py, coords.x1, coords.y1, coords.x2, coords.y2) <= 12;
  }

  /** Returns which endpoint (if any) is within HANDLE_RADIUS px of (px, py). */
  testEndpoint(px: number, py: number): "a" | "b" | null {
    const ab = this._getEndpointPixels();
    if (!ab) return null;
    if (Math.hypot(px - ab.ax, py - ab.ay) <= 14) return "a";
    if (Math.hypot(px - ab.bx, py - ab.by) <= 14) return "b";
    return null;
  }

  /** Convert CSS pixel coords to a chart data point. */
  pixelToPoint(px: number, py: number): TrendLinePoint | null {
    if (!this._chart || !this._series) return null;
    const time = this._chart.timeScale().coordinateToTime(px);
    const price = this._series.coordinateToPrice(py);
    if (time === null || price === null || !isFinite(price)) return null;
    return { time: time as number, price };
  }

  /** CSS-pixel positions of endpoints A and B. */
  getEndpointPixels(): { ax: number; ay: number; bx: number; by: number } | null {
    return this._getEndpointPixels();
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _getEndpointPixels(): { ax: number; ay: number; bx: number; by: number } | null {
    if (!this._chart || !this._series) return null;
    const aX = this.getCoordinateForTime(this.drawing.a.time as number);
    const aY = this._series.priceToCoordinate(this.drawing.a.price);
    const bX = this.getCoordinateForTime(this.drawing.b.time as number);
    const bY = this._series.priceToCoordinate(this.drawing.b.price);
    if (aX === null || aY === null || bX === null || bY === null) return null;
    return { ax: aX, ay: aY, bx: bX, by: bY };
  }

  private _getLineCoords(containerWidth: number): { x1: number; y1: number; x2: number; y2: number } | null {
    const ab = this._getEndpointPixels();
    if (!ab) return null;
    return computeExtended(ab.ax, ab.ay, ab.bx, ab.by, containerWidth, this.drawing.extendLeft, this.drawing.extendRight);
  }

  getCoordinateForTime(time: number): number | null {
    if (!this._chart) return null;
    const x = this._chart.timeScale().timeToCoordinate(time as Time);
    if (x !== null) return x;

    if (!this._candlesRef) return null;
    const candles = this._candlesRef.current;
    if (!candles || candles.length < 2) return null;

    const maxIdx = candles.length - 1;
    const interval = candles[maxIdx].time - candles[maxIdx - 1].time;
    if (interval === 0) return null;

    if (time < candles[0].time) {
      const bars = (candles[0].time - time) / interval;
      return this._chart.timeScale().logicalToCoordinate(-bars as Logical);
    }
    if (time > candles[maxIdx].time) {
      const bars = (time - candles[maxIdx].time) / interval;
      return this._chart.timeScale().logicalToCoordinate((maxIdx + bars) as Logical);
    }
    return null;
  }
}
