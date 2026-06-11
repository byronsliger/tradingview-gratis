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

function plotValues(src: string, closes: number[]): { time: number; value: number }[] {
  const script = mustCompile(src);
  const candles = candlesFromCloses(closes);
  return runScript(script, candles).plots[0].points;
}

describe("interpreter: var y :=", () => {
  it("var n = 0 + n := n + 1 cuenta las barras", () => {
    const closes = Array.from({ length: 10 }, (_, i) => 100 + i);
    const points = plotValues(
      'indicator("Counter")\nvar n = 0\nn := n + 1\nplot(n)',
      closes,
    );
    expect(points).toHaveLength(10);
    points.forEach((p, i) => expect(p.value).toBe(i + 1));
    expect(points[points.length - 1].value).toBe(closes.length);
  });

  it("una variable sin var se recalcula en cada barra", () => {
    const points = plotValues("x = close * 2\nplot(x)", [10, 20, 30]);
    expect(points.map((p) => p.value)).toEqual([20, 40, 60]);
  });

  it(":= sobre variable no declarada lanza PineRuntimeError", () => {
    const script = mustCompile("n := 1\nplot(n)");
    expect(() => runScript(script, candlesFromCloses([1, 2]))).toThrow(PineRuntimeError);
  });
});

describe("interpreter: histórico y na", () => {
  it("plot(close - close[1]) omite la primera barra (na)", () => {
    const closes = [10, 12, 11, 15];
    const points = plotValues("plot(close - close[1])", closes);
    expect(points).toHaveLength(3);
    expect(points.map((p) => p.value)).toEqual([2, -1, 4]);
    expect(points[0].time).toBe(candlesFromCloses(closes)[1].time);
  });

  it("nz reemplaza na por el valor dado (default 0)", () => {
    const points = plotValues("plot(nz(close[1], -1))", [10, 20, 30]);
    expect(points.map((p) => p.value)).toEqual([-1, 10, 20]);
    const zeros = plotValues("plot(nz(close[1]))", [10, 20]);
    expect(zeros.map((p) => p.value)).toEqual([0, 10]);
  });

  it("na(x) detecta na y el ternario elige rama", () => {
    const points = plotValues("plot(na(close[1]) ? 1 : 0)", [10, 20, 30]);
    expect(points.map((p) => p.value)).toEqual([1, 0, 0]);
  });

  it("histórico sobre expresiones compuestas usa serie oculta", () => {
    const points = plotValues("plot((close * 2)[1])", [10, 20, 30]);
    expect(points.map((p) => p.value)).toEqual([20, 40]);
  });
});

describe("interpreter: semántica de na en operadores", () => {
  it("la aritmética con na propaga na (el punto se omite)", () => {
    const points = plotValues("plot(close + close[1] * 0)", [10, 20, 30]);
    expect(points).toHaveLength(2); // la barra 0 desaparece
  });

  it("división por cero da na", () => {
    const points = plotValues("plot(1 / (close - close))", [10, 20, 30]);
    expect(points).toHaveLength(0);
  });

  it("comparar con na da false", () => {
    const points = plotValues("plot(close > close[1] ? 1 : 0)", [10, 20, 5]);
    expect(points.map((p) => p.value)).toEqual([0, 1, 0]);
  });
});

describe("interpreter: builtins y series virtuales", () => {
  it("hl2 / bar_index / volume funcionan como series", () => {
    const points = plotValues("plot(hl2 + bar_index * 0 + (volume - volume))", [10, 20]);
    // hl2 = ((close+1)+(close-1))/2 = close
    expect(points.map((p) => p.value)).toEqual([10, 20]);
    const barIdx = plotValues("plot(bar_index)", [5, 5, 5]);
    expect(barIdx.map((p) => p.value)).toEqual([0, 1, 2]);
  });

  it("math.max y math.abs son utilizables", () => {
    const points = plotValues("plot(math.max(math.abs(0 - close), 15))", [10, 20]);
    expect(points.map((p) => p.value)).toEqual([15, 20]);
  });

  it("una variable desconocida lanza PineRuntimeError posicionado", () => {
    const script = mustCompile("plot(zz)");
    let caught: PineRuntimeError | null = null;
    try {
      runScript(script, candlesFromCloses([1]));
    } catch (err) {
      if (err instanceof PineRuntimeError) caught = err;
      else throw err;
    }
    expect(caught).not.toBeNull();
    expect(caught!.message).toContain("zz");
    expect(caught!.line).toBe(1);
  });
});

describe("interpreter: fuel", () => {
  it("aborta con PineRuntimeError al agotar el fuel por barra", () => {
    const script = mustCompile(
      'indicator("f")\nplot(close + close + close + close + close + close)',
    );
    const candles = candlesFromCloses([1, 2, 3]);
    expect(() => runScript(script, candles, {}, { maxFuelPerBar: 5 })).toThrow(PineRuntimeError);
    expect(() => runScript(script, candles, {}, { maxFuelPerBar: 5 })).toThrow(/Límite de ejecución/);
  });

  it("aborta al agotar el fuel total acumulado", () => {
    const script = mustCompile("plot(close)");
    const candles = candlesFromCloses(Array.from({ length: 50 }, () => 1));
    expect(() => runScript(script, candles, {}, { maxFuelTotal: 20 })).toThrow(PineRuntimeError);
  });

  it("con límites por defecto un script normal corre sin problema", () => {
    const script = mustCompile("plot(ta.sma(close, 3))");
    const candles = candlesFromCloses(Array.from({ length: 100 }, (_, i) => i + 1));
    expect(() => runScript(script, candles)).not.toThrow();
  });
});

describe("compile: metadata y diagnostics", () => {
  it("extrae meta de indicator() y specs de plot()", () => {
    const script = mustCompile(
      '//@version=5\nindicator("Mi RSI", overlay=true)\nplot(close, title="precio", color=color.red)\nplot(close)',
    );
    expect(script.version).toBe(5);
    expect(script.meta).toMatchObject({ title: "Mi RSI", overlay: true });
    expect(script.plots).toHaveLength(2);
    expect(script.plots[0]).toMatchObject({ title: "precio", color: "#F23645" });
    expect(script.plots[1].title).toBe("Plot 2");
    expect(script.inputs).toEqual([]);
  });

  it("devuelve diagnostics posicionados en errores de sintaxis", () => {
    const res = compile("plot(ta.sma(close 14))");
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("inalcanzable");
    expect(res.diagnostics[0]).toMatchObject({ severity: "error", line: 1, col: 19 });
  });

  it("avisa (warning) cuando falta indicator() o plot()", () => {
    const script = mustCompile("x = close");
    expect(script.warnings.length).toBeGreaterThanOrEqual(2);
    expect(script.meta.title).toBe("Indicator");
  });
});
