"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchUtcTradingDayTickers } from "@/lib/binance/rest";
import {
  applyLivePrice, applyTradingDaySnapshot, invalidatePreviousDay,
  untilNextUtcDay, utcDayRetryDelay, utcDayStart, type WatchlistDayRow,
} from "@/lib/binance/watchlist-day-change";
import { getBinanceWS } from "@/lib/binance/ws";
import { useChartStore } from "@/lib/store/chart-store";

interface MarketData {
  rows: Record<string, WatchlistDayRow>;
  flash: Record<string, "up" | "down" | null>;
}

const MarketDataContext = createContext<MarketData>({ rows: {}, flash: {} });

export function useMarketData() {
  return useContext(MarketDataContext);
}

/** One quote owner for the title and both desktop/mobile watchlists. */
export function MarketDataProvider({ children }: { children: ReactNode }) {
  const watchlist = useChartStore((s) => s.watchlist);
  const symbol = useChartStore((s) => s.symbol);
  const [rows, setRows] = useState<MarketData["rows"]>({});
  const [flash, setFlash] = useState<MarketData["flash"]>({});
  // Prices depend on membership, not visual order. Reordering should not reopen the WebSocket.
  const subscriptionKey = [...new Set([...watchlist, symbol])].sort().join(",");

  useEffect(() => {
    if (!subscriptionKey) return;
    const symbols = subscriptionKey.split(",");
    let cancelled = false;
    let dayStart = utcDayStart(Date.now());
    let attempt = 0;
    let loaded = false;
    let inFlight = false;
    let requestId = 0;
    let activeRequest: AbortController | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let midnightTimer: ReturnType<typeof setTimeout> | null = null;

    const clearRetry = () => {
      if (retryTimer !== null) clearTimeout(retryTimer);
      retryTimer = null;
    };

    const loadDay = () => {
      clearRetry();
      activeRequest?.abort();
      const controller = new AbortController();
      activeRequest = controller;
      inFlight = true;
      const requestedDay = dayStart;
      const thisRequest = ++requestId;
      fetchUtcTradingDayTickers(symbols, requestedDay, controller.signal).then((tickers) => {
        if (cancelled || thisRequest !== requestId) return;
        inFlight = false;
        activeRequest = null;
        if (utcDayStart(Date.now()) !== requestedDay) {
          rollover();
          return;
        }
        loaded = true;
        attempt = 0;
        setRows((previous) => applyTradingDaySnapshot(previous, tickers, requestedDay, Date.now()));
      }).catch((error: unknown) => {
        if (cancelled || thisRequest !== requestId) return;
        inFlight = false;
        activeRequest = null;
        if (utcDayStart(Date.now()) !== requestedDay) {
          rollover();
          return;
        }
        if (error instanceof Error && error.name === "AbortError") return;
        attempt += 1;
        retryTimer = setTimeout(loadDay, utcDayRetryDelay(attempt));
      });
    };

    const rollover = () => {
      const currentDay = utcDayStart(Date.now());
      if (currentDay === dayStart) return;
      dayStart = currentDay;
      loaded = false;
      attempt = 0;
      setRows((previous) => invalidatePreviousDay(previous, currentDay));
      loadDay();
    };

    const scheduleMidnight = () => {
      midnightTimer = setTimeout(() => {
        rollover();
        scheduleMidnight();
      }, untilNextUtcDay(Date.now()));
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      rollover();
      if (!loaded && !inFlight) loadDay();
    };

    queueMicrotask(() => {
      if (cancelled) return;
      setRows((previous) => invalidatePreviousDay(Object.fromEntries(
        Object.entries(previous).filter(([asset]) => symbols.includes(asset)),
      ), dayStart));
    });
    loadDay();
    scheduleMidnight();
    document.addEventListener("visibilitychange", onVisibilityChange);
    const unsub = getBinanceWS().subscribeMiniTickers(symbols, (tick) => {
      if (!Number.isFinite(tick.close) || tick.close <= 0) return;
      rollover();
      setRows((prev) => {
        const previousPrice = prev[tick.symbol]?.price;
        if (previousPrice !== undefined && tick.close !== previousPrice) {
          setFlash((f) => ({ ...f, [tick.symbol]: tick.close > previousPrice ? "up" : "down" }));
          setTimeout(() => setFlash((f) => ({ ...f, [tick.symbol]: null })), 300);
        }
        return applyLivePrice(prev, tick.symbol, tick.close, Date.now());
      });
    });
    return () => {
      cancelled = true;
      requestId += 1;
      activeRequest?.abort();
      clearRetry();
      if (midnightTimer !== null) clearTimeout(midnightTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      unsub();
    };
  }, [subscriptionKey]);

  return <MarketDataContext.Provider value={{ rows, flash }}>{children}</MarketDataContext.Provider>;
}
