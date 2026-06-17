"use client";

import { useEffect, useRef, type RefObject } from "react";
import { compile } from "@/lib/pine";
import type { RunContext } from "@/lib/pine/types";
import { fetchKlines } from "@/lib/binance/rest";
import type { Candle, Timeframe } from "@/lib/binance/types";
import { binanceToPine, pineToBinance } from "@/lib/chart/timeframe-map";
import type { PineScriptRecord } from "@/lib/store/chart-store";

/**
 * Mitad de app de la Fase D (multi-timeframe). Alimenta `request.security` con
 * velas HTF reales de Binance:
 *
 *  1. Recolecta el conjunto único de `requestedTimeframes` (strings Pine) de
 *     todos los scripts onChart (compilando sus sources, cacheado por source).
 *  2. Para cada tf fetcheable en Binance (pineToBinance != null) hace fetchKlines
 *     del MISMO símbolo del chart y lo cachea por `${symbol}|${tf}`.
 *  3. Mantiene `runCtxRef.current = { symbol, timeframe (string Pine del chart),
 *     htf }` para que `useUserScriptPanes.runAndSetData` lo pase como 5º arg de
 *     `runScript`. Las claves de `htf` son EXACTAMENTE los strings Pine pedidos
 *     por request.security.
 *  4. Cuando llega un fetch HTF nuevo, re-ejecuta los scripts (updateUserScripts)
 *     para que request.security ya tenga datos (mientras no estén → na, el motor
 *     avisa una vez vía warnMissingHtf).
 *
 * Robustez: un fallo de fetch HTF NO rompe el chart ni los demás scripts (la
 * clave simplemente no aparece en htf → request.security de ese tf da na).
 */

const HTF_LIMIT = 1000;

/** Cache local de compilaciones por source → requestedTimeframes. */
function collectRequestedTimeframes(
  scripts: PineScriptRecord[],
  cache: Map<string, string[]>,
): string[] {
  const set = new Set<string>();
  for (const record of scripts) {
    if (!record.onChart) continue;
    let tfs = cache.get(record.source);
    if (!tfs) {
      try {
        const result = compile(record.source);
        tfs = result.ok ? result.script.requestedTimeframes : [];
      } catch {
        tfs = [];
      }
      if (cache.size > 50) cache.clear();
      cache.set(record.source, tfs);
    }
    for (const tf of tfs) set.add(tf);
  }
  return [...set];
}

export function useScriptHtf(
  symbol: string,
  timeframe: Timeframe,
  scripts: PineScriptRecord[],
  runCtxRef: RefObject<RunContext>,
  updateUserScripts: () => void,
) {
  // Cache de velas HTF por `${symbol}|${tfPine}` (se invalida al cambiar símbolo).
  const htfCacheRef = useRef<Map<string, Candle[]>>(new Map());
  const compileCacheRef = useRef<Map<string, string[]>>(new Map());
  const cacheSymbolRef = useRef<string>(symbol);

  const updateUserScriptsRef = useRef(updateUserScripts);
  // eslint-disable-next-line react-hooks/refs
  updateUserScriptsRef.current = updateUserScripts;
  const scriptsRef = useRef(scripts);
  // eslint-disable-next-line react-hooks/refs
  scriptsRef.current = scripts;

  /** Reconstruye runCtx.htf desde el cache (solo claves del símbolo actual). */
  const rebuildRunCtx = (sym: string, tf: Timeframe) => {
    const htf: Record<string, Candle[]> = {};
    const requested = collectRequestedTimeframes(scriptsRef.current, compileCacheRef.current);
    for (const tfPine of requested) {
      const cached = htfCacheRef.current.get(`${sym}|${tfPine}`);
      if (cached) htf[tfPine] = cached;
    }
    runCtxRef.current = { symbol: sym, timeframe: binanceToPine(tf), htf };
  };

  // Mantener runCtx fresco (al menos symbol+timeframe) y disparar el fetch HTF.
  useEffect(() => {
    let cancelled = false;

    // Invalidar cache de velas al cambiar de símbolo.
    if (cacheSymbolRef.current !== symbol) {
      htfCacheRef.current.clear();
      cacheSymbolRef.current = symbol;
    }

    // runCtx síncrono (htf con lo que ya haya en cache) para timeframe.* y para
    // que request.security del propio tf resuelva a ctx.candles de inmediato.
    rebuildRunCtx(symbol, timeframe);

    const requested = collectRequestedTimeframes(scripts, compileCacheRef.current);
    const chartTfPine = binanceToPine(timeframe);

    const toFetch = requested.filter((tfPine) => {
      if (tfPine === chartTfPine) return false; // mismo tf del chart → ctx.candles
      if (pineToBinance(tfPine) === null) return false; // no fetcheable → na
      return !htfCacheRef.current.has(`${symbol}|${tfPine}`); // ya cacheado
    });

    if (toFetch.length === 0) return;

    (async () => {
      let anyNew = false;
      await Promise.all(
        toFetch.map(async (tfPine) => {
          const binanceTf = pineToBinance(tfPine);
          if (!binanceTf) return;
          try {
            const candles = await fetchKlines(symbol, binanceTf, HTF_LIMIT);
            if (cancelled || cacheSymbolRef.current !== symbol) return;
            htfCacheRef.current.set(`${symbol}|${tfPine}`, candles);
            anyNew = true;
          } catch {
            // Fallo de fetch HTF: no cacheamos → request.security de ese tf da na.
          }
        }),
      );
      if (cancelled || !anyNew) return;
      // Reconstruir runCtx con las velas nuevas y re-ejecutar los scripts.
      rebuildRunCtx(symbol, timeframe);
      updateUserScriptsRef.current();
    })();

    return () => {
      cancelled = true;
    };
    // scripts entra para recolectar requestedTimeframes cuando cambian los scripts;
    // rebuildRunCtx es estable conceptualmente (lee de refs).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe, scripts]);
}
