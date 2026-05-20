import type { Candle } from "@/lib/binance/types";
import type { SqueezeMomPoint } from "./types";

// ── Math helpers (internal, not exported from the barrel) ─────────────────────

/** Population standard deviation of `source` over the last `period` bars. */
export function stdev(source: number[], period: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < source.length; i++) {
    if (i < period - 1) { out.push(0); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += source[j];
    const mean = sum / period;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (source[j] - mean) ** 2;
    out.push(Math.sqrt(variance / period));
  }
  return out;
}

/** Linear regression fitted value at each bar (last point of the regression line). */
export function linreg(source: number[], period: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < source.length; i++) {
    if (i < period - 1) { out.push(0); continue; }
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let j = 0; j < period; j++) {
      sumX  += j;
      sumY  += source[i - period + 1 + j];
      sumXY += j * source[i - period + 1 + j];
      sumX2 += j * j;
    }
    const n = period;
    const slope     = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    out.push(intercept + slope * (period - 1));
  }
  return out;
}

// ── Squeeze Momentum ──────────────────────────────────────────────────────────

function rollingMean(arr: number[], period: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
    if (i >= period) sum -= arr[i - period];
    out.push(i >= period - 1 ? sum / period : 0);
  }
  return out;
}

function rollingHigh(arr: number[], period: number): number[] {
  return arr.map((_, i) => {
    if (i < period - 1) return 0;
    let m = -Infinity;
    for (let j = i - period + 1; j <= i; j++) m = Math.max(m, arr[j]);
    return m;
  });
}

function rollingLow(arr: number[], period: number): number[] {
  return arr.map((_, i) => {
    if (i < period - 1) return 0;
    let m = Infinity;
    for (let j = i - period + 1; j <= i; j++) m = Math.min(m, arr[j]);
    return m;
  });
}

/**
 * Squeeze Momentum Indicator — LazyBear (Pine Script) ported to TypeScript.
 * https://www.tradingview.com/v/4IneGo8h/
 *
 * Histogram bar colors follow the original:
 *   lime   = positive & growing   green  = positive & shrinking
 *   red    = negative & growing   maroon = negative & shrinking
 *
 * Zero-line dot colors:
 *   blue  = no squeeze   black = squeeze ON   gray = squeeze OFF
 *
 * @param candles      OHLCV array
 * @param bbLength     Bollinger Band length   (default 20)
 * @param bbMult       BB standard-dev mult    (default 2.0)
 * @param kcLength     Keltner Channel length  (default 20)
 * @param kcMult       KC ATR / TR mult        (default 1.5)
 * @param useTrueRange Use True Range for KC   (default true)
 */
export function squeezeMomentum(
  candles: Candle[],
  bbLength = 20,
  bbMult = 2.0,
  kcLength = 20,
  kcMult = 1.5,
  useTrueRange = true,
): SqueezeMomPoint[] {
  const n = candles.length;
  if (n < Math.max(bbLength, kcLength)) return [];

  const closes = candles.map((c) => c.close);
  const highs  = candles.map((c) => c.high);
  const lows   = candles.map((c) => c.low);

  // True Range
  const trueRange: number[] = [highs[0] - lows[0]];
  for (let i = 1; i < n; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i]  - closes[i - 1]);
    trueRange.push(Math.max(hl, hc, lc));
  }
  const rangeArr = useTrueRange ? trueRange : highs.map((h, i) => h - lows[i]);

  // Bollinger Bands
  const basis   = rollingMean(closes, bbLength);
  const devArr  = stdev(closes, bbLength);
  const upperBB = basis.map((b, i) => b + bbMult * devArr[i]);
  const lowerBB = basis.map((b, i) => b - bbMult * devArr[i]);

  // Keltner Channel
  const ma      = rollingMean(closes,   kcLength);
  const rangema = rollingMean(rangeArr, kcLength);
  const upperKC = ma.map((m, i) => m + rangema[i] * kcMult);
  const lowerKC = ma.map((m, i) => m - rangema[i] * kcMult);

  // Squeeze flags
  const sqzOn  = lowerBB.map((lb, i) => lb > lowerKC[i] && upperBB[i] < upperKC[i]);
  const sqzOff = lowerBB.map((lb, i) => lb < lowerKC[i] && upperBB[i] > upperKC[i]);
  const noSqz  = sqzOn.map((on, i) => !on && !sqzOff[i]);

  // Momentum value  =  linreg( close − avg(avg(highest, lowest), sma(close)) )
  const highestHigh = rollingHigh(highs, kcLength);
  const lowestLow   = rollingLow(lows,   kcLength);
  const smaClosed   = rollingMean(closes, kcLength);
  const midpoint    = highestHigh.map((hh, i) => ((hh + lowestLow[i]) / 2 + smaClosed[i]) / 2);
  const source2     = closes.map((c, i) => i < kcLength - 1 ? 0 : c - midpoint[i]);
  const valArr      = linreg(source2, kcLength);

  // Build output starting from the warm-up index
  const warmup = Math.max(bbLength, kcLength);
  const out: SqueezeMomPoint[] = [];
  for (let i = warmup; i < n; i++) {
    out.push({
      time:   candles[i].time,
      val:    valArr[i],
      sqzOn:  sqzOn[i],
      sqzOff: sqzOff[i],
      noSqz:  noSqz[i],
    });
  }
  return out;
}
