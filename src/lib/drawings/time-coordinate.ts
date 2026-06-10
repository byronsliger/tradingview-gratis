import type { IChartApiBase, Logical, Time } from "lightweight-charts";
import type { Candle } from "@/lib/binance/types";

/**
 * `logicalToCoordinate` silently returns 0 for non-integer logical indices,
 * so fractional positions must be interpolated between two integer indices.
 */
function fractionalLogicalToCoordinate(
  chart: IChartApiBase<Time>,
  logical: number,
): number | null {
  const timeScale = chart.timeScale();
  const base = Math.floor(logical);
  const x0 = timeScale.logicalToCoordinate(base as Logical);
  const x1 = timeScale.logicalToCoordinate((base + 1) as Logical);
  if (x0 === null || x1 === null) return null;
  return x0 + (logical - base) * (x1 - x0);
}

/**
 * Converts a timestamp to an x coordinate. `timeToCoordinate` only resolves
 * times that match a bar exactly, so anchors saved on a different timeframe
 * need interpolation (between bars) or extrapolation (outside the loaded range)
 * via fractional logical indices.
 */
export function timeToCoordinateExtended(
  chart: IChartApiBase<Time>,
  candles: Candle[] | null | undefined,
  time: number,
): number | null {
  const x = chart.timeScale().timeToCoordinate(time as Time);
  if (x !== null) return x;

  if (!candles || candles.length < 2) return null;
  const maxIdx = candles.length - 1;
  const interval = candles[maxIdx].time - candles[maxIdx - 1].time;
  if (interval === 0) return null;

  if (time < candles[0].time) {
    const bars = (candles[0].time - time) / interval;
    return fractionalLogicalToCoordinate(chart, -bars);
  }
  if (time > candles[maxIdx].time) {
    const bars = (time - candles[maxIdx].time) / interval;
    return fractionalLogicalToCoordinate(chart, maxIdx + bars);
  }

  // Between two loaded bars: binary-search the bar at or before `time` and
  // interpolate a fractional logical index within that bar's span.
  let lo = 0;
  let hi = maxIdx;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (candles[mid].time <= time) lo = mid;
    else hi = mid - 1;
  }
  const span = lo < maxIdx ? candles[lo + 1].time - candles[lo].time : interval;
  const frac = span > 0 ? (time - candles[lo].time) / span : 0;
  return fractionalLogicalToCoordinate(chart, lo + frac);
}
