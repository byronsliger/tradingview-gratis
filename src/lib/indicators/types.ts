/** A single time-value point returned by most indicators. */
export interface IndicatorPoint {
  time: number;
  value: number;
}

/** A single MACD output point. */
export interface MACDPoint {
  time: number;
  macd: number;
  signal: number;
  histogram: number;
}

/** A single Squeeze Momentum output point. */
export interface SqueezeMomPoint {
  time: number;
  val: number;     // momentum histogram value
  sqzOn: boolean;  // Squeeze ON  → black dot
  sqzOff: boolean; // Squeeze OFF → gray  dot
  noSqz: boolean;  // No squeeze  → blue  dot
}

/** A single ADX output point. */
export interface ADXPoint {
  time: number;
  adx: number;
  plusDI: number;
  minusDI: number;
}
