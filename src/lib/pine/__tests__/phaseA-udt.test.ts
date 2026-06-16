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

/** Valores numéricos del primer plot(), barra a barra (na omitido). */
function plotValues(src: string, closes: number[]): number[] {
  const script = mustCompile(src);
  return runScript(script, candlesFromCloses(closes)).plots[0].points.map((p) => p.value);
}

describe("Fase A — declaración de type + Type.new()", () => {
  it("crea un objeto y lee campos posicionales", () => {
    const src = [
      'indicator("UDT")',
      "type pivot",
      "    float currentLevel",
      "    float lastLevel",
      "    bool crossed",
      "p = pivot.new(close, close[1], false)",
      "plot(p.currentLevel)",
    ].join("\n");
    const vals = plotValues(src, [10, 11, 12, 13]);
    expect(vals).toEqual([10, 11, 12, 13]);
  });

  it("aplica defaults a los campos no provistos", () => {
    const src = [
      'indicator("UDT")',
      "type rng",
      "    float top = 5",
      "    float bottom = 2",
      "b = rng.new()",
      "plot(b.top - b.bottom)",
    ].join("\n");
    const vals = plotValues(src, [10, 20, 30]);
    expect(vals).toEqual([3, 3, 3]);
  });

  it("usa na cuando un campo sin default no se provee", () => {
    const src = [
      'indicator("UDT")',
      "type pivot",
      "    float a",
      "    float b",
      "p = pivot.new(close)",
      "plot(na(p.b) ? 1 : 0)",
    ].join("\n");
    const vals = plotValues(src, [10, 20]);
    expect(vals).toEqual([1, 1]);
  });

  it("acepta argumentos nombrados (en cualquier orden)", () => {
    const src = [
      'indicator("UDT")',
      "type pt",
      "    float x",
      "    float y",
      "p = pt.new(y = 7, x = 3)",
      "plot(p.x * 10 + p.y)",
    ].join("\n");
    const vals = plotValues(src, [1, 1]);
    expect(vals).toEqual([37, 37]);
  });

  it("el default se evalúa en cada barra (referencia a builtins)", () => {
    const src = [
      'indicator("UDT")',
      "type bar",
      "    int barIndex = bar_index",
      "b = bar.new()",
      "plot(b.barIndex)",
    ].join("\n");
    const vals = plotValues(src, [10, 20, 30, 40]);
    expect(vals).toEqual([0, 1, 2, 3]);
  });
});

describe("Fase A — lectura/escritura y mutación a través de barras", () => {
  it("obj.field := value muta el campo (sin var: nuevo objeto por barra)", () => {
    const src = [
      'indicator("UDT")',
      "type holder",
      "    float v = 0",
      "h = holder.new()",
      "h.v := close",
      "plot(h.v)",
    ].join("\n");
    const vals = plotValues(src, [5, 6, 7]);
    expect(vals).toEqual([5, 6, 7]);
  });

  it("var obj persiste la MISMA referencia: el campo crece cada barra", () => {
    const src = [
      'indicator("UDT")',
      "type counter",
      "    int n",
      "var c = counter.new(0)",
      "c.n := c.n + 1",
      "plot(c.n)",
    ].join("\n");
    const vals = plotValues(src, [10, 20, 30, 40, 50]);
    expect(vals).toEqual([1, 2, 3, 4, 5]);
  });

  it("var pivot swing = pivot.new(na, na, false) con tipo explícito", () => {
    const src = [
      'indicator("UDT")',
      "type pivot",
      "    float level",
      "    float last",
      "    bool crossed",
      "var pivot swing = pivot.new(na, na, false)",
      "swing.level := close",
      "plot(swing.level)",
    ].join("\n");
    const vals = plotValues(src, [3, 4, 5]);
    expect(vals).toEqual([3, 4, 5]);
  });

  it("varip se trata como var (carry-forward)", () => {
    const src = [
      'indicator("UDT")',
      "type counter",
      "    int n",
      "varip c = counter.new(0)",
      "c.n := c.n + 1",
      "plot(c.n)",
    ].join("\n");
    const vals = plotValues(src, [1, 1, 1]);
    expect(vals).toEqual([1, 2, 3]);
  });
});

describe("Fase A — na y objetos anidados/encadenados", () => {
  it("acceso a campo de un objeto na lanza PineRuntimeError posicionado", () => {
    const src = [
      'indicator("UDT")',
      "type pivot",
      "    float level",
      "p = na",
      "plot(p.level)",
    ].join("\n");
    const script = mustCompile(src);
    expect(() => runScript(script, candlesFromCloses([1, 2]))).toThrow(PineRuntimeError);
  });

  it("asignación a campo de un objeto na lanza PineRuntimeError", () => {
    const src = [
      'indicator("UDT")',
      "type pivot",
      "    float level",
      "var pivot p = na",
      "p.level := close",
      "plot(close)",
    ].join("\n");
    const script = mustCompile(src);
    expect(() => runScript(script, candlesFromCloses([1, 2]))).toThrow(PineRuntimeError);
  });

  it("objeto anidado (un campo que es otro UDT) y acceso encadenado a.b.c", () => {
    const src = [
      'indicator("UDT")',
      "type leaf",
      "    float value",
      "type node",
      "    leaf child",
      "    float weight",
      "inner = leaf.new(42)",
      "n = node.new(inner, 2)",
      "plot(n.child.value)",
    ].join("\n");
    const vals = plotValues(src, [1, 1]);
    expect(vals).toEqual([42, 42]);
  });

  it("muta un campo anidado encadenado a.b.c := v", () => {
    const src = [
      'indicator("UDT")',
      "type leaf",
      "    float value = 0",
      "type node",
      "    leaf child",
      "var node n = node.new(leaf.new())",
      "n.child.value := n.child.value + close",
      "plot(n.child.value)",
    ].join("\n");
    const vals = plotValues(src, [1, 2, 3, 4]);
    expect(vals).toEqual([1, 3, 6, 10]);
  });
});

describe("Fase A — sanity de tuplas/funciones con objetos", () => {
  it("una función de usuario puede devolver un objeto", () => {
    const src = [
      'indicator("UDT")',
      "type pt",
      "    float x",
      "make(v) =>",
      "    pt.new(v)",
      "p = make(close)",
      "plot(p.x)",
    ].join("\n");
    const vals = plotValues(src, [7, 8, 9]);
    expect(vals).toEqual([7, 8, 9]);
  });

  it("destructuring de una tupla de objetos", () => {
    const src = [
      'indicator("UDT")',
      "type pt",
      "    float x",
      "pair() =>",
      "    [pt.new(1), pt.new(2)]",
      "[a, b] = pair()",
      "plot(a.x * 10 + b.x)",
    ].join("\n");
    const vals = plotValues(src, [0, 0]);
    expect(vals).toEqual([12, 12]);
  });

  it("el parser tolera anotaciones array<...> y tipos de dibujo en los campos", () => {
    const src = [
      'indicator("UDT")',
      "type smc",
      "    array<float> levels",
      "    box zone",
      "    line trend",
      "    float price = close",
      "s = smc.new()",
      "plot(s.price)",
    ].join("\n");
    const vals = plotValues(src, [11, 22]);
    expect(vals).toEqual([11, 22]);
  });

  it("usar un objeto en contexto aritmético/plot da un error claro (no crash)", () => {
    const src = [
      'indicator("UDT")',
      "type pt",
      "    float x",
      "p = pt.new(1)",
      "plot(p + 1)",
    ].join("\n");
    const script = mustCompile(src);
    expect(() => runScript(script, candlesFromCloses([1, 2]))).toThrow(PineRuntimeError);
  });
});
