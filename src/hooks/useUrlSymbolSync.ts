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
function parseTimeframe(raw: string | null): Timeframe | null {
  if (!raw) return null;
  const tf = raw.trim() as Timeframe;
  return VALID_TIMEFRAMES.has(tf) ? tf : null;
}

/**
 * Two-way sync between `?symbol=` / `?tf=` in the URL and the Zustand store.
 *
 * - On first load the URL wins: `?symbol=ETHUSDT&tf=4h` overrides the
 *   persisted values, so each tab can pin its own chart.
 * - Without query params the last persisted values are used and written to
 *   the URL so the address bar is always shareable.
 * - Every symbol/timeframe change (selector, watchlist, mobile) updates the
 *   query via `history.replaceState` without triggering a Next.js navigation.
 */
export function useUrlSymbolSync() {
  const symbol = useChartStore((s) => s.symbol);
  const timeframe = useChartStore((s) => s.timeframe);
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      const params = new URLSearchParams(window.location.search);
      const urlSymbol = params.get("symbol")?.trim().toUpperCase();
      const urlTf = parseTimeframe(params.get("tf"));
      const patch: { symbol?: string; timeframe?: Timeframe } = {};
      if (urlSymbol && VALID_SYMBOL.test(urlSymbol) && urlSymbol !== symbol) {
        patch.symbol = urlSymbol;
      }
      if (urlTf && urlTf !== timeframe) {
        patch.timeframe = urlTf;
      }
      if (Object.keys(patch).length > 0) {
        useChartStore.setState(patch);
        return; // re-runs with the new values and writes them to the URL
      }
    }
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
