"use client";

import { useEffect, useRef, useState } from "react";
import { useChartStore } from "@/lib/store/chart-store";
import type { Timeframe } from "@/lib/binance/types";

const VALID_SYMBOL = /^[A-Z0-9]{2,20}$/;

const VALID_TIMEFRAMES = new Set<Timeframe>([
  "1m", "3m", "5m", "15m", "30m",
  "1h", "2h", "4h", "6h", "8h", "12h",
  "1d", "3d", "1w", "1M",
]);

/** Case-sensitive parse: "1m" (minute) and "1M" (month) are different timeframes. */
function parseTimeframe(raw: string | null | undefined): Timeframe | null {
  if (!raw) return null;
  const tf = raw.trim() as Timeframe;
  return VALID_TIMEFRAMES.has(tf) ? tf : null;
}

/**
 * sessionStorage es por pestaña y sobrevive al refresco, así que es la
 * fuente de verdad de "qué estaba viendo ESTA pestaña" aunque la URL
 * pierda sus query params o el localStorage (compartido entre pestañas)
 * tenga el símbolo de otra.
 */
const TAB_STATE_KEY = "tv-gratis-tab-state";

interface TabState {
  symbol?: string;
  tf?: string;
}

function readTabState(): TabState {
  try {
    return JSON.parse(sessionStorage.getItem(TAB_STATE_KEY) ?? "{}") as TabState;
  } catch {
    return {};
  }
}

function writeTabState(state: TabState): void {
  try {
    sessionStorage.setItem(TAB_STATE_KEY, JSON.stringify(state));
  } catch {
    // sessionStorage bloqueado: la pestaña dependerá solo de la URL
  }
}

interface Wanted {
  symbol: string | null;
  tf: Timeframe | null;
}

/** Lo que esta pestaña quiere mostrar: query params de la URL → sessionStorage. */
function readWanted(): Wanted {
  const params = new URLSearchParams(window.location.search);
  const tab = readTabState();
  const urlSymbol = params.get("symbol")?.trim().toUpperCase();
  const tabSymbol = tab.symbol?.trim().toUpperCase();
  return {
    symbol:
      urlSymbol && VALID_SYMBOL.test(urlSymbol)
        ? urlSymbol
        : tabSymbol && VALID_SYMBOL.test(tabSymbol)
          ? tabSymbol
          : null,
    tf: parseTimeframe(params.get("tf")) ?? parseTimeframe(tab.tf),
  };
}

/**
 * Mantiene símbolo y timeframe independientes por pestaña.
 *
 * La hidratación de zustand/persist es asíncrona: el primer render usa los
 * valores por defecto y el valor persistido (compartido entre pestañas vía
 * localStorage) llega un instante después. Si escribiéramos la URL antes de
 * eso, el símbolo de otra pestaña pisaría el de esta. Por eso el hook tiene
 * dos fases:
 *
 * 1. Al terminar la hidratación (`persist.onFinishHydration`) se aplica lo
 *    que ESTA pestaña quiere — query params de la URL, o el sessionStorage
 *    de la pestaña como respaldo — por encima de lo persistido.
 * 2. Solo a partir de ahí el store manda: cada cambio de símbolo/timeframe
 *    se refleja en la URL (compartible, vía `history.replaceState`) y en el
 *    sessionStorage de la pestaña.
 */
export function useUrlSymbolSync() {
  const symbol = useChartStore((s) => s.symbol);
  const timeframe = useChartStore((s) => s.timeframe);
  const wantedRef = useRef<Wanted | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const applyWanted = () => {
      // Capturado una sola vez por carga de página (StrictMode lo repite)
      wantedRef.current ??= readWanted();
      const wanted = wantedRef.current;
      const state = useChartStore.getState();
      const patch: { symbol?: string; timeframe?: Timeframe } = {};
      if (wanted.symbol && state.symbol !== wanted.symbol) {
        patch.symbol = wanted.symbol;
      }
      if (wanted.tf && state.timeframe !== wanted.tf) {
        patch.timeframe = wanted.tf;
      }
      if (Object.keys(patch).length > 0) {
        useChartStore.setState(patch);
      }
      setReady(true);
    };
    if (useChartStore.persist.hasHydrated()) {
      applyWanted();
      return;
    }
    return useChartStore.persist.onFinishHydration(applyWanted);
  }, []);

  useEffect(() => {
    if (!ready) return;
    writeTabState({ symbol, tf: timeframe });
    const url = new URL(window.location.href);
    if (
      url.searchParams.get("symbol") !== symbol ||
      url.searchParams.get("tf") !== timeframe
    ) {
      url.searchParams.set("symbol", symbol);
      url.searchParams.set("tf", timeframe);
      window.history.replaceState(null, "", url);
    }
  }, [ready, symbol, timeframe]);
}
