"use client";

import { useEffect } from "react";
import { formatPct, formatPrice } from "@/lib/format";
import { useMarketData } from "@/hooks/useMarketData";

const BASE_TITLE = "TradingView Gratis — Crypto charts open source";

/** Keep the tab on the same live UTC-day quote and formatting as the watchlist. */
export function useDocumentTitle(symbol: string) {
  const { rows } = useMarketData();
  const row = rows[symbol];
  useEffect(() => {
    if (row?.price === undefined) {
      document.title = `${symbol} — TradingView Gratis`;
      return;
    }
    const change = row.pct === undefined ? "" : ` ${row.pct >= 0 ? "▲" : "▼"} ${formatPct(row.pct)}`;
    document.title = `${symbol} ${formatPrice(row.price)}${change} — TradingView Gratis`;
  }, [symbol, row]);

  // Restore the static title when the chart unmounts
  useEffect(() => {
    return () => {
      document.title = BASE_TITLE;
    };
  }, []);
}
