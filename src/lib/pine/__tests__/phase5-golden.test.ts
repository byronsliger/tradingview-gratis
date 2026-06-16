import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/binance/types";
import { adx } from "@/lib/indicators/adx";
import { squeezeMomentum } from "@/lib/indicators/squeeze-momentum";
import { compile, runScript, type PlotResult } from "@/lib/pine";
import type { CompiledScript } from "@/lib/pine/types";

/** PRNG determinístico (mulberry32) — mismas velas que ta-golden.test.ts. */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCandles(count: number, seed: number): Candle[] {
  const rand = mulberry32(seed);
  const candles: Candle[] = [];
  let prevClose = 100;
  for (let i = 0; i < count; i++) {
    const open = prevClose;
    const close = Math.max(1, open + (rand() - 0.5) * 4);
    const high = Math.max(open, close) + rand() * 2;
    const low = Math.max(0.5, Math.min(open, close) - rand() * 2);
    candles.push({
      time: 1_600_000_000 + i * 3600,
      open,
      high,
      low,
      close,
      volume: 100 + rand() * 900,
    });
    prevClose = close;
  }
  return candles;
}

const CANDLES = makeCandles(300, 42);

function mustCompile(src: string): CompiledScript {
  const res = compile(src);
  if (!res.ok) {
    throw new Error(res.diagnostics.map((d) => `${d.line}:${d.col} ${d.message}`).join("; "));
  }
  return res.script;
}

function plotByTitle(plots: PlotResult[], title: string): Map<number, number> {
  const p = plots.find((pl) => pl.spec.title === title);
  if (!p) throw new Error(`plot '${title}' no encontrado`);
  return new Map(p.points.map((pt) => [pt.time, pt.value]));
}

/** Compara dos mapas time→value con tolerancia relativa donde ambos existen. */
function expectMatch(
  got: Map<number, number>,
  refByTime: Map<number, number>,
  tol = 1e-8,
): void {
  expect(refByTime.size).toBeGreaterThan(0);
  let compared = 0;
  for (const [time, rv] of refByTime) {
    const gv = got.get(time);
    expect(gv, `falta valor en time=${time}`).not.toBeUndefined();
    compared++;
    const limit = tol * Math.max(1, Math.abs(gv!), Math.abs(rv));
    expect(Math.abs(gv! - rv)).toBeLessThanOrEqual(limit);
  }
  expect(compared).toBe(refByTime.size);
}

// ──────────────────────────────────────────────────────────────────────────
// Squeeze Momentum [LazyBear] en Pine real (subset que entra en Fase 5).
// El valor del histograma `val` depende solo de close/high/low (no de tr), así
// que el golden compara `val` contra squeezeMomentum().val.
// ──────────────────────────────────────────────────────────────────────────
const SQUEEZE_PINE = `
//@version=5
indicator("Squeeze Momentum [LazyBear]", overlay=false)
length = input.int(20, "BB Length")
mult = input.float(2.0, "BB MultFactor")
lengthKC = input.int(20, "KC Length")
multKC = input.float(1.5, "KC MultFactor")

source = close
basis = ta.sma(source, length)
dev = mult * ta.stdev(source, length)
upperBB = basis + dev
lowerBB = basis - dev

ma = ta.sma(source, lengthKC)
rangema = ta.sma(ta.tr(true), lengthKC)
upperKC = ma + rangema * multKC
lowerKC = ma - rangema * multKC

highest = ta.highest(high, lengthKC)
lowest = ta.lowest(low, lengthKC)
avgHL = (highest + lowest) / 2
avgClose = ta.sma(close, lengthKC)
src2 = bar_index < lengthKC - 1 ? 0.0 : source - (avgHL + avgClose) / 2
val = ta.linreg(src2, lengthKC, 0)

plot(val, "VAL")
`;

describe("golden fase 5: Squeeze Momentum [LazyBear]", () => {
  it("ta.linreg(close - midpoint, kc) ≡ squeezeMomentum().val", () => {
    const script = mustCompile(SQUEEZE_PINE);
    const result = runScript(script, CANDLES);
    const got = plotByTitle(result.plots, "VAL");
    const ref = squeezeMomentum(CANDLES, 20, 2.0, 20, 1.5, true);
    const refByTime = new Map(ref.map((p) => [p.time, p.val]));
    expectMatch(got, refByTime);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// DMI/ADX en Pine real, replicando el seeding exacto de src/lib/indicators/adx.ts
// (rma con startIndex; plusDI/minusDI con carry-forward; adxRma desde dilen-1).
// ──────────────────────────────────────────────────────────────────────────
const ADX_PINE = `
//@version=5
indicator("DMI/ADX")
dilen = input.int(14, "DI Length")
adxlen = input.int(14, "ADX Smoothing")

up = nz(high - high[1])
down = nz(low[1] - low)
plusDM = (up > down and up > 0) ? up : 0.0
minusDM = (down > up and down > 0) ? down : 0.0

trur = ta.rma(ta.tr(true), dilen)
plusRma = ta.rma(plusDM, dilen)
minusRma = ta.rma(minusDM, dilen)

var float plusDI = 0.0
var float minusDI = 0.0
if trur != 0 and bar_index >= dilen - 1
    plusDI := 100 * plusRma / trur
    minusDI := 100 * minusRma / trur

diSum = plusDI + minusDI
dx = bar_index < dilen - 1 ? 0.0 : math.abs(plusDI - minusDI) / (diSum == 0 ? 1 : diSum)

seedBar = dilen + adxlen - 2
dxSeed = ta.sma(dx, adxlen)
var float adxVal = 0.0
if bar_index == seedBar
    adxVal := dxSeed
else if bar_index > seedBar
    adxVal := (adxVal * (adxlen - 1) + dx) / adxlen

plot(100 * adxVal, "ADX")
plot(plusDI, "+DI")
plot(minusDI, "-DI")
`;

describe("golden fase 5: DMI/ADX", () => {
  it("ADX, +DI y -DI ≡ adx() builtin", () => {
    const script = mustCompile(ADX_PINE);
    const result = runScript(script, CANDLES);
    const ref = adx(CANDLES, 14, 14);

    const gotAdx = plotByTitle(result.plots, "ADX");
    const gotPlus = plotByTitle(result.plots, "+DI");
    const gotMinus = plotByTitle(result.plots, "-DI");

    // Solo comparamos desde el warmup del builtin (donde ambos tienen valor).
    expectMatch(gotAdx, new Map(ref.map((p) => [p.time, p.adx])));
    expectMatch(gotPlus, new Map(ref.map((p) => [p.time, p.plusDI])));
    expectMatch(gotMinus, new Map(ref.map((p) => [p.time, p.minusDI])));
  });
});
