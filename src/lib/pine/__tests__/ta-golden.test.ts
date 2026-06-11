import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/binance/types";
import { ema } from "@/lib/indicators/ema";
import { rsi } from "@/lib/indicators/rsi";
import { sma } from "@/lib/indicators/sma";
import type { IndicatorPoint } from "@/lib/indicators/types";
import { compile, runScript, type PlotPoint } from "@/lib/pine";

/** PRNG determinístico (mulberry32) para velas sintéticas reproducibles. */
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

function runPlot(src: string, candles: Candle[]): PlotPoint[] {
  const res = compile(src);
  if (!res.ok) {
    throw new Error(res.diagnostics.map((d) => `${d.line}:${d.col} ${d.message}`).join("; "));
  }
  return runScript(res.script, candles).plots[0].points;
}

/**
 * Compara punto a punto con tolerancia relativa 1e-8, solo donde ambos lados
 * tienen valor (mismo time). Exige además el mismo número de puntos.
 */
function expectGoldenMatch(points: PlotPoint[], ref: IndicatorPoint[]): void {
  expect(ref.length).toBeGreaterThan(0);
  expect(points.length).toBe(ref.length);
  const refByTime = new Map(ref.map((p) => [p.time, p.value]));
  let compared = 0;
  for (const p of points) {
    const rv = refByTime.get(p.time);
    if (rv === undefined) continue;
    compared++;
    const tol = 1e-8 * Math.max(1, Math.abs(p.value), Math.abs(rv));
    expect(Math.abs(p.value - rv)).toBeLessThanOrEqual(tol);
  }
  expect(compared).toBe(ref.length);
}

describe("golden: ta.* vs src/lib/indicators", () => {
  it("ta.rsi(close, 14) ≡ rsi() (Wilder)", () => {
    const points = runPlot('indicator("g")\nplot(ta.rsi(close, 14))', CANDLES);
    expectGoldenMatch(points, rsi(CANDLES, 14));
  });

  it("ta.ema(close, 20) ≡ ema() (seed con SMA)", () => {
    const points = runPlot('indicator("g")\nplot(ta.ema(close, 20))', CANDLES);
    expectGoldenMatch(points, ema(CANDLES, 20));
  });

  it("ta.sma(close, 50) ≡ sma()", () => {
    const points = runPlot('indicator("g")\nplot(ta.sma(close, 50))', CANDLES);
    expectGoldenMatch(points, sma(CANDLES, 50));
  });

  it("también con otros periodos (rsi 7, ema 9, sma 10)", () => {
    expectGoldenMatch(
      runPlot('indicator("g")\nplot(ta.rsi(close, 7))', CANDLES),
      rsi(CANDLES, 7),
    );
    expectGoldenMatch(
      runPlot('indicator("g")\nplot(ta.ema(close, 9))', CANDLES),
      ema(CANDLES, 9),
    );
    expectGoldenMatch(
      runPlot('indicator("g")\nplot(ta.sma(close, 10))', CANDLES),
      sma(CANDLES, 10),
    );
  });
});
