"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { fetchKlines } from "@/lib/binance/rest";
import { getBinanceWS } from "@/lib/binance/ws";
import { TV_COLORS } from "@/lib/chart/chart-colors";
import { useChartStore } from "@/lib/store/chart-store";
import type { Candle, Timeframe } from "@/lib/binance/types";

interface KlineDataCallbacks {
  candleSeriesRef: RefObject<ISeriesApi<"Candlestick"> | null>;
  volumeSeriesRef: RefObject<ISeriesApi<"Histogram"> | null>;
  updateEMAs: () => void;
  updateRSI: () => void;
  updateMACD: () => void;
  updateSQZ: () => void;
  updateADX: () => void;
  updateVRVP: () => void;
  recomputePaneOffsets: () => void;
}

export function useKlineData(
  symbol: string,
  timeframe: Timeframe,
  chartRef: RefObject<IChartApi | null>,
  candlesRef: RefObject<Candle[]>,
  callbacks: KlineDataCallbacks,
) {
  const [lastPrice, setLastPrice] = useState<{ value: number; pct: number } | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const symbolRef = useRef(symbol);
  // eslint-disable-next-line react-hooks/refs
  symbolRef.current = symbol;
  const timeframeRef = useRef(timeframe);
  // eslint-disable-next-line react-hooks/refs
  timeframeRef.current = timeframe;

  const isLoadingHistoryRef = useRef(false);
  const hasReachedHistoryStartRef = useRef(false);
  const callbacksRef = useRef(callbacks);
  // eslint-disable-next-line react-hooks/refs
  callbacksRef.current = callbacks;

  const loadMoreHistory = useCallback(async () => {
    if (isLoadingHistoryRef.current || hasReachedHistoryStartRef.current) return;
    if (!chartRef.current || candlesRef.current.length === 0) return;

    isLoadingHistoryRef.current = true;
    setIsLoadingHistory(true);
    try {
      const oldest = candlesRef.current[0];
      const endTime = oldest.time * 1000 - 1;
      const older = await fetchKlines(symbolRef.current, timeframeRef.current, 500, endTime);

      if (older.length === 0) { hasReachedHistoryStartRef.current = true; return; }

      const existingTimes = new Set(candlesRef.current.map((c) => c.time));
      const fresh = older.filter((c) => !existingTimes.has(c.time));
      if (fresh.length === 0) { hasReachedHistoryStartRef.current = true; return; }

      candlesRef.current = [...fresh, ...candlesRef.current];
      const all = candlesRef.current;
      const { candleSeriesRef, volumeSeriesRef, updateEMAs, updateRSI, updateMACD, updateSQZ, updateADX } = callbacksRef.current;

      candleSeriesRef.current?.setData(
        all.map((k) => ({ time: k.time as UTCTimestamp, open: k.open, high: k.high, low: k.low, close: k.close })),
      );
      volumeSeriesRef.current?.setData(
        all.map((k) => ({
          time: k.time as UTCTimestamp,
          value: k.volume,
          color: k.close >= k.open ? `${TV_COLORS.green}66` : `${TV_COLORS.red}66`,
        })),
      );
      updateEMAs();
      updateRSI();
      updateMACD();
      updateSQZ();
      updateADX();
    } catch {
      // Silently ignore network errors — user can scroll back and retry
    } finally {
      isLoadingHistoryRef.current = false;
      setIsLoadingHistory(false);
    }
  }, [chartRef, candlesRef]);

  // Subscribe to logical range for lazy loading and zoom saving
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = chartRef.current;
    let timeoutId: ReturnType<typeof setTimeout>;

    const handler = () => {
      const range = chart.timeScale().getVisibleLogicalRange();
      if (!range) return;
      if (range.from < 10) loadMoreHistory();

      // Debounce saving zoom state
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const visibleBars = Math.max(10, Math.round(range.to - range.from));
        useChartStore.getState().setInitialZoom(visibleBars);
      }, 500);
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler);
      clearTimeout(timeoutId);
    };
  }, [loadMoreHistory]);

  // Load initial data and subscribe WS
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;

    hasReachedHistoryStartRef.current = false;
    isLoadingHistoryRef.current = false;

    async function load() {
      try {
        const klines = await fetchKlines(symbol, timeframe, 1000);
        if (cancelled) return;
        candlesRef.current = klines;

        const { candleSeriesRef, volumeSeriesRef, updateEMAs, updateRSI, updateMACD, updateSQZ, updateADX, updateVRVP, recomputePaneOffsets } = callbacksRef.current;

        candleSeriesRef.current?.setData(
          klines.map((k) => ({ time: k.time as UTCTimestamp, open: k.open, high: k.high, low: k.low, close: k.close })),
        );
        volumeSeriesRef.current?.setData(
          klines.map((k) => ({
            time: k.time as UTCTimestamp,
            value: k.volume,
            color: k.close >= k.open ? `${TV_COLORS.green}66` : `${TV_COLORS.red}66`,
          })),
        );
        updateEMAs();
        updateRSI();
        updateMACD();
        updateSQZ();
        updateADX();

        // Auto-zoom based on user preference
        if (chartRef.current && klines.length > 0) {
          const storeState = useChartStore.getState();
          const visible = Math.min(klines.length, storeState.initialZoom);
          const vrvpActive = storeState.indicators.vrvp && !storeState.hidden.vrvp && storeState.config.vrvpPlacement === "Right";
          const pct = Math.max(0.05, Math.min(0.5, storeState.config.vrvpWidth / 100));
          const extraBars = vrvpActive ? Math.ceil((visible * pct) / (1 - pct)) : 0;
          const rightOffset = 12 + extraBars;
          chartRef.current.applyOptions({ timeScale: { rightOffset } });
          chartRef.current.timeScale().setVisibleLogicalRange({
            from: klines.length - visible,
            to: klines.length - 1 + rightOffset,
          });
        }

        requestAnimationFrame(() => {
          updateVRVP();
          recomputePaneOffsets();
        });

        if (klines.length > 0) {
          const last = klines[klines.length - 1];
          const prev = klines[klines.length - 2] ?? last;
          setLastPrice({
            value: last.close,
            pct: prev.close === 0 ? 0 : ((last.close - prev.close) / prev.close) * 100,
          });
        }

        const ws = getBinanceWS();
        unsub = ws.subscribeKline({
          symbol,
          interval: timeframe,
          onCandle: (k) => {
            const { candleSeriesRef, volumeSeriesRef, updateEMAs, updateRSI, updateMACD, updateSQZ, updateADX, updateVRVP } = callbacksRef.current;
            if (!candleSeriesRef.current) return;
            const arr = candlesRef.current;
            const lastCandle = arr[arr.length - 1];
            if (lastCandle && lastCandle.time === k.time) {
              arr[arr.length - 1] = k;
            } else if (!lastCandle || k.time > lastCandle.time) {
              arr.push(k);
              if (arr.length > 2000) arr.shift();
            } else {
              return;
            }
            candleSeriesRef.current.update({ time: k.time as UTCTimestamp, open: k.open, high: k.high, low: k.low, close: k.close });
            volumeSeriesRef.current?.update({
              time: k.time as UTCTimestamp,
              value: k.volume,
              color: k.close >= k.open ? `${TV_COLORS.green}66` : `${TV_COLORS.red}66`,
            });
            updateEMAs();
            updateRSI();
            updateMACD();
            updateSQZ();
            updateADX();
            updateVRVP();
            const prev = arr[arr.length - 2] ?? lastCandle;
            setLastPrice({
              value: k.close,
              pct: prev && prev.close !== 0 ? ((k.close - prev.close) / prev.close) * 100 : 0,
            });
          },
        });
      } catch (e) {
        console.error("Failed to load chart data:", e);
      }
    }

    load();
    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [symbol, timeframe]);

  return { lastPrice, isLoadingHistory };
}
