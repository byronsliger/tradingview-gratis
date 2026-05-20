import type { Candle } from "@/lib/binance/types";
import type { IndicatorPoint } from "./types";

/**
 * Exponential Moving Average — seeded with SMA of first `period` candles.
 */
export function ema(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += candles[i].close;
  prev /= period;
  out.push({ time: candles[period - 1].time, value: prev });
  for (let i = period; i < candles.length; i++) {
    prev = candles[i].close * k + prev * (1 - k);
    out.push({ time: candles[i].time, value: prev });
  }
  return out;
}
