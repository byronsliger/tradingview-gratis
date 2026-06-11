import type { PineValue } from "../types";
import type { ExecutionContext } from "./context";

/**
 * Builtin ta.* con estado por call-site. El estado vive en
 * `ctx.callSiteStates` y por tanto se resetea al inicio de cada run.
 */
export interface TaBuiltin {
  params: string[];
  required: number;
  fn: (ctx: ExecutionContext, callSiteId: number, args: (PineValue | undefined)[]) => PineValue;
}

function num(v: PineValue | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function intLen(v: PineValue | undefined): number | null {
  const n = num(v);
  if (n === null) return null;
  const f = Math.floor(n);
  return f >= 1 ? f : null;
}

interface WindowState {
  values: (number | null)[];
}

function windowState(ctx: ExecutionContext, id: number, src: PineValue | undefined): WindowState {
  const st = ctx.getState<WindowState>(id, () => ({ values: [] }));
  st.values.push(num(src));
  return st;
}

/** Últimos n valores de la ventana, o null si faltan datos o hay na dentro. */
function lastN(st: WindowState, n: number): number[] | null {
  if (st.values.length < n) return null;
  const out: number[] = [];
  for (let i = st.values.length - n; i < st.values.length; i++) {
    const v = st.values[i];
    if (v === null) return null;
    out.push(v);
  }
  return out;
}

interface SmoothState {
  count: number;
  sum: number;
  prev: number;
}

// ema/rma: seed con SMA de los primeros `n` valores (igual que src/lib/indicators/ema.ts).
function smoothed(
  ctx: ExecutionContext,
  id: number,
  src: PineValue | undefined,
  length: PineValue | undefined,
  alphaOf: (n: number) => number,
): PineValue {
  const x = num(src);
  const n = intLen(length);
  if (x === null || n === null) return null;
  const st = ctx.getState<SmoothState>(id, () => ({ count: 0, sum: 0, prev: 0 }));
  st.count += 1;
  if (st.count <= n) {
    st.sum += x;
    if (st.count < n) return null;
    st.prev = st.sum / n;
    return st.prev;
  }
  const k = alphaOf(n);
  st.prev = x * k + st.prev * (1 - k);
  return st.prev;
}

interface RsiState {
  prev: number | null;
  count: number;
  gain: number;
  loss: number;
  seeded: boolean;
}

interface TrState {
  prevClose: number | null;
}

interface AtrState {
  prevClose: number | null;
  count: number;
  sum: number;
  prev: number;
}

interface CrossState {
  a: number | null;
  b: number | null;
}

function trueRange(ctx: ExecutionContext, prevClose: number | null, handleNa: boolean): number | null {
  const c = ctx.candles[ctx.barIndex];
  if (prevClose === null) return handleNa ? c.high - c.low : null;
  return Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
}

export const taBuiltins: Record<string, TaBuiltin> = {
  sma: {
    params: ["source", "length"],
    required: 2,
    fn: (ctx, id, args) => {
      const st = windowState(ctx, id, args[0]);
      const n = intLen(args[1]);
      if (n === null) return null;
      const w = lastN(st, n);
      if (!w) return null;
      let sum = 0;
      for (const v of w) sum += v;
      return sum / n;
    },
  },

  ema: {
    params: ["source", "length"],
    required: 2,
    fn: (ctx, id, args) => smoothed(ctx, id, args[0], args[1], (n) => 2 / (n + 1)),
  },

  rma: {
    params: ["source", "length"],
    required: 2,
    fn: (ctx, id, args) => smoothed(ctx, id, args[0], args[1], (n) => 1 / n),
  },

  // Wilder, replicando exactamente src/lib/indicators/rsi.ts (incluido rs=100 si loss==0).
  rsi: {
    params: ["source", "length"],
    required: 2,
    fn: (ctx, id, args) => {
      const x = num(args[0]);
      const n = intLen(args[1]);
      if (x === null || n === null) return null;
      const st = ctx.getState<RsiState>(id, () => ({
        prev: null,
        count: 0,
        gain: 0,
        loss: 0,
        seeded: false,
      }));
      if (st.prev === null) {
        st.prev = x;
        return null;
      }
      const diff = x - st.prev;
      st.prev = x;
      if (!st.seeded) {
        if (diff >= 0) st.gain += diff;
        else st.loss -= diff;
        st.count += 1;
        if (st.count < n) return null;
        st.gain /= n;
        st.loss /= n;
        st.seeded = true;
      } else {
        const g = diff > 0 ? diff : 0;
        const l = diff < 0 ? -diff : 0;
        st.gain = (st.gain * (n - 1) + g) / n;
        st.loss = (st.loss * (n - 1) + l) / n;
      }
      const rs = st.loss === 0 ? 100 : st.gain / st.loss;
      return 100 - 100 / (1 + rs);
    },
  },

  // Desviación estándar poblacional (biased, el default de Pine).
  stdev: {
    params: ["source", "length"],
    required: 2,
    fn: (ctx, id, args) => {
      const st = windowState(ctx, id, args[0]);
      const n = intLen(args[1]);
      if (n === null) return null;
      const w = lastN(st, n);
      if (!w) return null;
      let sum = 0;
      for (const v of w) sum += v;
      const mean = sum / n;
      let acc = 0;
      for (const v of w) acc += (v - mean) * (v - mean);
      return Math.sqrt(acc / n);
    },
  },

  // Con un solo argumento, Pine usa `high`/`low` como source implícito.
  highest: {
    params: ["source", "length"],
    required: 1,
    fn: (ctx, id, args) => {
      const single = args[1] === undefined;
      const src = single ? ctx.candles[ctx.barIndex].high : args[0];
      const st = windowState(ctx, id, src);
      const n = intLen(single ? args[0] : args[1]);
      if (n === null) return null;
      const w = lastN(st, n);
      if (!w) return null;
      let best = -Infinity;
      for (const v of w) if (v > best) best = v;
      return best;
    },
  },

  lowest: {
    params: ["source", "length"],
    required: 1,
    fn: (ctx, id, args) => {
      const single = args[1] === undefined;
      const src = single ? ctx.candles[ctx.barIndex].low : args[0];
      const st = windowState(ctx, id, src);
      const n = intLen(single ? args[0] : args[1]);
      if (n === null) return null;
      const w = lastN(st, n);
      if (!w) return null;
      let best = Infinity;
      for (const v of w) if (v < best) best = v;
      return best;
    },
  },

  change: {
    params: ["source", "length"],
    required: 1,
    fn: (ctx, id, args) => {
      const st = windowState(ctx, id, args[0]);
      const n = args[1] === undefined ? 1 : intLen(args[1]);
      if (n === null) return null;
      const curIdx = st.values.length - 1;
      const prevIdx = curIdx - n;
      if (prevIdx < 0) return null;
      const cur = st.values[curIdx];
      const prev = st.values[prevIdx];
      return cur === null || prev === null ? null : cur - prev;
    },
  },

  // tr = max(high-low, |high-close[1]|, |low-close[1]|). Primera barra: na
  // (o high-low con handle_na=true).
  tr: {
    params: ["handle_na"],
    required: 0,
    fn: (ctx, id, args) => {
      const st = ctx.getState<TrState>(id, () => ({ prevClose: null }));
      const v = trueRange(ctx, st.prevClose, args[0] === true);
      st.prevClose = ctx.candles[ctx.barIndex].close;
      return v;
    },
  },

  // atr = rma(tr(true), length) — como en Pine, la primera barra usa high-low.
  atr: {
    params: ["length"],
    required: 1,
    fn: (ctx, id, args) => {
      const st = ctx.getState<AtrState>(id, () => ({ prevClose: null, count: 0, sum: 0, prev: 0 }));
      const tr = trueRange(ctx, st.prevClose, true);
      st.prevClose = ctx.candles[ctx.barIndex].close;
      const n = intLen(args[0]);
      if (n === null || tr === null) return null;
      st.count += 1;
      if (st.count <= n) {
        st.sum += tr;
        if (st.count < n) return null;
        st.prev = st.sum / n;
        return st.prev;
      }
      st.prev = (st.prev * (n - 1) + tr) / n;
      return st.prev;
    },
  },

  // crossover(a, b) = a > b && a[1] <= b[1]; primera barra siempre false.
  crossover: {
    params: ["source1", "source2"],
    required: 2,
    fn: (ctx, id, args) => {
      const st = ctx.getState<CrossState>(id, () => ({ a: null, b: null }));
      const a = num(args[0]);
      const b = num(args[1]);
      const res = a !== null && b !== null && st.a !== null && st.b !== null && a > b && st.a <= st.b;
      st.a = a;
      st.b = b;
      return res;
    },
  },

  crossunder: {
    params: ["source1", "source2"],
    required: 2,
    fn: (ctx, id, args) => {
      const st = ctx.getState<CrossState>(id, () => ({ a: null, b: null }));
      const a = num(args[0]);
      const b = num(args[1]);
      const res = a !== null && b !== null && st.a !== null && st.b !== null && a < b && st.a >= st.b;
      st.a = a;
      st.b = b;
      return res;
    },
  },
};
