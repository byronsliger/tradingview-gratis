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
function plotValues(
  src: string,
  closes: number[],
  options?: { maxFuelPerBar?: number; maxFuelTotal?: number },
): number[] {
  const script = mustCompile(src);
  return runScript(script, candlesFromCloses(closes), {}, options).plots[0].points.map(
    (p) => p.value,
  );
}

describe("Fase B — construcción de arrays", () => {
  it("array.new<float>() vacío y push/get/size", () => {
    const src = [
      'indicator("arr")',
      "a = array.new<float>()",
      "a.push(close)",
      "a.push(close + 1)",
      "plot(a.size() + a.get(0) + a.get(1))",
    ].join("\n");
    const vals = plotValues(src, [10, 20]);
    expect(vals).toEqual([2 + 10 + 11, 2 + 20 + 21]);
  });

  it("array.new_float(size, initial) crea con relleno", () => {
    const src = [
      'indicator("arr")',
      "a = array.new_float(3, 7)",
      "plot(a.size() * 100 + a.sum())",
    ].join("\n");
    const vals = plotValues(src, [1, 1]);
    expect(vals).toEqual([321, 321]);
  });

  it("array.new<int>(2, 0) y set", () => {
    const src = [
      'indicator("arr")',
      "a = array.new<int>(2, 0)",
      "a.set(0, 5)",
      "a.set(1, 9)",
      "plot(a.get(0) * 10 + a.get(1))",
    ].join("\n");
    const vals = plotValues(src, [1, 1]);
    expect(vals).toEqual([59, 59]);
  });
});

describe("Fase B — operaciones de pila/cola y modificación", () => {
  it("pop/shift/unshift devuelven el removido y mutan", () => {
    const src = [
      'indicator("arr")',
      "a = array.new<float>()",
      "a.push(1)",
      "a.push(2)",
      "a.push(3)",
      "a.unshift(0)",
      "popped = a.pop()",
      "shifted = a.shift()",
      "plot(popped * 1000 + shifted * 100 + a.size() * 10 + a.first())",
    ].join("\n");
    // tras unshift: [0,1,2,3]; pop→3, array [0,1,2]; shift→0, array [1,2]; first=1, size=2
    const vals = plotValues(src, [1]);
    expect(vals).toEqual([3 * 1000 + 0 * 100 + 2 * 10 + 1]);
  });

  it("remove(i) devuelve el elemento e insert(i, v) inserta", () => {
    const src = [
      'indicator("arr")',
      "a = array.new<float>()",
      "a.push(10)",
      "a.push(20)",
      "a.push(30)",
      "removed = a.remove(1)",
      "a.insert(0, 99)",
      "plot(removed * 100 + a.get(0) + a.get(1) / 10 + a.get(2) / 100)",
    ].join("\n");
    // remove(1)→20, array [10,30]; insert(0,99)→[99,10,30]
    const vals = plotValues(src, [1]);
    expect(vals).toEqual([20 * 100 + 99 + 10 / 10 + 30 / 100]);
  });

  it("clear vacía el array", () => {
    const src = [
      'indicator("arr")',
      "a = array.new<float>()",
      "a.push(1)",
      "a.push(2)",
      "a.clear()",
      "plot(a.size())",
    ].join("\n");
    expect(plotValues(src, [1])).toEqual([0]);
  });

  it("slice devuelve una copia (no muta el original)", () => {
    const src = [
      'indicator("arr")',
      "a = array.new<float>()",
      "a.push(1)",
      "a.push(2)",
      "a.push(3)",
      "a.push(4)",
      "s = a.slice(1, 3)",
      "s.set(0, 99)",
      "plot(s.get(0) * 100 + a.get(1) * 10 + s.size())",
    ].join("\n");
    // slice(1,3)→[2,3]; set s[0]=99 NO toca a; a.get(1) sigue 2
    const vals = plotValues(src, [1]);
    expect(vals).toEqual([99 * 100 + 2 * 10 + 2]);
  });
});

describe("Fase B — búsqueda y agregación", () => {
  it("indexof / includes", () => {
    const src = [
      'indicator("arr")',
      "a = array.new<float>()",
      "a.push(5)",
      "a.push(8)",
      "a.push(13)",
      "idx = a.indexof(8)",
      "has = a.includes(13) ? 1 : 0",
      "miss = a.includes(99) ? 1 : 0",
      "plot(idx * 100 + has * 10 + miss)",
    ].join("\n");
    expect(plotValues(src, [1])).toEqual([1 * 100 + 10 + 0]);
  });

  it("max / min / sum / avg", () => {
    const src = [
      'indicator("arr")',
      "a = array.new<float>()",
      "a.push(2)",
      "a.push(8)",
      "a.push(5)",
      "plot(a.max() * 1000 + a.min() * 100 + a.sum() * 10 + a.avg())",
    ].join("\n");
    // max 8, min 2, sum 15, avg 5
    expect(plotValues(src, [1])).toEqual([8 * 1000 + 2 * 100 + 15 * 10 + 5]);
  });
});

describe("Fase B — forma funcional array.metodo(arr, args)", () => {
  it("array.push(a, x) y array.get(a, i) funcionan como métodos", () => {
    const src = [
      'indicator("arr")',
      "a = array.new<float>()",
      "array.push(a, 42)",
      "plot(array.get(a, 0) + array.size(a))",
    ].join("\n");
    expect(plotValues(src, [1])).toEqual([43]);
  });
});

describe("Fase B — persistencia de var array", () => {
  it("var array<float> crece con bar_index (push por barra)", () => {
    const src = [
      'indicator("arr")',
      "var array<float> xs = array.new<float>()",
      "xs.push(close)",
      "plot(xs.size())",
    ].join("\n");
    const vals = plotValues(src, [10, 20, 30, 40]);
    expect(vals).toEqual([1, 2, 3, 4]);
  });

  it("var array sin tipo explícito también persiste", () => {
    const src = [
      'indicator("arr")',
      "var prices = array.new<float>()",
      "prices.push(close)",
      "plot(prices.last())",
    ].join("\n");
    const vals = plotValues(src, [3, 7, 11]);
    expect(vals).toEqual([3, 7, 11]);
  });
});

describe("Fase B — arrays de UDTs", () => {
  it("array<pivot> con push de objetos y acceso a campos del elemento", () => {
    const src = [
      'indicator("arr")',
      "type pivot",
      "    float currentLevel",
      "    bool crossed",
      "var array<pivot> pivots = array.new<pivot>()",
      "pivots.push(pivot.new(close, false))",
      "p = pivots.get(0)",
      "plot(p.currentLevel)",
    ].join("\n");
    // barra 0: empuja close=5; en cada barra get(0) sigue siendo el primero (5)
    const vals = plotValues(src, [5, 6, 7]);
    expect(vals).toEqual([5, 5, 5]);
  });

  it("acceso encadenado arr.get(i).field", () => {
    const src = [
      'indicator("arr")',
      "type pt",
      "    float x",
      "a = array.new<pt>()",
      "a.push(pt.new(close))",
      "a.push(pt.new(close + 100))",
      "plot(a.get(1).x)",
    ].join("\n");
    const vals = plotValues(src, [10, 20]);
    expect(vals).toEqual([110, 120]);
  });
});

describe("Fase B — for-in", () => {
  it("for v in arr suma elementos", () => {
    const src = [
      'indicator("arr")',
      "a = array.new<float>()",
      "a.push(1)",
      "a.push(2)",
      "a.push(3)",
      "total = 0.0",
      "for v in a",
      "    total := total + v",
      "plot(total)",
    ].join("\n");
    expect(plotValues(src, [1])).toEqual([6]);
  });

  it("for [i, v] in arr usa el índice", () => {
    const src = [
      'indicator("arr")',
      "a = array.new<float>()",
      "a.push(10)",
      "a.push(20)",
      "a.push(30)",
      "acc = 0.0",
      "for [i, v] in a",
      "    acc := acc + i * v",
      "plot(acc)",
    ].join("\n");
    // 0*10 + 1*20 + 2*30 = 80
    expect(plotValues(src, [1])).toEqual([80]);
  });

  it("for-in con break", () => {
    const src = [
      'indicator("arr")',
      "a = array.new<float>()",
      "a.push(1)",
      "a.push(2)",
      "a.push(3)",
      "a.push(4)",
      "total = 0.0",
      "for [i, v] in a",
      "    if i == 2",
      "        break",
      "    total := total + v",
      "plot(total)",
    ].join("\n");
    // suma de i=0 (1) e i=1 (2) → 3; en i=2 rompe
    expect(plotValues(src, [1])).toEqual([3]);
  });

  it("for-in con continue", () => {
    const src = [
      'indicator("arr")',
      "a = array.new<float>()",
      "a.push(1)",
      "a.push(2)",
      "a.push(3)",
      "a.push(4)",
      "total = 0.0",
      "for [i, v] in a",
      "    if i % 2 == 0",
      "        continue",
      "    total := total + v",
      "plot(total)",
    ].join("\n");
    // suma de i=1 (2) e i=3 (4) → 6
    expect(plotValues(src, [1])).toEqual([6]);
  });

  it("for-in itera sobre snapshot del tamaño inicial (mutar no afecta vueltas)", () => {
    const src = [
      'indicator("arr")',
      "a = array.new<float>()",
      "a.push(1)",
      "a.push(1)",
      "count = 0",
      "for v in a",
      "    count := count + 1",
      "    a.push(1)",
      "plot(count)",
    ].join("\n");
    // sin snapshot esto sería un bucle infinito; con snapshot itera exactamente 2 veces
    expect(plotValues(src, [1])).toEqual([2]);
  });

  it("for-in grande agota el fuel", () => {
    const src = [
      'indicator("arr")',
      "a = array.new<float>(100000, 1)",
      "total = 0.0",
      "for v in a",
      "    total := total + v",
      "plot(total)",
    ].join("\n");
    const script = mustCompile(src);
    expect(() =>
      runScript(script, candlesFromCloses([1]), {}, { maxFuelPerBar: 1000 }),
    ).toThrow(PineRuntimeError);
  });
});

describe("Fase B — errores", () => {
  it("índice fuera de rango en get → error posicionado", () => {
    const src = [
      'indicator("arr")',
      "a = array.new<float>()",
      "a.push(1)",
      "plot(a.get(5))",
    ].join("\n");
    const script = mustCompile(src);
    expect(() => runScript(script, candlesFromCloses([1]))).toThrow(PineRuntimeError);
  });

  it("pop sobre array vacío → error", () => {
    const src = [
      'indicator("arr")',
      "a = array.new<float>()",
      "x = a.pop()",
      "plot(x)",
    ].join("\n");
    const script = mustCompile(src);
    expect(() => runScript(script, candlesFromCloses([1]))).toThrow(PineRuntimeError);
  });

  it("usar un array en contexto escalar (plot) da error claro", () => {
    const src = [
      'indicator("arr")',
      "a = array.new<float>()",
      "plot(a + 1)",
    ].join("\n");
    const script = mustCompile(src);
    expect(() => runScript(script, candlesFromCloses([1]))).toThrow(PineRuntimeError);
  });

  it("iterar sobre na lanza", () => {
    const src = [
      'indicator("arr")',
      "a = na",
      "total = 0.0",
      "for v in a",
      "    total := total + 1",
      "plot(total)",
    ].join("\n");
    const script = mustCompile(src);
    expect(() => runScript(script, candlesFromCloses([1]))).toThrow(PineRuntimeError);
  });
});
