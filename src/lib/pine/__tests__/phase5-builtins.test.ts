import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/binance/types";
import { macd } from "@/lib/indicators/macd";
import { compile, runScript } from "@/lib/pine";
import type { CompiledScript } from "@/lib/pine/types";

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

const CANDLES = makeCandles(200, 7);

function candlesFromCloses(closes: number[]): Candle[] {
  return closes.map((close, i) => ({
    time: 1_700_000_000 + i * 60,
    open: i === 0 ? close : closes[i - 1],
    high: close + 1,
    low: close - 1,
    close,
    volume: 100 + i,
  }));
}

function mustCompile(src: string): CompiledScript {
  const res = compile(src);
  if (!res.ok) {
    throw new Error(res.diagnostics.map((d) => `${d.line}:${d.col} ${d.message}`).join("; "));
  }
  return res.script;
}

function plot(src: string, candles: Candle[]): { time: number; value: number }[] {
  return runScript(mustCompile(src), candles).plots[0].points;
}

function vals(src: string, closes: number[]): number[] {
  return plot(src, candlesFromCloses(closes)).map((p) => p.value);
}

describe("fase 5: ta.macd ≡ macd() builtin", () => {
  it("la línea MACD y la señal coinciden con indicators/macd.ts", () => {
    const macdLine = plot("[m, s, h] = ta.macd(close, 12, 26, 9)\nplot(m)", CANDLES);
    const sigLine = plot("[m, s, h] = ta.macd(close, 12, 26, 9)\nplot(s)", CANDLES);
    const ref = macd(CANDLES, 12, 26, 9);
    const refMacd = new Map(ref.map((p) => [p.time, p.macd]));
    const refSig = new Map(ref.map((p) => [p.time, p.signal]));
    let compared = 0;
    for (const p of sigLine) {
      const rm = refMacd.get(p.time);
      const rs = refSig.get(p.time);
      if (rm === undefined || rs === undefined) continue;
      compared++;
      const m = macdLine.find((q) => q.time === p.time)!.value;
      expect(Math.abs(m - rm)).toBeLessThanOrEqual(1e-8 * Math.max(1, Math.abs(rm)));
      expect(Math.abs(p.value - rs)).toBeLessThanOrEqual(1e-8 * Math.max(1, Math.abs(rs)));
    }
    expect(compared).toBe(ref.length);
  });
});

describe("fase 5: ta.bb y ta.kc", () => {
  it("bb devuelve [basis, upper, lower] con basis=sma", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i));
    const basis = vals("[b, u, l] = ta.bb(close, 20, 2)\nplot(b)", closes);
    const sma = vals("plot(ta.sma(close, 20))", closes);
    expect(basis.length).toBe(sma.length);
    basis.forEach((b, i) => expect(b).toBeCloseTo(sma[i], 8));
  });

  it("bb upper/lower equidistan de la basis", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + (i % 5));
    const upper = vals("[b, u, l] = ta.bb(close, 20, 2)\nplot(u)", closes);
    const lower = vals("[b, u, l] = ta.bb(close, 20, 2)\nplot(l)", closes);
    const basis = vals("[b, u, l] = ta.bb(close, 20, 2)\nplot(b)", closes);
    upper.forEach((u, i) =>
      expect(u - basis[i]).toBeCloseTo(basis[i] - lower[i], 8),
    );
  });

  it("kc devuelve una tupla utilizable", () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + Math.cos(i) * 3);
    const basis = vals("[b, u, l] = ta.kc(close, 20, 1.5, true)\nplot(b)", closes);
    const ema = vals("plot(ta.ema(close, 20))", closes);
    expect(basis.length).toBe(ema.length);
    basis.forEach((b, i) => expect(b).toBeCloseTo(ema[i], 8));
  });
});

describe("fase 5: ta.linreg / wma / vwma", () => {
  it("linreg de una recta perfecta devuelve el último valor", () => {
    const closes = Array.from({ length: 20 }, (_, i) => 2 * i + 1);
    const lr = vals("plot(ta.linreg(close, 5, 0))", closes);
    // recta y=2x+1 → linreg predice exactamente el valor actual
    const expected = closes.slice(4).map((c) => c);
    lr.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 6));
  });

  it("wma pondera linealmente", () => {
    // wma de [1,2,3] con len 3 = (1*1 + 2*2 + 3*3)/6 = 14/6
    const w = vals("plot(ta.wma(close, 3))", [1, 2, 3]);
    expect(w[0]).toBeCloseTo(14 / 6, 8);
  });

  it("vwma usa el volumen", () => {
    const out = vals("plot(ta.vwma(close, 2))", [10, 20, 30]);
    expect(out.length).toBe(2);
  });
});

describe("fase 5: mom / roc / cross", () => {
  it("mom(close, 1) = close - close[1]", () => {
    expect(vals("plot(ta.mom(close, 1))", [10, 13, 11])).toEqual([3, -2]);
  });

  it("roc(close, 1) = 100*(close-close[1])/close[1]", () => {
    const out = vals("plot(ta.roc(close, 1))", [10, 20]);
    expect(out[0]).toBeCloseTo(100, 8);
  });

  it("cross detecta cruce en ambas direcciones", () => {
    const out = vals(
      "plot(ta.cross(close, 15) ? 1 : 0)",
      [10, 20, 12],
    );
    // bar1: 10→20 cruza 15 hacia arriba; bar2: 20→12 cruza hacia abajo
    expect(out).toEqual([0, 1, 1]);
  });
});

describe("fase 5: barssince / valuewhen / cum / sum", () => {
  it("barssince cuenta barras desde la última condición true", () => {
    const out = vals("plot(nz(ta.barssince(close > 15), -1))", [20, 10, 10, 30, 10]);
    expect(out).toEqual([0, 1, 2, 0, 1]);
  });

  it("valuewhen devuelve el valor en la última ocurrencia", () => {
    const out = vals("plot(nz(ta.valuewhen(close > 15, close, 0), -1))", [
      20, 10, 30, 5,
    ]);
    // bar0: cond true → 20; bar1: última=20; bar2: cond true → 30; bar3: 30
    expect(out).toEqual([20, 20, 30, 30]);
  });

  it("cum acumula", () => {
    expect(vals("plot(ta.cum(close))", [1, 2, 3, 4])).toEqual([1, 3, 6, 10]);
  });

  it("ta.sum es la suma móvil", () => {
    expect(vals("plot(ta.sum(close, 2))", [1, 2, 3, 4])).toEqual([3, 5, 7]);
  });
});

describe("fase 5: math.* nuevos", () => {
  it("math.sum / sign / sin / cos / tan / todegrees / toradians", () => {
    expect(vals("plot(math.sum(1, 2, 3, 4))", [1])).toEqual([10]);
    expect(vals("plot(math.sign(0 - close))", [5])).toEqual([-1]);
    expect(vals("plot(math.sin(0))", [1])).toEqual([0]);
    expect(vals("plot(math.cos(0))", [1])).toEqual([1]);
    const deg = vals("plot(math.todegrees(math.pi))", [1]);
    expect(deg[0]).toBeCloseTo(180, 8);
    const rad = vals("plot(math.toradians(180))", [1]);
    expect(rad[0]).toBeCloseTo(Math.PI, 8);
    const tan = vals("plot(math.tan(0))", [1]);
    expect(tan[0]).toBeCloseTo(0, 8);
  });
});

describe("fase 5: color.new / color.rgb", () => {
  it("color.new aplica transparencia como alpha hex", () => {
    const script = mustCompile(
      "plot(close, color = color.new(color.red, 0))",
    );
    const c0 = runScript(script, candlesFromCloses([1])).plots[0].points[0].color;
    expect(c0).toBe("#F23645FF"); // transp 0 → alpha FF (opaco)

    const script50 = mustCompile(
      "plot(close, color = color.new(color.red, 50))",
    );
    const c50 = runScript(script50, candlesFromCloses([1])).plots[0].points[0].color;
    expect(c50).toBe("#F2364580"); // 50% → 0x80
  });

  it("color.rgb construye un hex", () => {
    const script = mustCompile("plot(close, color = color.rgb(255, 0, 0))");
    const c = runScript(script, candlesFromCloses([1])).plots[0].points[0].color;
    expect(c).toBe("#FF0000");
  });
});
