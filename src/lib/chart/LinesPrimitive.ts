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
import type { RefObject } from "react";
import type { Candle } from "@/lib/binance/types";
import { timeToCoordinateExtended } from "@/lib/drawings/time-coordinate";

type CanvasRenderingTarget2D = Parameters<IPrimitivePaneRenderer["draw"]>[0];

/**
 * Una línea de un script Pine (`line.new`) ya resuelta a coordenadas de datos.
 * `t1`/`t2` son tiempos en SEGUNDOS UNIX (formato Candle.time del proyecto) — el
 * hook convierte el `time` en ms del motor y mapea los índices a tiempos antes de
 * construir esto. `null` en cualquier coordenada → la línea se omite.
 */
export interface DrawLine {
  t1: number | null;
  p1: number | null;
  t2: number | null;
  p2: number | null;
  color: string;
  /** Grosor del trazo en px (CSS). */
  width: number;
  /** "solid" | "dashed" | "dotted" */
  dash: string;
  /** "none" | "left" | "right" | "both" */
  extend: string;
}

function dashPattern(dash: string): number[] {
  if (dash === "dashed") return [6, 4];
  if (dash === "dotted") return [2, 3];
  return [];
}

/**
 * Prolonga el segmento (x1,y1)-(x2,y2) hasta los bordes del pane según `extend`.
 * Idéntica lógica a TrendLinePrimitive: interpolación lineal por pendiente.
 */
function computeExtended(
  x1: number, y1: number, x2: number, y2: number,
  width: number, extendLeft: boolean, extendRight: boolean,
): { x1: number; y1: number; x2: number; y2: number } {
  // Vertical: no se puede extrapolar por X (extender en Y no aplica a Pine).
  if (x1 === x2) return { x1, y1, x2, y2 };
  const slope = (y2 - y1) / (x2 - x1);
  let rx1 = x1, ry1 = y1, rx2 = x2, ry2 = y2;
  if (extendLeft && x1 > 0) { ry1 = y1 + slope * (0 - x1); rx1 = 0; }
  if (extendRight && x2 < width) { ry2 = y1 + slope * (width - x1); rx2 = width; }
  return { x1: rx1, y1: ry1, x2: rx2, y2: ry2 };
}

class LinesRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly _primitive: LinesPrimitive) {}

  draw(target: CanvasRenderingTarget2D): void {
    const { _chart: chart, _series: series, _candlesRef: candlesRef, lines } = this._primitive;
    if (!chart || !series || lines.length === 0) return;
    const candles = candlesRef?.current ?? null;

    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: pr, verticalPixelRatio: vpr, mediaSize }) => {
      ctx.save();
      for (const line of lines) {
        if (line.t1 === null || line.t2 === null || line.p1 === null || line.p2 === null) continue;
        const x1 = timeToCoordinateExtended(chart, candles, line.t1);
        const x2 = timeToCoordinateExtended(chart, candles, line.t2);
        const y1 = series.priceToCoordinate(line.p1);
        const y2 = series.priceToCoordinate(line.p2);
        if (x1 === null || x2 === null || y1 === null || y2 === null) continue;

        const extendLeft = line.extend === "left" || line.extend === "both";
        const extendRight = line.extend === "right" || line.extend === "both";
        const ext = computeExtended(x1, y1, x2, y2, mediaSize.width, extendLeft, extendRight);

        ctx.strokeStyle = line.color;
        ctx.lineWidth = Math.max(1, line.width) * pr;
        const dash = dashPattern(line.dash);
        ctx.setLineDash(dash.map((v) => v * pr));
        ctx.beginPath();
        ctx.moveTo(ext.x1 * pr, ext.y1 * vpr);
        ctx.lineTo(ext.x2 * pr, ext.y2 * vpr);
        ctx.stroke();
      }
      ctx.restore();
    });
  }
}

class LinesPaneView implements IPrimitivePaneView {
  private readonly _renderer: LinesRenderer;
  constructor(primitive: LinesPrimitive) {
    this._renderer = new LinesRenderer(primitive);
  }
  zOrder(): "normal" { return "normal"; }
  renderer(): IPrimitivePaneRenderer { return this._renderer; }
}

/** Dibuja N líneas de un script Pine sobre la serie ancla del pane del script. */
export class LinesPrimitive {
  lines: DrawLine[] = [];
  _chart: IChartApiBase<Time> | null = null;
  _series: ISeriesApi<SeriesType, Time> | null = null;
  _candlesRef: RefObject<Candle[]> | null;
  private _requestUpdate: (() => void) | null = null;
  private readonly _paneViews: LinesPaneView[];

  constructor(candlesRef?: RefObject<Candle[]>) {
    this._candlesRef = candlesRef ?? null;
    this._paneViews = [new LinesPaneView(this)];
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

  update(lines: DrawLine[]): void {
    this.lines = lines;
    this._requestUpdate?.();
  }
}
