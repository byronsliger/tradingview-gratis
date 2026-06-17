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
 * Una etiqueta de un script Pine (`label.new`) resuelta a coordenadas de datos.
 * `t` es el tiempo en SEGUNDOS UNIX. `color` (fondo)/`textcolor` null = no pintar
 * ese elemento. `style` es el simbólico de Pine ('label_down', 'label_up', …).
 */
export interface DrawLabel {
  t: number | null;
  price: number | null;
  text: string;
  /** Color de fondo de la etiqueta (null = sin fondo). */
  color: string | null;
  /** Color del texto (null = no pintar texto). */
  textcolor: string | null;
  /** Estilo Pine: 'label_down'|'label_up'|'label_left'|'label_right'|'label_center'|'none'|… */
  style: string;
  /** 'tiny'|'small'|'normal'|'large'|'huge' */
  size: string;
}

function fontSizeFor(size: string): number {
  switch (size) {
    case "tiny": return 9;
    case "small": return 11;
    case "large": return 16;
    case "huge": return 20;
    default: return 12; // normal / auto
  }
}

const FALLBACK_BG = "#2962ff";
const FALLBACK_TEXT = "#ffffff";

/**
 * Devuelve la dirección del triángulo de ancla y el lado por el que se ancla la
 * caja, derivados del style de Pine. up = triángulo abajo apuntando al punto
 * (caja arriba), down = triángulo arriba (caja debajo), etc.
 */
function anchorFor(style: string): { dir: "up" | "down" | "left" | "right" | "none" } {
  if (style.includes("up") || style === "arrowup" || style === "triangleup") return { dir: "up" };
  if (style.includes("down") || style === "arrowdown" || style === "triangledown") return { dir: "down" };
  if (style.includes("left")) return { dir: "left" };
  if (style.includes("right")) return { dir: "right" };
  return { dir: "none" };
}

class LabelsRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly _primitive: LabelsPrimitive) {}

  draw(target: CanvasRenderingTarget2D): void {
    const { _chart: chart, _series: series, _candlesRef: candlesRef, labels } = this._primitive;
    if (!chart || !series || labels.length === 0) return;
    const candles = candlesRef?.current ?? null;

    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: pr, verticalPixelRatio: vpr }) => {
      ctx.save();
      for (const label of labels) {
        if (label.t === null || label.price === null) continue;
        const x = timeToCoordinateExtended(chart, candles, label.t);
        const y = series.priceToCoordinate(label.price);
        if (x === null || y === null) continue;

        const fontPx = fontSizeFor(label.size);
        ctx.font = `${fontPx * vpr}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";

        const text = label.text ?? "";
        const padX = 5 * pr;
        const padY = 3 * vpr;
        const metrics = ctx.measureText(text);
        const textW = text ? metrics.width : 0;
        const boxW = text ? textW + padX * 2 : 8 * pr;
        const boxH = fontPx * vpr + padY * 2;

        const anchor = anchorFor(label.style);
        const triSize = 5 * Math.min(pr, vpr);

        // Posición de la caja relativa al punto (px,py en bitmap space).
        const px = x * pr;
        const py = y * vpr;
        let boxX = px - boxW / 2;
        let boxY = py - boxH / 2;
        switch (anchor.dir) {
          case "up":
            // El punto está en la punta inferior; la caja va ARRIBA.
            boxY = py - boxH - triSize;
            break;
          case "down":
            // La caja va DEBAJO del punto.
            boxY = py + triSize;
            break;
          case "left":
            boxX = px + triSize;
            boxY = py - boxH / 2;
            break;
          case "right":
            boxX = px - boxW - triSize;
            boxY = py - boxH / 2;
            break;
          default:
            break;
        }

        // Fondo + triángulo de ancla.
        const hasBg = label.color !== null;
        if (label.color) {
          ctx.fillStyle = label.color;
          ctx.beginPath();
          ctx.rect(boxX, boxY, boxW, boxH);
          ctx.fill();
          // Triángulo apuntando al punto.
          ctx.beginPath();
          if (anchor.dir === "up") {
            ctx.moveTo(px, py);
            ctx.lineTo(px - triSize, boxY + boxH);
            ctx.lineTo(px + triSize, boxY + boxH);
          } else if (anchor.dir === "down") {
            ctx.moveTo(px, py);
            ctx.lineTo(px - triSize, boxY);
            ctx.lineTo(px + triSize, boxY);
          } else if (anchor.dir === "left") {
            ctx.moveTo(px, py);
            ctx.lineTo(boxX, py - triSize);
            ctx.lineTo(boxX, py + triSize);
          } else if (anchor.dir === "right") {
            ctx.moveTo(px, py);
            ctx.lineTo(boxX + boxW, py - triSize);
            ctx.lineTo(boxX + boxW, py + triSize);
          }
          ctx.closePath();
          ctx.fill();
        }

        // Texto.
        if (text && label.textcolor !== null) {
          ctx.fillStyle = label.textcolor ?? (hasBg ? FALLBACK_TEXT : FALLBACK_BG);
          ctx.fillText(text, boxX + padX, boxY + boxH / 2);
        }
      }
      ctx.restore();
    });
  }
}

class LabelsPaneView implements IPrimitivePaneView {
  private readonly _renderer: LabelsRenderer;
  constructor(primitive: LabelsPrimitive) {
    this._renderer = new LabelsRenderer(primitive);
  }
  zOrder(): "top" { return "top"; }
  renderer(): IPrimitivePaneRenderer { return this._renderer; }
}

/** Dibuja N etiquetas de un script Pine sobre la serie ancla del pane del script. */
export class LabelsPrimitive {
  labels: DrawLabel[] = [];
  _chart: IChartApiBase<Time> | null = null;
  _series: ISeriesApi<SeriesType, Time> | null = null;
  _candlesRef: RefObject<Candle[]> | null;
  private _requestUpdate: (() => void) | null = null;
  private readonly _paneViews: LabelsPaneView[];

  constructor(candlesRef?: RefObject<Candle[]>) {
    this._candlesRef = candlesRef ?? null;
    this._paneViews = [new LabelsPaneView(this)];
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

  update(labels: DrawLabel[]): void {
    this.labels = labels;
    this._requestUpdate?.();
  }
}
