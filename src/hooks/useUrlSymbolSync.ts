"use client";

import { useEffect, useRef } from "react";
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

/**
 * Mantiene símbolo y timeframe independientes por pestaña.
 *
 * Prioridad al cargar: query params de la URL (`?symbol=&tf=`) →
 * sessionStorage de la pestaña → último valor persistido en localStorage.
 * Así cada pestaña recupera SU símbolo al refrescar, aunque otra pestaña
 * haya sobrescrito el localStorage compartido después.
 *
 * Cada cambio de símbolo/timeframe se escribe en la URL (compartible) vía
 * `history.replaceState` y en el sessionStorage de la pestaña.
 */
export function useUrlSymbolSync() {
  const symbol = useChartStore((s) => s.symbol);
  const timeframe = useChartStore((s) => s.timeframe);
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      const params = new URLSearchParams(window.location.search);
      const tab = readTabState();

      const urlSymbol = params.get("symbol")?.trim().toUpperCase();
      const tabSymbol = tab.symbol?.trim().toUpperCase();
      const wantedSymbol =
        urlSymbol && VALID_SYMBOL.test(urlSymbol)
          ? urlSymbol
          : tabSymbol && VALID_SYMBOL.test(tabSymbol)
            ? tabSymbol
            : null;
      const wantedTf = parseTimeframe(params.get("tf")) ?? parseTimeframe(tab.tf);

      const patch: { symbol?: string; timeframe?: Timeframe } = {};
      if (wantedSymbol && wantedSymbol !== symbol) {
        patch.symbol = wantedSymbol;
      }
      if (wantedTf && wantedTf !== timeframe) {
        patch.timeframe = wantedTf;
      }
      if (Object.keys(patch).length > 0) {
        useChartStore.setState(patch);
        return; // re-runs with the new values and writes URL + sessionStorage
      }
    }
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
  }, [symbol, timeframe]);
}
