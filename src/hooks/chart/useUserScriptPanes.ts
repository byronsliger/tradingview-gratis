"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import {
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { compile, runScript, PineRuntimeError, type CompiledScript, type CompileResult } from "@/lib/pine";
import type { Candle } from "@/lib/binance/types";
import type { PineScriptRecord } from "@/lib/store/chart-store";

const DEFAULT_PLOT_COLOR = "#2962ff";

interface ScriptEntry {
  compiled: CompiledScript | null;
  /** Una LineSeries por PlotSpec, en el mismo orden que compiled.plots */
  series: ISeriesApi<"Line">[];
  error?: string;
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
    .map((s) => `${s.id}${s.source}${JSON.stringify(s.inputs)}`)
    .join("");
  return `${basePaneIdx}${active}`;
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

  /** Ejecuta el script y vuelca cada plot en su serie. Lanza PineRuntimeError. */
  const runAndSetData = useCallback(
    (entry: ScriptEntry, record: PineScriptRecord) => {
      if (!entry.compiled || entry.series.length === 0) return;
      const result = runScript(entry.compiled, candlesRef.current, record.inputs);
      result.plots.forEach((plot, i) => {
        entry.series[i]?.setData(
          plot.points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
        );
      });
    },
    [candlesRef],
  );

  /** Quita del chart todas las series de todos los scripts. */
  const teardownAll = useCallback(() => {
    const chart = chartRef.current;
    for (const entry of entriesRef.current.values()) {
      for (const s of entry.series) {
        // El chart puede estar ya disposed durante el unmount global
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
        const entry: ScriptEntry = { compiled: null, series: [] };
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

        for (const spec of result.script.plots) {
          const s = chart.addSeries(
            LineSeries,
            {
              color: spec.color || DEFAULT_PLOT_COLOR,
              lineWidth: 2,
              priceLineVisible: false,
              lastValueVisible: true,
            },
            paneIndex,
          );
          entry.series.push(s);
        }

        if (!overlay && entry.series.length > 0) {
          entry.series[0].priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
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
      requestAnimationFrame(() => recomputePaneOffsets());
    }

    // hidden → solo visibilidad, sin recrear series
    for (const record of scripts) {
      const entry = entriesRef.current.get(record.id);
      if (!entry) continue;
      const visible = record.onChart && !record.hidden;
      for (const s of entry.series) s.applyOptions({ visible });
    }
  }, [scripts, scriptBasePaneIdx, chartRef, teardownAll, compileCached, runAndSetData, recomputePaneOffsets]);

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
    for (const record of scriptsRef.current) {
      const entry = entriesRef.current.get(record.id);
      if (!entry || !entry.compiled || entry.series.length === 0) continue;
      try {
        runAndSetData(entry, record);
        entry.error = undefined;
      } catch (err) {
        // Un script roto no debe tumbar los demás ni el chart
        entry.error = err instanceof PineRuntimeError ? err.message : String(err);
        console.warn(`[pine] "${record.name}" falló en ejecución:`, err);
      }
    }
  }, [candlesRef, runAndSetData]);

  return { updateUserScripts };
}
