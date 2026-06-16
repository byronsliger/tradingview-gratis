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

type CanvasRenderingTarget2D = Parameters<IPrimitivePaneRenderer["draw"]>[0];

/** Un segmento independiente con color propio (tiempo en segundos UNIX). */
export interface LineSegment {
  t1: number;
  p1: number;
  t2: number;
  p2: number;
  color: string;
  width: number;
}

/**
 * Dibuja una lista de segmentos de línea, cada uno con su propio color. Resuelve
 * el problema de "color por segmento" que un LineSeries no soporta: lo usamos para
 * las líneas de divergencia (idioma `cond ? color : color.new(x,100)`), donde cada
 * segmento conecta el pivote previo con el de divergencia y los demás son invisibles.
 */
class LineSegmentsRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly _primitive: LineSegmentsPrimitive) {}

  draw(target: CanvasRenderingTarget2D): void {
    const { _chart: chart, _series: series, segments } = this._primitive;
    if (!chart || !series || segments.length === 0) return;
    const timeScale = chart.timeScale();

    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: pr, verticalPixelRatio: vpr }) => {
      ctx.save();
      for (const seg of segments) {
        const x1 = timeScale.timeToCoordinate(seg.t1 as Time);
        const x2 = timeScale.timeToCoordinate(seg.t2 as Time);
        const y1 = series.priceToCoordinate(seg.p1);
        const y2 = series.priceToCoordinate(seg.p2);
        if (x1 === null || x2 === null || y1 === null || y2 === null) continue;
        ctx.strokeStyle = seg.color;
        ctx.lineWidth = seg.width * pr;
        ctx.beginPath();
        ctx.moveTo(x1 * pr, y1 * vpr);
        ctx.lineTo(x2 * pr, y2 * vpr);
        ctx.stroke();
      }
      ctx.restore();
    });
  }
}

class LineSegmentsPaneView implements IPrimitivePaneView {
  private readonly _renderer: LineSegmentsRenderer;
  constructor(primitive: LineSegmentsPrimitive) {
    this._renderer = new LineSegmentsRenderer(primitive);
  }
  zOrder(): "normal" { return "normal"; }
  renderer(): IPrimitivePaneRenderer { return this._renderer; }
}

export class LineSegmentsPrimitive {
  segments: LineSegment[] = [];
  _chart: IChartApiBase<Time> | null = null;
  _series: ISeriesApi<SeriesType, Time> | null = null;
  private _requestUpdate: (() => void) | null = null;
  private readonly _paneViews: LineSegmentsPaneView[];

  constructor() {
    this._paneViews = [new LineSegmentsPaneView(this)];
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

  update(segments: LineSegment[]): void {
    this.segments = segments;
    this._requestUpdate?.();
  }
}
