import type { Candle } from "@/lib/binance/types";
import type { IndicatorPoint } from "./types";

/**
 * RSI (Wilder) — period typically 14.
 */
export function rsi(candles: Candle[], period = 14): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  gain /= period;
  loss /= period;
  let rs = loss === 0 ? 100 : gain / loss;
  out.push({ time: candles[period].time, value: 100 - 100 / (1 + rs) });
  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
    rs = loss === 0 ? 100 : gain / loss;
    out.push({ time: candles[i].time, value: 100 - 100 / (1 + rs) });
  }
  return out;
}
