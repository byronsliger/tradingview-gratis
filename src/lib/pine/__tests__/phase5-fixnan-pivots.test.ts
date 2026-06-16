import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/binance/types";
import { compile, runScript } from "@/lib/pine";
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

function plotPoints(src: string, closes: number[]) {
  return runScript(mustCompile(src), candlesFromCloses(closes)).plots[0].points;
}

describe("fixnan", () => {
  it("arrastra el último valor no-na (rellena los na intermedios)", () => {
    // pivothigh es na salvo en los pivotes (3 y 5); fixnan los mantiene.
    const pts = plotPoints(
      "plot(fixnan(ta.pivothigh(close, 1, 1)))",
      [1, 2, 3, 2, 1, 2, 5, 2, 1],
    );
    // pivothigh: na,na,na,3,na,na,na,5,na → fixnan: na,na,na,3,3,3,3,5,5
    expect(pts.map((p) => p.value)).toEqual([3, 3, 3, 3, 5, 5]);
  });
});

describe("ta.pivothigh / ta.pivotlow", () => {
  it("pivothigh detecta el máximo estricto right barras atrás", () => {
    // closes 1,2,3,2,1 con (left=1,right=1): pivote (valor 3) aparece en la barra 3.
    const pts = plotPoints("plot(ta.pivothigh(close, 1, 1))", [1, 2, 3, 2, 1]);
    expect(pts).toHaveLength(1);
    expect(pts[0].value).toBe(3);
  });

  it("pivotlow detecta el mínimo estricto", () => {
    const pts = plotPoints("plot(ta.pivotlow(close, 1, 1))", [3, 2, 1, 2, 3]);
    expect(pts).toHaveLength(1);
    expect(pts[0].value).toBe(1);
  });
});

describe("historial de variables locales y parámetros en funciones", () => {
  it("el parámetro es una serie con historial: s[1] = valor de la barra previa", () => {
    const pts = plotPoints("f(s) => s[1]\nplot(f(close))", [10, 20, 30]);
    // f(close)=close[1]: na,10,20 → barra0 na (sin punto)
    expect(pts.map((p) => p.value)).toEqual([10, 20]);
  });

  it("un local plano conserva historial: running-max con m[1]", () => {
    const src = [
      "biggest(series) =>",
      "    m = 0.0",
      "    m := nz(m[1], series)",
      "    if series > m",
      "        m := series",
      "    m",
      "plot(biggest(close))",
    ].join("\n");
    // closes 5,3,8,8,2 → running max: 5,5,8,8,8
    expect(plotPoints(src, [5, 3, 8, 8, 2]).map((p) => p.value)).toEqual([5, 5, 8, 8, 8]);
  });

  it("dos call-sites de la misma función mantienen historial independiente", () => {
    const src = [
      "prev(s) => s[1]",
      "a = prev(close)",
      "b = prev(high)",
      "plot(a - b)",
    ].join("\n");
    // high = close + 1 → prev(close) - prev(high) = -1 desde la barra 1
    const pts = plotPoints(src, [10, 20, 30]);
    expect(pts.every((p) => p.value === -1)).toBe(true);
  });
});
