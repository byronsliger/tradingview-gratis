import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/binance/types";
import { compile, runScript } from "@/lib/pine";
import { PineRuntimeError } from "@/lib/pine/errors";
import type { CompiledScript } from "@/lib/pine/types";

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

function plotValues(src: string, closes: number[]): number[] {
  const script = mustCompile(src);
  return runScript(script, candlesFromCloses(closes)).plots[0].points.map((p) => p.value);
}

describe("fase 5: if como statement", () => {
  it("if/else asigna vía := según la condición", () => {
    const src = [
      "var x = 0",
      "if close > 15",
      "    x := 1",
      "else",
      "    x := -1",
      "plot(x)",
    ].join("\n");
    expect(plotValues(src, [10, 20, 5, 30])).toEqual([-1, 1, -1, 1]);
  });

  it("else if encadenado", () => {
    const src = [
      "var g = 0",
      "if close > 25",
      "    g := 2",
      "else if close > 15",
      "    g := 1",
      "else",
      "    g := 0",
      "plot(g)",
    ].join("\n");
    expect(plotValues(src, [10, 20, 30])).toEqual([0, 1, 2]);
  });
});

describe("fase 5: if como expresión", () => {
  it("x = if cond \\n 1 \\n else \\n 2", () => {
    const src = [
      "x = if close > 15",
      "    1",
      "else",
      "    2",
      "plot(x)",
    ].join("\n");
    expect(plotValues(src, [10, 20, 5])).toEqual([2, 1, 2]);
  });

  it("if-expr sin else devuelve na (punto omitido)", () => {
    const src = ["x = if close > 15\n    1", "plot(x)"].join("\n");
    // closes 10, 20, 5 → solo la barra 20 produce valor
    const points = plotValues(src, [10, 20, 5]);
    expect(points).toEqual([1]);
  });
});

describe("fase 5: for con break/continue y fuel", () => {
  it("for suma 1..n", () => {
    const src = [
      "total = 0.0",
      "for i = 1 to 5",
      "    total := total + i",
      "plot(total)",
    ].join("\n");
    expect(plotValues(src, [1, 1])).toEqual([15, 15]);
  });

  it("for con by paso", () => {
    const src = [
      "total = 0.0",
      "for i = 0 to 10 by 2",
      "    total := total + i",
      "plot(total)",
    ].join("\n");
    expect(plotValues(src, [1])).toEqual([0 + 2 + 4 + 6 + 8 + 10]);
  });

  it("break corta el bucle", () => {
    const src = [
      "total = 0.0",
      "for i = 1 to 100",
      "    if i > 3",
      "        break",
      "    total := total + i",
      "plot(total)",
    ].join("\n");
    expect(plotValues(src, [1])).toEqual([1 + 2 + 3]);
  });

  it("continue salta una iteración", () => {
    const src = [
      "total = 0.0",
      "for i = 1 to 5",
      "    if i == 3",
      "        continue",
      "    total := total + i",
      "plot(total)",
    ].join("\n");
    expect(plotValues(src, [1])).toEqual([1 + 2 + 4 + 5]);
  });

  it("for descendente", () => {
    const src = [
      "total = 0.0",
      "for i = 3 to 1",
      "    total := total + i",
      "plot(total)",
    ].join("\n");
    expect(plotValues(src, [1])).toEqual([6]);
  });

  it("un for enorme aborta con PineRuntimeError de fuel", () => {
    const src = [
      "total = 0.0",
      "for i = 0 to 1000000000",
      "    total := total + 1",
      "plot(total)",
    ].join("\n");
    const script = mustCompile(src);
    expect(() => runScript(script, candlesFromCloses([1]))).toThrow(PineRuntimeError);
    expect(() => runScript(script, candlesFromCloses([1]))).toThrow(/Límite de ejecución/);
  });
});

describe("fase 5: switch", () => {
  it("switch con sujeto", () => {
    const src = [
      'mode = "b"',
      "v = switch mode",
      '    "a" => 1',
      '    "b" => 2',
      "    => 0",
      "plot(v)",
    ].join("\n");
    expect(plotValues(src, [1, 1])).toEqual([2, 2]);
  });

  it("switch sin sujeto (condiciones booleanas)", () => {
    const src = [
      "v = switch",
      "    close > 15 => 1",
      "    close > 5 => 2",
      "    => 0",
      "plot(v)",
    ].join("\n");
    expect(plotValues(src, [20, 10, 1])).toEqual([1, 2, 0]);
  });
});

describe("fase 5: destructuring [a, b] = f()", () => {
  it("desestructura una tupla devuelta por ta.macd", () => {
    const src = [
      "[m, s, h] = ta.macd(close, 3, 6, 4)",
      "plot(h)",
    ].join("\n");
    const closes = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i) * 5);
    const points = plotValues(src, closes);
    expect(points.length).toBeGreaterThan(0);
  });

  it("desestructura una tupla de función de usuario", () => {
    const src = [
      "f(x) => [x + 1, x - 1]",
      "[a, b] = f(close)",
      "plot(a - b)",
    ].join("\n");
    expect(plotValues(src, [10, 20])).toEqual([2, 2]);
  });
});

describe("fase 5: funciones de usuario", () => {
  it("función de una línea", () => {
    const src = ["double(x) => x * 2", "plot(double(close))"].join("\n");
    expect(plotValues(src, [10, 20])).toEqual([20, 40]);
  });

  it("función multilínea (última expr = retorno)", () => {
    const src = [
      "avg3(a, b, c) =>",
      "    s = a + b + c",
      "    s / 3",
      "plot(avg3(close, close, close))",
    ].join("\n");
    expect(plotValues(src, [9, 30])).toEqual([9, 30]);
  });

  it("ta.* dentro de una función mantiene estado por barra", () => {
    const src = [
      "mysma(src, len) => ta.sma(src, len)",
      "plot(mysma(close, 3))",
    ].join("\n");
    const closes = [2, 4, 6, 8, 10];
    // sma(close,3): bar2=4, bar3=6, bar4=8
    expect(plotValues(src, closes)).toEqual([4, 6, 8]);
  });

  it("dos call-sites de la misma función tienen estado ta.* independiente", () => {
    const src = [
      "myema(src, len) => ta.ema(src, len)",
      "a = myema(close, 3)",
      "b = myema(high, 3)",
      "plot(a - b)",
    ].join("\n");
    // high = close + 1 siempre → ema(close)-ema(high) = -1 cuando ambos seedados
    const closes = [10, 12, 14, 16, 18];
    const pts = plotValues(src, closes);
    expect(pts[pts.length - 1]).toBeCloseTo(-1, 8);
  });

  it("scopes locales: el parámetro no contamina el global", () => {
    const src = [
      "x = 100.0",
      "f(x) => x + 1",
      "y = f(close)",
      "plot(x + y * 0)",
    ].join("\n");
    expect(plotValues(src, [5, 5])).toEqual([100, 100]);
  });

  it("función con tupla literal de retorno destructurada en el llamador", () => {
    // Reproduce el patrón dirmov() del DMI: la última línea es `[plus, minus]`
    // (literal de tupla), NO una declaración `[a, b] = …`.
    const src = [
      "sumdiff(a, b) =>",
      "    s = a + b",
      "    d = a - b",
      "    [s, d]",
      "[suma, resta] = sumdiff(high, low)",
      "plot(suma - resta)",
    ].join("\n");
    // suma - resta = (high+low) - (high-low) = 2*low; low = close - 1
    expect(plotValues(src, [10, 20])).toEqual([2 * 9, 2 * 19]);
  });
});
