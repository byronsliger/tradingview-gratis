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
import type { RectangleDrawing } from "../types";
import type { RefObject } from "react";
import type { Candle } from "@/lib/binance/types";
import type { Logical } from "lightweight-charts";

type CanvasRenderingTarget2D = Parameters<IPrimitivePaneRenderer["draw"]>[0];

export type RectHandle = "tl" | "tr" | "bl" | "br";

function getLineDash(lineStyle: number): number[] {
  if (lineStyle === 1) return [2, 4];
  if (lineStyle === 2) return [6, 4];
  if (lineStyle === 3) return [12, 4];
  return [];
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// ── Renderer ────────────────────────────────────────────────────────────────

class RectanglePaneRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly _primitive: RectanglePrimitive) {}

  draw(target: CanvasRenderingTarget2D): void {
    const { _chart: chart, _series: series, drawing, selected } = this._primitive;
    if (!chart || !series) return;

    const coords = this._primitive.getRectCoords();
    if (!coords) return;
    const { lx, rx, ty, by: boty } = coords;

    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: pr, verticalPixelRatio: vpr }) => {
      const x = lx * pr;
      const y = ty * vpr;
      const w = (rx - lx) * pr;
      const h = (boty - ty) * vpr;

      ctx.save();

      if (drawing.fillVisible) {
        ctx.fillStyle = drawing.fillColor;
        ctx.fillRect(x, y, w, h);
      }

      ctx.strokeStyle = drawing.color;
      ctx.lineWidth = drawing.lineWidth * pr;
      const dash = getLineDash(drawing.lineStyle);
      ctx.setLineDash(dash.map((v) => v * pr));
      ctx.strokeRect(x, y, w, h);

      if (selected) {
        ctx.setLineDash([]);
        ctx.lineWidth = 2 * pr;
        ctx.strokeStyle = drawing.color;
        const bg = chart.options().layout.background;
        ctx.fillStyle = bg.type === "solid" ? bg.color : "#ffffff";

        const corners = [
          { x: lx, y: ty },
          { x: rx, y: ty },
          { x: lx, y: boty },
          { x: rx, y: boty },
        ];
        for (const c of corners) {
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect((c.x - 5) * pr, (c.y - 5) * vpr, 10 * pr, 10 * vpr, 2 * pr);
          } else {
            ctx.rect((c.x - 5) * pr, (c.y - 5) * vpr, 10 * pr, 10 * vpr);
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

class RectanglePaneView implements IPrimitivePaneView {
  private readonly _renderer: RectanglePaneRenderer;
  constructor(primitive: RectanglePrimitive) {
    this._renderer = new RectanglePaneRenderer(primitive);
  }
  zOrder(): "normal" { return "normal"; }
  renderer(): IPrimitivePaneRenderer { return this._renderer; }
}

// ── Public primitive ─────────────────────────────────────────────────────────

export class RectanglePrimitive {
  drawing: RectangleDrawing;
  selected: boolean;

  _chart: IChartApiBase<Time> | null = null;
  _series: ISeriesApi<SeriesType, Time> | null = null;
  _candlesRef: RefObject<Candle[]> | null = null;
  private _requestUpdate: (() => void) | null = null;
  private readonly _paneViews: RectanglePaneView[];

  constructor(drawing: RectangleDrawing, selected: boolean, candlesRef?: RefObject<Candle[]>) {
    this.drawing = drawing;
    this.selected = selected;
    this._candlesRef = candlesRef ?? null;
    this._paneViews = [new RectanglePaneView(this)];
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

  update(drawing: RectangleDrawing, selected: boolean): void {
    this.drawing = drawing;
    this.selected = selected;
    this._requestUpdate?.();
  }

  getRectCoords(): { lx: number; rx: number; ty: number; by: number } | null {
    if (!this._chart || !this._series) return null;
    const { a, b } = this.drawing;
    const ax = this.getCoordinateForTime(a.time);
    const bx = this.getCoordinateForTime(b.time);
    const ay = this._series.priceToCoordinate(a.price);
    const by = this._series.priceToCoordinate(b.price);
    if (ax === null || bx === null || ay === null || by === null) return null;
    return {
      lx: Math.min(ax, bx),
      rx: Math.max(ax, bx),
      ty: Math.min(ay, by),
      by: Math.max(ay, by),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  testHit(px: number, py: number, _containerWidth: number): boolean {
    const c = this.getRectCoords();
    if (!c) return false;
    const { lx, rx, ty } = c;
    const bot = c.by;
    // Within 12px of any edge
    if (distToSegment(px, py, lx, ty, rx, ty) <= 12) return true;
    if (distToSegment(px, py, rx, ty, rx, bot) <= 12) return true;
    if (distToSegment(px, py, rx, bot, lx, bot) <= 12) return true;
    if (distToSegment(px, py, lx, bot, lx, ty) <= 12) return true;
    // Inside fill
    if (this.drawing.fillVisible && px >= lx && px <= rx && py >= ty && py <= bot) return true;
    return false;
  }

  testEndpoint(px: number, py: number): RectHandle | null {
    const c = this.getRectCoords();
    if (!c) return null;
    const { lx, rx, ty } = c;
    const bot = c.by;
    if (Math.hypot(px - lx, py - ty) <= 14) return "tl";
    if (Math.hypot(px - rx, py - ty) <= 14) return "tr";
    if (Math.hypot(px - lx, py - bot) <= 14) return "bl";
    if (Math.hypot(px - rx, py - bot) <= 14) return "br";
    return null;
  }

  getCornerPixels(): { tl: [number, number]; tr: [number, number]; bl: [number, number]; br: [number, number] } | null {
    const c = this.getRectCoords();
    if (!c) return null;
    return {
      tl: [c.lx, c.ty],
      tr: [c.rx, c.ty],
      bl: [c.lx, c.by],
      br: [c.rx, c.by],
    };
  }

  // Legacy name used by interaction hook
  getEndpointPixels(): { ax: number; ay: number; bx: number; by: number } | null {
    const c = this.getRectCoords();
    if (!c) return null;
    return { ax: c.lx, ay: c.ty, bx: c.rx, by: c.by };
  }

  pixelToPoint(px: number, py: number): { time: number; price: number } | null {
    if (!this._chart || !this._series) return null;
    const price = this._series.coordinateToPrice(py);
    if (price === null || !isFinite(price)) return null;
    const time = this._chart.timeScale().coordinateToTime(px);
    if (time !== null) return { time: time as number, price };
    const logical = this._chart.timeScale().coordinateToLogical(px);
    if (logical === null) return null;
    const candles = this._candlesRef?.current;
    if (!candles || candles.length === 0) return null;
    const maxIdx = candles.length - 1;
    const interval = maxIdx >= 1 ? candles[maxIdx].time - candles[maxIdx - 1].time : 60;
    const li = Math.round(logical);
    let extTime: number;
    if (li >= 0 && li <= maxIdx) extTime = candles[li].time;
    else if (li < 0) extTime = candles[0].time - Math.abs(li) * interval;
    else extTime = candles[maxIdx].time + (li - maxIdx) * interval;
    return { time: extTime, price };
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
