"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  LineSeries,
  HistogramSeries,
  AreaSeries,
  CandlestickSeries,
  LineType,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type IPriceLine,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { compile, runScript, PineRuntimeError, type CompiledScript, type CompileResult } from "@/lib/pine";
import type { PlotSpec, DrawingPoint, RunContext } from "@/lib/pine/types";
import type { Candle } from "@/lib/binance/types";
import type { PineScriptRecord } from "@/lib/store/chart-store";
import { LineSegmentsPrimitive, type LineSegment } from "@/lib/chart/LineSegmentsPrimitive";
import { LinesPrimitive, type DrawLine } from "@/lib/chart/LinesPrimitive";
import { BoxesPrimitive, type DrawBox } from "@/lib/chart/BoxesPrimitive";
import { LabelsPrimitive, type DrawLabel } from "@/lib/chart/LabelsPrimitive";

const DEFAULT_PLOT_COLOR = "#2962ff";

/** Series con tipo abierto: cada plot puede ser Line/Histogram/Area según el estilo. */
type AnySeries = ISeriesApi<SeriesType>;

interface ScriptEntry {
  compiled: CompiledScript | null;
  /** Una serie por PlotSpec, en el mismo orden que compiled.plots */
  series: AnySeries[];
  /** PlotSpec.style alineado con `series` (para saber cómo volcar los datos) */
  styles: PlotStyle[];
  /** Último color de línea aplicado por serie (para color dinámico sin churn) */
  lineColors: (string | undefined)[];
  /** Primitive de segmentos por serie (color por segmento, p. ej. divergencias) */
  segments: (LineSegmentsPrimitive | null)[];
  /** Handles de las hline() creadas sobre la primera serie del script */
  priceLines: IPriceLine[];
  /** Plugin de markers sobre la primera serie (plotshape/plotchar) */
  markers: ISeriesMarkersPluginApi<Time> | null;
  /**
   * Serie sobre la que cuelgan los primitives de dibujos (lines/boxes/labels).
   * Es `series[0]` si el script tiene plots; si no, una LineSeries invisible
   * creada solo para anclar (priceToCoordinate para Y).
   */
  drawingAnchor: AnySeries | null;
  /** True si `drawingAnchor` es una serie invisible propia (hay que removerla en teardown). */
  ownAnchor: boolean;
  /** Nº de velas con que se pobló el ancla (para no re-setear datos cada tick). */
  anchorLen: number;
  /** Primitives multi-objeto de dibujos (una instancia por tipo, .update(list)). */
  linesPrim: LinesPrimitive | null;
  boxesPrim: BoxesPrimitive | null;
  labelsPrim: LabelsPrimitive | null;
  /** CandlestickSeries del plotcandle() (null si el script no usa plotcandle). */
  candleSeries: ISeriesApi<"Candlestick"> | null;
  /** Último valor finito del primer plot (para la pill); null = na/sin datos */
  lastValue: number | null;
  /** overlay=true → pane 0; si no, sub-pane propio */
  overlay: boolean;
  /** Pane donde vive el script (0 si overlay) */
  paneIndex: number;
  /** title de indicator() (cae a "" si no hay) */
  title: string;
  /** color del primer plot (para el punto de la pill) */
  color: string;
  error?: string;
}

type PlotStyle = PlotSpec["style"];

/**
 * Color totalmente transparente (#rrggbb00). Es el idioma de TradingView para
 * "ocultar" un plot en ciertas barras (p. ej. `cond ? realColor : color.new(x, 100)`
 * en indicadores de divergencia). En esas barras la línea se corta (hueco).
 */
function isFullyTransparent(color: string): boolean {
  return color.length === 9 && color.slice(7, 9).toLowerCase() === "00";
}

/** Metadata por script para construir las pills de la leyenda. */
export interface ScriptPillMeta {
  overlay: boolean;
  paneIndex: number;
  title: string;
  color: string;
}

/** Descriptor listo para renderizar una pill de script en la leyenda. */
export interface ScriptPill {
  id: string;
  name: string;
  color: string;
  value?: string;
  hidden: boolean;
  error?: string;
  /** Pane donde se posiciona (0 = overlay en el pane principal) */
  paneIndex: number;
}

function clampWidth(n: number): 1 | 2 | 3 | 4 {
  return Math.max(1, Math.min(4, Math.round(n))) as 1 | 2 | 3 | 4;
}

/** Estilo Pine de línea/borde → patrón de dash de los primitives. */
function lineStyleToDash(style: string): string {
  if (style === "dashed") return "dashed";
  if (style === "dotted") return "dotted";
  return "solid";
}

/**
 * Resuelve la X de un DrawingPoint a un tiempo en SEGUNDOS UNIX (formato
 * Candle.time del proyecto). El motor entrega `time` en MILISEGUNDOS (semántica
 * Pine) e `index` como bar_index. Devuelve null si el punto no se puede ubicar.
 *  - xloc 'bar_time': usar time si !=null (÷1000), si no caer al index.
 *  - xloc 'bar_index': usar index→candles[index].time, si no caer al time.
 */
function resolvePointTime(p: DrawingPoint, xloc: string, candles: Candle[]): number | null {
  const preferIndex = xloc === "bar_index";
  const fromIndex = (): number | null => {
    if (p.index === null) return null;
    // bar_index puede apuntar a una barra futura (no cargada): extrapolar por intervalo.
    const n = candles.length;
    if (n === 0) return null;
    if (p.index >= 0 && p.index < n) return candles[p.index].time;
    if (p.index < 0) {
      const interval = n >= 2 ? candles[1].time - candles[0].time : 60;
      return candles[0].time + p.index * interval;
    }
    const interval = n >= 2 ? candles[n - 1].time - candles[n - 2].time : 60;
    return candles[n - 1].time + (p.index - (n - 1)) * interval;
  };
  const fromTime = (): number | null => (p.time === null ? null : Math.floor(p.time / 1000));
  if (preferIndex) return fromIndex() ?? fromTime();
  return fromTime() ?? fromIndex();
}

/**
 * Clave de layout: si cambia, hay que destruir y recrear TODAS las series de
 * scripts (los panes de lightweight-charts se compactan al quitar series de un
 * pane intermedio, así que el rebuild completo es lo simple y correcto).
 * Cambios de `hidden`/`name` NO entran en la clave → solo applyOptions.
 */
function layoutKey(scripts: PineScriptRecord[], basePaneIdx: number): string {
  const active = scripts
    .filter((s) => s.onChart)
    .map((s) => `${s.id}${s.source}${JSON.stringify(s.inputs)}`)
    .join("");
  return `${basePaneIdx}${active}`;
}

export function useUserScriptPanes(
  chartRef: RefObject<IChartApi | null>,
  candlesRef: RefObject<Candle[]>,
  scripts: PineScriptRecord[],
  scriptBasePaneIdx: number,
  recomputePaneOffsets: () => void,
  /** Serie principal de velas (pane 0): ancla con datos para los dibujos overlay. */
  mainSeriesRef?: RefObject<ISeriesApi<"Candlestick"> | null>,
) {
  const entriesRef = useRef<Map<string, ScriptEntry>>(new Map());
  const compileCacheRef = useRef<Map<string, CompileResult>>(new Map());
  const layoutKeyRef = useRef<string>("");
  // RunContext (symbol/timeframe del chart + velas HTF) que useScriptHtf rellena
  // y runAndSetData pasa como 5º arg de runScript (Fase D, MTF). Empieza vacío
  // → request.security resuelve a na hasta que llegue el fetch HTF.
  const runCtxRef = useRef<RunContext>({});
  const scriptsRef = useRef(scripts);
  // eslint-disable-next-line react-hooks/refs
  scriptsRef.current = scripts;

  // Para las pills: último valor del 1er plot, error y metadata de cada script (por id).
  const [scriptLastValues, setScriptLastValues] = useState<Record<string, number | null>>({});
  const [scriptErrors, setScriptErrors] = useState<Record<string, string | undefined>>({});
  const [scriptMeta, setScriptMeta] = useState<Record<string, ScriptPillMeta>>({});

  /** Recoge lastValues/errors/meta de todas las entradas y los vuelca a estado. */
  const syncPillState = useCallback(() => {
    const last: Record<string, number | null> = {};
    const errs: Record<string, string | undefined> = {};
    const meta: Record<string, ScriptPillMeta> = {};
    for (const [id, entry] of entriesRef.current) {
      last[id] = entry.lastValue ?? null;
      errs[id] = entry.error;
      meta[id] = {
        overlay: entry.overlay,
        paneIndex: entry.paneIndex,
        title: entry.title,
        color: entry.color,
      };
    }
    setScriptLastValues(last);
    setScriptErrors(errs);
    setScriptMeta(meta);
  }, []);

  /** Compila con caché por source (el mismo source nunca se recompila). */
  const compileCached = useCallback((source: string): CompileResult => {
    const cache = compileCacheRef.current;
    let result = cache.get(source);
    if (!result) {
      result = compile(source);
      // Evitar crecimiento sin límite si el usuario edita mucho
      if (cache.size > 50) cache.clear();
      cache.set(source, result);
    }
    return result;
  }, []);

  /** Ejecuta el script y vuelca cada plot/shape en sus series. Lanza PineRuntimeError. */
  const runAndSetData = useCallback(
    (entry: ScriptEntry, record: PineScriptRecord) => {
      // Un script puede no tener plots (solo dibujos/plotcandle, p. ej. SMC); en
      // ese caso aún hay que ejecutarlo si tiene capa de dibujo.
      if (!entry.compiled) return;
      const hasDrawingLayer =
        entry.linesPrim !== null || entry.boxesPrim !== null || entry.candleSeries !== null;
      if (entry.series.length === 0 && !hasDrawingLayer) return;
      const result = runScript(entry.compiled, candlesRef.current, record.inputs, undefined, runCtxRef.current);

      let firstLast: number | null = null;
      result.plots.forEach((plot, i) => {
        const series = entry.series[i];
        if (!series) return;
        const style = entry.styles[i] ?? "line";
        if (style === "histogram" || style === "columns") {
          // HistogramSeries con color por barra (cae al color del spec si falta).
          (series as ISeriesApi<"Histogram">).setData(
            plot.points.map((p) => ({
              time: p.time as UTCTimestamp,
              value: p.value,
              ...(p.color ? { color: p.color } : {}),
            })),
          );
        } else {
          // Line / stepline / area / circles / cross comparten el shape {time,value}.
          const pts = plot.points;
          const lineSeries = series as ISeriesApi<"Line" | "Area">;
          // La serie siempre lleva todos los datos (necesario para el autoescala).
          lineSeries.setData(pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));

          const hasTransparent = pts.some((p) => p.color !== undefined && isFullyTransparent(p.color));
          if (style !== "area" && hasTransparent) {
            // Idioma de divergencias: `cond ? color : color.new(x, 100)`. Cada segmento
            // i-1→i se pinta con el color del punto i; transparente = invisible. Como un
            // LineSeries no soporta color por segmento, ocultamos su línea (color
            // transparente) y dibujamos los segmentos visibles con un primitive.
            if (entry.lineColors[i] !== "__seg__") {
              entry.lineColors[i] = "__seg__";
              lineSeries.applyOptions({ color: "rgba(0,0,0,0)" });
            }
            const width = entry.compiled?.plots[i]?.linewidth ?? 1;
            const segs: LineSegment[] = [];
            for (let k = 1; k < pts.length; k++) {
              const c = pts[k].color;
              if (c && !isFullyTransparent(c)) {
                segs.push({
                  t1: pts[k - 1].time, p1: pts[k - 1].value,
                  t2: pts[k].time, p2: pts[k].value,
                  color: c, width,
                });
              }
            }
            let prim = entry.segments[i];
            if (!prim) {
              prim = new LineSegmentsPrimitive();
              lineSeries.attachPrimitive(prim);
              entry.segments[i] = prim;
            }
            prim.update(segs);
          } else {
            // Color dinámico sin transparencia (p. ej. ADX azul/naranja): un solo
            // color por serie (primer color real) — limitación documentada.
            const dyn = pts.find((p) => p.color && !isFullyTransparent(p.color))?.color;
            if (dyn && entry.lineColors[i] !== dyn) {
              entry.lineColors[i] = dyn;
              lineSeries.applyOptions(style === "area" ? { lineColor: dyn } : { color: dyn });
            }
          }
        }
        if (i === 0) {
          // Último valor finito del primer plot para la pill.
          for (let k = plot.points.length - 1; k >= 0; k--) {
            const v = plot.points[k].value;
            if (Number.isFinite(v)) { firstLast = v; break; }
          }
        }
      });
      entry.lastValue = firstLast;

      // Markers (plotshape/plotchar) sobre la primera serie del script.
      if (entry.markers) {
        const markers: SeriesMarker<Time>[] = [];
        for (const shape of result.shapes) {
          for (const pt of shape.points) {
            markers.push({
              time: pt.time as UTCTimestamp,
              position: pt.position,
              shape: pt.shape,
              color: pt.color,
              ...(pt.text ? { text: pt.text } : {}),
            });
          }
        }
        // Los markers deben ir ordenados por tiempo ascendente.
        markers.sort((a, b) => (a.time as unknown as number) - (b.time as unknown as number));
        entry.markers.setMarkers(markers);
      }

      // ---- drawings (lines / boxes / labels) --------------------------------
      const candles = candlesRef.current;
      const hidden = record.hidden;

      // La serie ancla invisible necesita DATOS para que priceToCoordinate()
      // funcione (lightweight-charts devuelve null si la serie está vacía). Le
      // damos los closes de las velas (no afecta el autoescala por el
      // autoscaleInfoProvider:()=>null). Sin esto, ningún dibujo se pinta.
      if (entry.ownAnchor && entry.drawingAnchor && entry.anchorLen !== candles.length) {
        entry.anchorLen = candles.length;
        (entry.drawingAnchor as ISeriesApi<"Line">).setData(
          candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.close })),
        );
      }

      if (entry.linesPrim) {
        const lines: DrawLine[] = hidden
          ? []
          : result.drawings.lines.map((l) => ({
              t1: resolvePointTime(l.p1, l.xloc, candles),
              p1: l.p1.price,
              t2: resolvePointTime(l.p2, l.xloc, candles),
              p2: l.p2.price,
              color: l.color ?? "rgba(0,0,0,0)",
              width: l.width,
              dash: lineStyleToDash(l.style),
              extend: l.extend,
            }));
        entry.linesPrim.update(lines);
      }

      if (entry.boxesPrim) {
        const boxes: DrawBox[] = hidden
          ? []
          : result.drawings.boxes.map((b) => ({
              tLeft: resolvePointTime(b.topLeft, b.xloc, candles),
              pTop: b.topLeft.price,
              tRight: resolvePointTime(b.bottomRight, b.xloc, candles),
              pBottom: b.bottomRight.price,
              bgcolor: b.bgcolor,
              borderColor: b.borderColor,
              borderWidth: b.borderWidth,
              // BoxDrawing no expone estilo de borde (el motor lo trata como no-op);
              // se pinta sólido. Limitación documentada.
              dash: "solid",
              extend: b.extend,
            }));
        entry.boxesPrim.update(boxes);
      }

      if (entry.labelsPrim) {
        const labels: DrawLabel[] = hidden
          ? []
          : result.drawings.labels.map((l) => {
              // label.x es time(ms) o bar_index según xloc; reutilizamos resolvePointTime
              // tratando x como time/index según corresponda.
              const pt: DrawingPoint =
                l.xloc === "bar_index"
                  ? { time: null, index: l.x, price: l.y }
                  : { time: l.x, index: null, price: l.y };
              return {
                t: resolvePointTime(pt, l.xloc, candles),
                price: l.y,
                text: l.text,
                color: l.color,
                textcolor: l.textcolor,
                style: l.style,
                size: l.size,
              };
            });
        entry.labelsPrim.update(labels);
      }

      // ---- plotcandle -------------------------------------------------------
      if (entry.candleSeries) {
        if (hidden) {
          entry.candleSeries.setData([]);
        } else {
          // Una sola serie agrega todos los plotcandle() del script (raro tener >1).
          const data = result.candles.flatMap((c) =>
            c.points
              .filter((p) => p.high !== null && p.low !== null && p.close !== null)
              .map((p) => ({
                time: p.time as UTCTimestamp,
                open: p.open,
                high: p.high as number,
                low: p.low as number,
                close: p.close as number,
                ...(p.color ? { color: p.color } : {}),
                ...(p.wickColor ? { wickColor: p.wickColor } : {}),
                ...(p.borderColor ? { borderColor: p.borderColor } : {}),
              })),
          );
          data.sort((a, b) => (a.time as number) - (b.time as number));
          entry.candleSeries.setData(data);
        }
      }
    },
    [candlesRef],
  );

  /** Crea la serie adecuada según el estilo del plot. */
  const createPlotSeries = useCallback(
    (chart: IChartApi, spec: PlotSpec, paneIndex: number): AnySeries => {
      const color = spec.color || DEFAULT_PLOT_COLOR;
      switch (spec.style) {
        case "histogram":
        case "columns":
          return chart.addSeries(
            HistogramSeries,
            { color, priceLineVisible: false, lastValueVisible: true },
            paneIndex,
          );
        case "area":
          return chart.addSeries(
            AreaSeries,
            {
              lineColor: color,
              topColor: color,
              bottomColor: "transparent",
              lineWidth: clampWidth(spec.linewidth),
              priceLineVisible: false,
              lastValueVisible: true,
            },
            paneIndex,
          );
        case "circles":
        case "cross":
          // Sin línea, solo marcadores de punto en cada barra.
          return chart.addSeries(
            LineSeries,
            {
              color,
              lineVisible: false,
              pointMarkersVisible: true,
              pointMarkersRadius: spec.style === "cross" ? 2 : 3,
              priceLineVisible: false,
              lastValueVisible: true,
            },
            paneIndex,
          );
        case "stepline":
          return chart.addSeries(
            LineSeries,
            {
              color,
              lineWidth: clampWidth(spec.linewidth),
              lineType: LineType.WithSteps,
              priceLineVisible: false,
              lastValueVisible: true,
            },
            paneIndex,
          );
        case "line":
        default:
          return chart.addSeries(
            LineSeries,
            {
              color,
              lineWidth: clampWidth(spec.linewidth),
              priceLineVisible: false,
              lastValueVisible: true,
            },
            paneIndex,
          );
      }
    },
    [],
  );

  /** Quita del chart todas las series/markers/priceLines de todos los scripts. */
  const teardownAll = useCallback(() => {
    const chart = chartRef.current;
    for (const entry of entriesRef.current.values()) {
      // El chart puede estar ya disposed durante el unmount global
      if (entry.markers) {
        try { entry.markers.detach(); } catch {}
      }
      const first = entry.series[0];
      for (const pl of entry.priceLines) {
        try { first?.removePriceLine(pl); } catch {}
      }
      entry.segments.forEach((prim, idx) => {
        if (prim) {
          try { entry.series[idx]?.detachPrimitive(prim); } catch {}
        }
      });
      // Primitives de dibujos (lines/boxes/labels) colgados del ancla.
      const anchor = entry.drawingAnchor;
      if (anchor) {
        if (entry.linesPrim) { try { anchor.detachPrimitive(entry.linesPrim); } catch {} }
        if (entry.boxesPrim) { try { anchor.detachPrimitive(entry.boxesPrim); } catch {} }
        if (entry.labelsPrim) { try { anchor.detachPrimitive(entry.labelsPrim); } catch {} }
        // Solo removemos el ancla si la creamos nosotros (no es series[0]).
        if (entry.ownAnchor) { try { chart?.removeSeries(anchor); } catch {} }
      }
      if (entry.candleSeries) {
        try { chart?.removeSeries(entry.candleSeries); } catch {}
      }
      for (const s of entry.series) {
        try { chart?.removeSeries(s); } catch {}
      }
    }
    entriesRef.current.clear();
  }, [chartRef]);

  // Reconciliación: added/removed/source cambiado/onChart toggled/base pane movido
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const key = layoutKey(scripts, scriptBasePaneIdx);
    if (key !== layoutKeyRef.current) {
      layoutKeyRef.current = key;
      teardownAll();

      const activeScripts = scripts.filter((s) => s.onChart);
      let subPaneOffset = 0;
      for (const record of activeScripts) {
        const entry: ScriptEntry = {
          compiled: null,
          series: [],
          styles: [],
          lineColors: [],
          segments: [],
          priceLines: [],
          markers: null,
          drawingAnchor: null,
          ownAnchor: false,
          anchorLen: -1,
          linesPrim: null,
          boxesPrim: null,
          labelsPrim: null,
          candleSeries: null,
          lastValue: null,
          overlay: true,
          paneIndex: 0,
          title: record.name,
          color: DEFAULT_PLOT_COLOR,
        };
        entriesRef.current.set(record.id, entry);

        const result = compileCached(record.source);
        if (!result.ok) {
          entry.error = result.diagnostics
            .map((d) => `${d.line}:${d.col} ${d.message}`)
            .join("; ");
          console.warn(`[pine] "${record.name}" no compila: ${entry.error}`);
          continue;
        }
        entry.compiled = result.script;

        const overlay = result.script.meta.overlay;
        const paneIndex = overlay ? 0 : scriptBasePaneIdx + subPaneOffset;
        if (!overlay) subPaneOffset += 1;
        entry.overlay = overlay;
        entry.paneIndex = paneIndex;
        entry.title = result.script.meta.title || record.name;
        entry.color = result.script.plots[0]?.color || DEFAULT_PLOT_COLOR;

        for (const spec of result.script.plots) {
          const s = createPlotSeries(chart, spec, paneIndex);
          entry.series.push(s);
          entry.styles.push(spec.style);
        }

        const first = entry.series[0];

        // hline() → priceLines sobre la primera serie.
        if (first) {
          for (const hl of result.script.hlines) {
            try {
              const pl = first.createPriceLine({
                price: hl.price,
                color: hl.color || DEFAULT_PLOT_COLOR,
                lineWidth: clampWidth(hl.linewidth),
                lineStyle: hl.linestyle,
                axisLabelVisible: true,
                title: hl.title ?? "",
              });
              entry.priceLines.push(pl);
            } catch {}
          }
          // plotshape/plotchar → plugin de markers sobre la primera serie.
          if (result.script.shapes.length > 0) {
            entry.markers = createSeriesMarkers(first, []);
          }
        }

        // ---- dibujos (line/box/label) + plotcandle --------------------------
        const hasDrawings =
          result.script.limits.maxLines > 0 ||
          result.script.limits.maxBoxes > 0 ||
          result.script.limits.maxLabels > 0;
        // Solo montamos primitives si el script realmente dibuja algo. Detectamos
        // por programa: si no hay plots pero sí dibujos/plotcandle, necesitamos ancla.
        const hasCandles = result.script.candleSpecs.length > 0;
        const needsDrawingLayer = hasDrawings || hasCandles;

        if (needsDrawingLayer) {
          // Ancla para colgar los primitives. priceToCoordinate() necesita una
          // serie CON DATOS y en la escala de precios correcta:
          //  1) la 1ª serie de plots del script, si tiene; si no
          //  2) overlay → la serie principal de velas (tiene datos + escala right); si no
          //  3) una LineSeries invisible propia en el pane (se le cargan datos luego).
          let anchor: AnySeries | null = first ?? null;
          if (!anchor && overlay && mainSeriesRef?.current) {
            anchor = mainSeriesRef.current;
          }
          if (!anchor) {
            anchor = chart.addSeries(
              LineSeries,
              {
                lineVisible: false,
                lastValueVisible: false,
                priceLineVisible: false,
                pointMarkersVisible: false,
                crosshairMarkerVisible: false,
                autoscaleInfoProvider: () => null,
              },
              paneIndex,
            );
            entry.ownAnchor = true;
          }
          entry.drawingAnchor = anchor;

          if (hasDrawings) {
            entry.linesPrim = new LinesPrimitive(candlesRef);
            entry.boxesPrim = new BoxesPrimitive(candlesRef);
            entry.labelsPrim = new LabelsPrimitive(candlesRef);
            anchor.attachPrimitive(entry.boxesPrim);
            anchor.attachPrimitive(entry.linesPrim);
            anchor.attachPrimitive(entry.labelsPrim);
          }

          if (hasCandles) {
            entry.candleSeries = chart.addSeries(
              CandlestickSeries,
              { priceLineVisible: false, lastValueVisible: false },
              paneIndex,
            );
          }
        }

        const paneAnchor = first ?? entry.candleSeries ?? entry.drawingAnchor;
        if (!overlay && paneAnchor) {
          paneAnchor.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
          try {
            chart.panes()[0]?.setStretchFactor(3);
            chart.panes()[paneIndex]?.setStretchFactor(1);
          } catch {}
        }

        try {
          runAndSetData(entry, record);
        } catch (err) {
          entry.error = err instanceof PineRuntimeError ? err.message : String(err);
          console.warn(`[pine] "${record.name}" falló en ejecución:`, err);
        }
      }
      requestAnimationFrame(() => {
        recomputePaneOffsets();
        // setState fuera del efecto síncrono (rAF) para no violar react-hooks
        syncPillState();
      });
    }

    // hidden → solo visibilidad, sin recrear series
    for (const record of scripts) {
      const entry = entriesRef.current.get(record.id);
      if (!entry) continue;
      const visible = record.onChart && !record.hidden;
      for (const s of entry.series) s.applyOptions({ visible });
      entry.candleSeries?.applyOptions({ visible });
      // Los dibujos no tienen flag de visibilidad: se ocultan vaciando la lista.
      if (record.hidden) {
        entry.linesPrim?.update([]);
        entry.boxesPrim?.update([]);
        entry.labelsPrim?.update([]);
      } else if (entry.compiled) {
        // Re-pintar al volver de hidden→visible (sin esperar al próximo tick).
        try { runAndSetData(entry, record); } catch {}
      }
    }
  }, [scripts, scriptBasePaneIdx, chartRef, candlesRef, mainSeriesRef, teardownAll, compileCached, createPlotSeries, runAndSetData, recomputePaneOffsets, syncPillState]);

  // Cleanup al desmontar el chart completo
  useEffect(() => {
    return () => {
      teardownAll();
      layoutKeyRef.current = "";
    };
  }, [teardownAll]);

  /** Re-ejecuta todos los scripts activos sobre las velas actuales (tick WS, history, refresh). */
  const updateUserScripts = useCallback(() => {
    if (candlesRef.current.length === 0) return;
    let changed = false;
    for (const record of scriptsRef.current) {
      const entry = entriesRef.current.get(record.id);
      if (!entry || !entry.compiled) continue;
      const hasDrawingLayer =
        entry.linesPrim !== null || entry.boxesPrim !== null || entry.candleSeries !== null;
      if (entry.series.length === 0 && !hasDrawingLayer) continue;
      try {
        runAndSetData(entry, record);
        if (entry.error !== undefined) { entry.error = undefined; changed = true; }
        changed = true;
      } catch (err) {
        // Un script roto no debe tumbar los demás ni el chart
        const msg = err instanceof PineRuntimeError ? err.message : String(err);
        if (entry.error !== msg) changed = true;
        entry.error = msg;
        console.warn(`[pine] "${record.name}" falló en ejecución:`, err);
      }
    }
    if (changed) syncPillState();
  }, [candlesRef, runAndSetData, syncPillState]);

  return { updateUserScripts, scriptLastValues, scriptErrors, scriptMeta, runCtxRef };
}
