"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  LineSeries,
  HistogramSeries,
  AreaSeries,
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
import type { PlotSpec } from "@/lib/pine/types";
import type { Candle } from "@/lib/binance/types";
import type { PineScriptRecord } from "@/lib/store/chart-store";

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
  /** Handles de las hline() creadas sobre la primera serie del script */
  priceLines: IPriceLine[];
  /** Plugin de markers sobre la primera serie (plotshape/plotchar) */
  markers: ISeriesMarkersPluginApi<Time> | null;
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
) {
  const entriesRef = useRef<Map<string, ScriptEntry>>(new Map());
  const compileCacheRef = useRef<Map<string, CompileResult>>(new Map());
  const layoutKeyRef = useRef<string>("");
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
      if (!entry.compiled || entry.series.length === 0) return;
      const result = runScript(entry.compiled, candlesRef.current, record.inputs);

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
          // Color dinámico: un punto totalmente transparente se vuelve hueco
          // (whitespace) para que la línea solo se vea donde tiene color real
          // (idioma de divergencias `cond ? color : color.new(x, 100)`).
          let lineColor: string | undefined;
          const data: ({ time: UTCTimestamp; value: number } | { time: UTCTimestamp })[] =
            plot.points.map((p) => {
              const c = p.color;
              if (c && isFullyTransparent(c)) return { time: p.time as UTCTimestamp };
              if (c && lineColor === undefined) lineColor = c;
              return { time: p.time as UTCTimestamp, value: p.value };
            });
          (series as ISeriesApi<"Line" | "Area">).setData(data);
          // Aplica el primer color real de la serie (solo si cambió, sin churn).
          if (lineColor && entry.lineColors[i] !== lineColor) {
            entry.lineColors[i] = lineColor;
            series.applyOptions(style === "area" ? { lineColor } : { color: lineColor });
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
          priceLines: [],
          markers: null,
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

        if (!overlay && first) {
          first.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
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
    }
  }, [scripts, scriptBasePaneIdx, chartRef, teardownAll, compileCached, createPlotSeries, runAndSetData, recomputePaneOffsets, syncPillState]);

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
      if (!entry || !entry.compiled || entry.series.length === 0) continue;
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

  return { updateUserScripts, scriptLastValues, scriptErrors, scriptMeta };
}
