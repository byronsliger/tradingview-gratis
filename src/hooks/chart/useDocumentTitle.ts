"use client";

import { useEffect } from "react";
import { formatPct, formatPrice } from "@/lib/format";

const BASE_TITLE = "TradingView Gratis — Crypto charts open source";

/**
 * Mantiene el título de la pestaña sincronizado con el precio en vivo,
 * al estilo TradingView: "ETHUSDT 1,657.44 ▲ +2.21% — TradingView Gratis"
 */
export function useDocumentTitle(
  symbol: string,
  lastPrice: { value: number; pct: number } | null,
) {
  useEffect(() => {
    if (!lastPrice) {
      document.title = `${symbol} — TradingView Gratis`;
      return;
    }
    const arrow = lastPrice.pct >= 0 ? "▲" : "▼";
    document.title = `${symbol} ${formatPrice(lastPrice.value)} ${arrow} ${formatPct(lastPrice.pct)} — TradingView Gratis`;
  }, [symbol, lastPrice]);

  // Restore the static title when the chart unmounts
  useEffect(() => {
    return () => {
      document.title = BASE_TITLE;
    };
  }, []);
}
