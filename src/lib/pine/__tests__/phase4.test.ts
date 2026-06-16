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

describe("fase 4: análisis de input.*", () => {
  it("extrae InputDef con title/minval/maxval/step", () => {
    const script = mustCompile(
      'indicator("X")\nlen = input.int(14, "Length", minval=1, maxval=100, step=2)\nplot(ta.sma(close, len))',
    );
    expect(script.inputs).toHaveLength(1);
    expect(script.inputs[0]).toMatchObject({
      id: "Length",
      type: "int",
      title: "Length",
      defval: 14,
      minval: 1,
      maxval: 100,
      step: 2,
    });
  });

  it("sin title usa id posicional estable input{N}", () => {
    const script = mustCompile(
      "a = input.int(5)\nb = input.float(2.5)\nplot(a + b)",
    );
    expect(script.inputs.map((i) => i.id)).toEqual(["input1", "input2"]);
    expect(script.inputs[1]).toMatchObject({ type: "float", defval: 2.5 });
  });

  it("titles duplicados caen al id posicional", () => {
    const script = mustCompile(
      'a = input.int(5, "Len")\nb = input.int(9, "Len")\nplot(a + b)',
    );
    expect(script.inputs.map((i) => i.id)).toEqual(["Len", "input2"]);
  });

  it("input() genérico infiere el tipo del defval", () => {
    const script = mustCompile(
      'a = input(14, "Entero")\nb = input(1.5, "Flotante")\nc = input(true, "Booleano")\nd = input("x", "Cadena")\ne = input(color.red, "Color")\nf = input(close, "Fuente")\nplot(a)',
    );
    expect(script.inputs.map((i) => i.type)).toEqual([
      "int",
      "float",
      "bool",
      "string",
      "color",
      "source",
    ]);
    expect(script.inputs[5].defval).toBe("close");
  });

  it("options=[...] se extrae como lista de literales", () => {
    const script = mustCompile(
      'm = input.string("EMA", "Modo", options=["EMA", "SMA"])\nn = input.int(2, "N", options=[2, 3, 5])\nplot(n)',
    );
    expect(script.inputs[0].options).toEqual(["EMA", "SMA"]);
    expect(script.inputs[1].options).toEqual([2, 3, 5]);
  });

  it("defval no constante es error de compilación", () => {
    const res = compile("len = input.int(close)\nplot(len)");
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("inalcanzable");
    expect(res.diagnostics[0].severity).toBe("error");
  });

  it("input.source con serie no soportada es error", () => {
    const res = compile('src = input.source(bar_index, "S")\nplot(src)');
    expect(res.ok).toBe(false);
  });
});

describe("fase 4: input.* en runtime", () => {
  it("sin override devuelve el defval en todas las barras", () => {
    const script = mustCompile('plot(input.int(7, "N"))');
    const points = runScript(script, candlesFromCloses([1, 2, 3])).plots[0].points;
    expect(points.map((p) => p.value)).toEqual([7, 7, 7]);
  });

  it("el override por id afecta el cálculo (ta.sma(close, input))", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 10);
    const candles = candlesFromCloses(closes);
    const withInput = mustCompile('plot(ta.sma(close, input.int(14, "Length", minval=1)))');
    const direct7 = mustCompile("plot(ta.sma(close, 7))");
    const overridden = runScript(withInput, candles, { Length: 7 }).plots[0].points;
    const expected = runScript(direct7, candles).plots[0].points;
    expect(overridden).toEqual(expected);
  });

  it("el override se clampa a minval/maxval y los int se redondean", () => {
    const script = mustCompile('plot(input.int(5, "N", minval=2, maxval=10))');
    const candles = candlesFromCloses([1]);
    expect(runScript(script, candles, { N: 0 }).plots[0].points[0].value).toBe(2);
    expect(runScript(script, candles, { N: 99 }).plots[0].points[0].value).toBe(10);
    expect(runScript(script, candles, { N: 6.7 }).plots[0].points[0].value).toBe(7);
  });

  it("input.source lee la serie elegida (default y override)", () => {
    const script = mustCompile('plot(input.source(close, "Source"))');
    const candles = candlesFromCloses([10, 20]);
    expect(runScript(script, candles).plots[0].points.map((p) => p.value)).toEqual([10, 20]);
    // hl2 = close con estas velas sintéticas (high=close+1, low=close-1)
    expect(
      runScript(script, candles, { Source: "high" }).plots[0].points.map((p) => p.value),
    ).toEqual([11, 21]);
  });

  it("input.bool override y ternario", () => {
    const script = mustCompile('plot(input.bool(true, "Flag") ? 1 : 0)');
    const candles = candlesFromCloses([1]);
    expect(runScript(script, candles).plots[0].points[0].value).toBe(1);
    expect(runScript(script, candles, { Flag: false }).plots[0].points[0].value).toBe(0);
  });
});

describe("fase 4: estilos de plot()", () => {
  it("extrae style y linewidth del PlotSpec", () => {
    const script = mustCompile(
      'plot(close, "H", style=plot.style_histogram, linewidth=3)\nplot(close, style=plot.style_area)\nplot(close, style=plot.style_circles)',
    );
    expect(script.plots[0]).toMatchObject({ style: "histogram", linewidth: 3 });
    expect(script.plots[1].style).toBe("area");
    expect(script.plots[2].style).toBe("circles");
  });

  it("style por defecto es line con linewidth 1", () => {
    const script = mustCompile("plot(close)");
    expect(script.plots[0]).toMatchObject({ style: "line", linewidth: 1 });
  });

  it("color dinámico por barra llega en cada punto", () => {
    const script = mustCompile(
      "plot(close, color = close > open ? color.green : color.red)",
    );
    // closes: 10 (open=10, no >), 20 (open=10, sube), 5 (open=20, baja)
    const result = runScript(script, candlesFromCloses([10, 20, 5]));
    const colors = result.plots[0].points.map((p) => p.color);
    expect(colors).toEqual(["#F23645", "#089981", "#F23645"]);
  });
});

describe("fase 4: hline()", () => {
  it("extrae HLineSpec estáticas", () => {
    const script = mustCompile(
      'hline(70, "Sobrecompra", color=color.red, linestyle=hline.style_dotted)\nhline(30)\nplot(ta.rsi(close, 14))',
    );
    expect(script.hlines).toHaveLength(2);
    expect(script.hlines[0]).toMatchObject({
      price: 70,
      title: "Sobrecompra",
      color: "#F23645",
      linestyle: 1,
    });
    expect(script.hlines[1]).toMatchObject({ price: 30, linestyle: 0 });
  });

  it("precio no literal es error de compilación claro", () => {
    const res = compile("hline(close)\nplot(close)");
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("inalcanzable");
    expect(res.diagnostics[0].message).toContain("constante numérica");
  });
});

describe("fase 4: plotshape() y plotchar()", () => {
  it("genera puntos solo en barras disparadas, con shape/position mapeados", () => {
    const script = mustCompile(
      'plotshape(close > open, "Alcista", style=shape.triangleup, location=location.belowbar, color=color.green)',
    );
    const candles = candlesFromCloses([10, 20, 5, 30]);
    const result = runScript(script, candles);
    expect(result.shapes).toHaveLength(1);
    const points = result.shapes[0].points;
    // barras 1 y 3 son alcistas (close > open)
    expect(points.map((p) => p.time)).toEqual([candles[1].time, candles[3].time]);
    expect(points[0]).toMatchObject({
      position: "belowBar",
      shape: "arrowUp",
      color: "#089981",
    });
  });

  it("triangledown→arrowDown, circle→circle y absolute→aboveBar con warning", () => {
    const script = mustCompile(
      "plotshape(true, style=shape.triangledown, location=location.absolute)\nplotshape(true, style=shape.circle)",
    );
    const result = runScript(script, candlesFromCloses([1]));
    expect(result.shapes[0].points[0]).toMatchObject({ shape: "arrowDown", position: "aboveBar" });
    expect(result.shapes[1].points[0].shape).toBe("circle");
    expect(script.warnings.some((w) => w.message.includes("location.absolute"))).toBe(true);
  });

  it("color dinámico por barra en plotshape", () => {
    const script = mustCompile(
      "plotshape(true, color = close > open ? color.lime : color.maroon)",
    );
    const result = runScript(script, candlesFromCloses([10, 20, 5]));
    expect(result.shapes[0].points.map((p) => p.color)).toEqual([
      "#880E4F",
      "#00E676",
      "#880E4F",
    ]);
  });

  it("plotchar usa el char como texto del marker", () => {
    const script = mustCompile('plotchar(close > open, "C", "▲")');
    const result = runScript(script, candlesFromCloses([10, 20]));
    expect(script.shapes[0]).toMatchObject({ style: "char", char: "▲" });
    expect(result.shapes[0].points[0]).toMatchObject({ shape: "circle", text: "▲" });
  });
});
