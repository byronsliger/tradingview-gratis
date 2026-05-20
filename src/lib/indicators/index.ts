/**
 * @/lib/indicators — barrel export
 *
 * Each indicator lives in its own file. Import directly from the specific
 * file when you only need one function, or use this barrel for convenience.
 *
 * Adding a new indicator:
 *   1. Create  src/lib/indicators/<name>.ts
 *   2. Add its export(s) here
 */

export type { IndicatorPoint, MACDPoint, SqueezeMomPoint, ADXPoint } from "./types";

export { sma }                from "./sma";
export { ema }                from "./ema";
export { rsi }                from "./rsi";
export { macd }               from "./macd";
export { stdev, linreg, squeezeMomentum } from "./squeeze-momentum";
export { adx }                from "./adx";
export { calculateVRVP }       from "./vrvp";
export type { VRVPBin, VRVPResult } from "./vrvp";

