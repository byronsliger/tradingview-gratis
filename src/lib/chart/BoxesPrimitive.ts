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

/**
 * Una caja de un script Pine (`box.new`) resuelta a coordenadas de datos.
 * `tLeft`/`tRight` son tiempos en SEGUNDOS UNIX. `bgcolor`/`borderColor` null =
 * no pintar ese elemento. `null` en cualquier coordenada → la caja se omite.
 */
export interface DrawBox {
  tLeft: number | null;
  pTop: number | null;
  tRight: number | null;
  pBottom: number | null;
  bgcolor: string | null;
  borderColor: string | null;
  borderWidth: number;
  /** "solid" | "dashed" | "dotted" (estilo del borde) */
  dash: string;
  /** "none" | "left" | "right" | "both" */
  extend: string;
}

function dashPattern(dash: string): number[] {
  if (dash === "dashed") return [6, 4];
  if (dash === "dotted") return [2, 3];
  return [];
}

class BoxesRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly _primitive: BoxesPrimitive) {}

  draw(target: CanvasRenderingTarget2D): void {
    const { _chart: chart, _series: series, boxes } = this._primitive;
    if (!chart || !series || boxes.length === 0) return;
    const timeScale = chart.timeScale();

    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: pr, verticalPixelRatio: vpr, mediaSize }) => {
      ctx.save();
      for (const box of boxes) {
        if (box.tLeft === null || box.tRight === null || box.pTop === null || box.pBottom === null) continue;
        const xl = timeScale.timeToCoordinate(box.tLeft as Time);
        const xr = timeScale.timeToCoordinate(box.tRight as Time);
        const yt = series.priceToCoordinate(box.pTop);
        const yb = series.priceToCoordinate(box.pBottom);
        if (xl === null || xr === null || yt === null || yb === null) continue;

        let left = Math.min(xl, xr);
        let right = Math.max(xl, xr);
        const top = Math.min(yt, yb);
        const bottom = Math.max(yt, yb);

        // extend prolonga la caja horizontalmente hasta el borde del pane.
        if (box.extend === "left" || box.extend === "both") left = 0;
        if (box.extend === "right" || box.extend === "both") right = mediaSize.width;

        const x = left * pr;
        const y = top * vpr;
        const w = (right - left) * pr;
        const h = (bottom - top) * vpr;

        if (box.bgcolor) {
          ctx.fillStyle = box.bgcolor;
          ctx.fillRect(x, y, w, h);
        }
        if (box.borderColor && box.borderWidth > 0) {
          ctx.strokeStyle = box.borderColor;
          ctx.lineWidth = box.borderWidth * pr;
          const dash = dashPattern(box.dash);
          ctx.setLineDash(dash.map((v) => v * pr));
          ctx.strokeRect(x, y, w, h);
        }
      }
      ctx.restore();
    });
  }
}

class BoxesPaneView implements IPrimitivePaneView {
  private readonly _renderer: BoxesRenderer;
  constructor(primitive: BoxesPrimitive) {
    this._renderer = new BoxesRenderer(primitive);
  }
  zOrder(): "normal" { return "normal"; }
  renderer(): IPrimitivePaneRenderer { return this._renderer; }
}

/** Dibuja N cajas de un script Pine sobre la serie ancla del pane del script. */
export class BoxesPrimitive {
  boxes: DrawBox[] = [];
  _chart: IChartApiBase<Time> | null = null;
  _series: ISeriesApi<SeriesType, Time> | null = null;
  private _requestUpdate: (() => void) | null = null;
  private readonly _paneViews: BoxesPaneView[];

  constructor() {
    this._paneViews = [new BoxesPaneView(this)];
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

  update(boxes: DrawBox[]): void {
    this.boxes = boxes;
    this._requestUpdate?.();
  }
}
