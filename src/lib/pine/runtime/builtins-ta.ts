import type { PineValue } from "../types";
import type { ExecutionContext } from "./context";
import { TupleValue, type EvalValue } from "./values";

/**
 * Builtin ta.* con estado por call-site. El estado vive en
 * `ctx.callSiteStates` y por tanto se resetea al inicio de cada run.
 * Algunos (macd/bb/kc) devuelven una TupleValue.
 */
export interface TaBuiltin {
  params: string[];
  required: number;
  fn: (ctx: ExecutionContext, callSiteId: number, args: (PineValue | undefined)[]) => EvalValue;
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

  // cross(a, b) = crossover(a, b) or crossunder(a, b).
  cross: {
    params: ["source1", "source2"],
    required: 2,
    fn: (ctx, id, args) => {
      const st = ctx.getState<CrossState>(id, () => ({ a: null, b: null }));
      const a = num(args[0]);
      const b = num(args[1]);
      const res =
        a !== null && b !== null && st.a !== null && st.b !== null &&
        ((a > b && st.a <= st.b) || (a < b && st.a >= st.b));
      st.a = a;
      st.b = b;
      return res;
    },
  },

  // Weighted moving average: pesos lineales 1..n (n = más reciente).
  wma: {
    params: ["source", "length"],
    required: 2,
    fn: (ctx, id, args) => {
      const st = windowState(ctx, id, args[0]);
      const n = intLen(args[1]);
      if (n === null) return null;
      const w = lastN(st, n);
      if (!w) return null;
      let num0 = 0;
      let den = 0;
      for (let i = 0; i < n; i++) {
        const weight = i + 1;
        num0 += w[i] * weight;
        den += weight;
      }
      return num0 / den;
    },
  },

  // Volume-weighted moving average: sum(src*vol, n) / sum(vol, n).
  vwma: {
    params: ["source", "length"],
    required: 2,
    fn: (ctx, id, args) => {
      const st = ctx.getState<{ sv: (number | null)[]; v: (number | null)[] }>(id, () => ({
        sv: [],
        v: [],
      }));
      const src = num(args[0]);
      const vol = ctx.candles[ctx.barIndex].volume;
      st.sv.push(src === null ? null : src * vol);
      st.v.push(src === null ? null : vol);
      const n = intLen(args[1]);
      if (n === null || st.sv.length < n) return null;
      let sumSV = 0;
      let sumV = 0;
      for (let i = st.sv.length - n; i < st.sv.length; i++) {
        const a = st.sv[i];
        const b = st.v[i];
        if (a === null || b === null) return null;
        sumSV += a;
        sumV += b;
      }
      return sumV === 0 ? null : sumSV / sumV;
    },
  },

  // Linear regression: valor ajustado en el último punto (offset 0 por defecto).
  // Coincide con linreg() de src/lib/indicators/squeeze-momentum.ts.
  linreg: {
    params: ["source", "length", "offset"],
    required: 2,
    fn: (ctx, id, args) => {
      const st = windowState(ctx, id, args[0]);
      const n = intLen(args[1]);
      if (n === null) return null;
      const offset = args[2] === undefined ? 0 : intOrZero(args[2]);
      const w = lastN(st, n);
      if (!w) return null;
      let sumX = 0;
      let sumY = 0;
      let sumXY = 0;
      let sumX2 = 0;
      for (let j = 0; j < n; j++) {
        sumX += j;
        sumY += w[j];
        sumXY += j * w[j];
        sumX2 += j * j;
      }
      const denom = n * sumX2 - sumX * sumX;
      if (denom === 0) return null;
      const slope = (n * sumXY - sumX * sumY) / denom;
      const intercept = (sumY - slope * sumX) / n;
      return intercept + slope * (n - 1 - offset);
    },
  },

  // mom(src, n) = src - src[n].
  mom: {
    params: ["source", "length"],
    required: 2,
    fn: (ctx, id, args) => {
      const st = windowState(ctx, id, args[0]);
      const n = intLen(args[1]);
      if (n === null) return null;
      const curIdx = st.values.length - 1;
      const prevIdx = curIdx - n;
      if (prevIdx < 0) return null;
      const cur = st.values[curIdx];
      const prev = st.values[prevIdx];
      return cur === null || prev === null ? null : cur - prev;
    },
  },

  // roc(src, n) = 100 * (src - src[n]) / src[n].
  roc: {
    params: ["source", "length"],
    required: 2,
    fn: (ctx, id, args) => {
      const st = windowState(ctx, id, args[0]);
      const n = intLen(args[1]);
      if (n === null) return null;
      const curIdx = st.values.length - 1;
      const prevIdx = curIdx - n;
      if (prevIdx < 0) return null;
      const cur = st.values[curIdx];
      const prev = st.values[prevIdx];
      if (cur === null || prev === null || prev === 0) return null;
      return (100 * (cur - prev)) / prev;
    },
  },

  // sum(src, n): suma móvil de los últimos n valores.
  sum: {
    params: ["source", "length"],
    required: 2,
    fn: (ctx, id, args) => {
      const st = windowState(ctx, id, args[0]);
      const n = intLen(args[1]);
      if (n === null) return null;
      const w = lastN(st, n);
      if (!w) return null;
      let s = 0;
      for (const v of w) s += v;
      return s;
    },
  },

  // cum(src): suma acumulada desde la primera barra (na cuenta como 0).
  cum: {
    params: ["source"],
    required: 1,
    fn: (ctx, id, args) => {
      const st = ctx.getState<{ acc: number }>(id, () => ({ acc: 0 }));
      const x = num(args[0]);
      if (x !== null) st.acc += x;
      return st.acc;
    },
  },

  // barssince(cond): nº de barras desde que cond fue true por última vez.
  barssince: {
    params: ["condition"],
    required: 1,
    fn: (ctx, id, args) => {
      const st = ctx.getState<{ count: number | null }>(id, () => ({ count: null }));
      const cond = toCond(args[0]);
      if (cond) st.count = 0;
      else if (st.count !== null) st.count += 1;
      return st.count;
    },
  },

  // valuewhen(cond, src, occurrence): valor de src en la n-ésima ocurrencia de cond.
  valuewhen: {
    params: ["condition", "source", "occurrence"],
    required: 2,
    fn: (ctx, id, args) => {
      const st = ctx.getState<{ history: PineValue[] }>(id, () => ({ history: [] }));
      const cond = toCond(args[0]);
      if (cond) st.history.unshift(args[1] ?? null);
      const occ = args[2] === undefined ? 0 : intOrZero(args[2]);
      const idx = occ < 0 ? 0 : occ;
      return idx < st.history.length ? st.history[idx] : null;
    },
  },

  // Bollinger Bands: [basis, upper, lower] con basis=sma, dev=stdev*mult.
  bb: {
    params: ["source", "length", "mult"],
    required: 3,
    fn: (ctx, id, args) => {
      const st = windowState(ctx, id, args[0]);
      const n = intLen(args[1]);
      const mult = num(args[2]);
      if (n === null || mult === null) return new TupleValue([null, null, null]);
      const w = lastN(st, n);
      if (!w) return new TupleValue([null, null, null]);
      let sum = 0;
      for (const v of w) sum += v;
      const basis = sum / n;
      let acc = 0;
      for (const v of w) acc += (v - basis) * (v - basis);
      const dev = Math.sqrt(acc / n) * mult;
      return new TupleValue([basis, basis + dev, basis - dev]);
    },
  },

  // Keltner Channel: [basis, upper, lower]. basis=ema; rango=ema(useTrueRange? tr : high-low).
  kc: {
    params: ["source", "length", "mult", "useTrueRange"],
    required: 3,
    fn: (ctx, id, args) => {
      const useTR = args[3] === undefined ? true : toCond(args[3]);
      const st = ctx.getState<{
        basis: SmoothLocal;
        range: SmoothLocal;
        prevClose: number | null;
      }>(id, () => ({
        basis: { count: 0, sum: 0, prev: 0 },
        range: { count: 0, sum: 0, prev: 0 },
        prevClose: null,
      }));
      const x = num(args[0]);
      const n = intLen(args[1]);
      const mult = num(args[2]);
      const c = ctx.candles[ctx.barIndex];
      const span = useTR
        ? st.prevClose === null
          ? c.high - c.low
          : Math.max(c.high - c.low, Math.abs(c.high - st.prevClose), Math.abs(c.low - st.prevClose))
        : c.high - c.low;
      st.prevClose = c.close;
      if (x === null || n === null || mult === null) return new TupleValue([null, null, null]);
      const basis = emaLocal(st.basis, x, n);
      const rangema = emaLocal(st.range, span, n);
      if (basis === null || rangema === null) return new TupleValue([null, null, null]);
      return new TupleValue([basis, basis + rangema * mult, basis - rangema * mult]);
    },
  },

  // MACD: [macdLine, signalLine, histLine] con EMAs (alineado con indicators/macd.ts).
  macd: {
    params: ["source", "fastlen", "slowlen", "siglen"],
    required: 4,
    fn: (ctx, id, args) => {
      const st = ctx.getState<{
        fast: SmoothLocal;
        slow: SmoothLocal;
        sig: SmoothLocal;
      }>(id, () => ({
        fast: { count: 0, sum: 0, prev: 0 },
        slow: { count: 0, sum: 0, prev: 0 },
        sig: { count: 0, sum: 0, prev: 0 },
      }));
      const x = num(args[0]);
      const fastN = intLen(args[1]);
      const slowN = intLen(args[2]);
      const sigN = intLen(args[3]);
      if (x === null || fastN === null || slowN === null || sigN === null) {
        return new TupleValue([null, null, null]);
      }
      const emaFast = emaLocal(st.fast, x, fastN);
      const emaSlow = emaLocal(st.slow, x, slowN);
      if (emaFast === null || emaSlow === null) return new TupleValue([null, null, null]);
      const macdLine = emaFast - emaSlow;
      const signal = emaLocal(st.sig, macdLine, sigN);
      if (signal === null) return new TupleValue([macdLine, null, null]);
      return new TupleValue([macdLine, signal, macdLine - signal]);
    },
  },
};

/** Estado local de un EMA/RMA seedeado con SMA (mismo patrón que `smoothed`). */
interface SmoothLocal {
  count: number;
  sum: number;
  prev: number;
}

function emaLocal(st: SmoothLocal, x: number, n: number): number | null {
  st.count += 1;
  if (st.count <= n) {
    st.sum += x;
    if (st.count < n) return null;
    st.prev = st.sum / n;
    return st.prev;
  }
  const k = 2 / (n + 1);
  st.prev = x * k + st.prev * (1 - k);
  return st.prev;
}

function intOrZero(v: PineValue | undefined): number {
  const n = num(v);
  return n === null ? 0 : Math.floor(n);
}

function toCond(v: PineValue | undefined): boolean {
  if (v === null || v === undefined || v === false) return false;
  if (v === true) return true;
  if (typeof v === "number") return v !== 0;
  return v.length > 0;
}
