import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/binance/types";
import { compile, runScript } from "@/lib/pine";
import type { CompiledScript, ScriptResult } from "@/lib/pine/types";

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

function run(src: string, closes: number[]): ScriptResult {
  return runScript(mustCompile(src), candlesFromCloses(closes));
}

describe("Fase C — constructores de dibujo", () => {
  it("label.new posicional (x, y, text) acumula una etiqueta viva", () => {
    const src = [
      'indicator("d", overlay=true)',
      "label.new(bar_index, close, 'hi')",
    ].join("\n");
    const { drawings } = run(src, [10]);
    expect(drawings.labels).toHaveLength(1);
    const l = drawings.labels[0];
    expect(l.x).toBe(0); // bar_index en la barra 0
    expect(l.y).toBe(10);
    expect(l.text).toBe("hi");
    expect(l.xloc).toBe("bar_index");
  });

  it("label.new con args nombrados (xloc=xloc.bar_time, style, color, textcolor, size)", () => {
    const src = [
      'indicator("d", overlay=true)',
      "label.new(x=time, y=close, text='X', xloc=xloc.bar_time, style=label.style_label_down, color=color.red, textcolor=color.white, size=size.large)",
    ].join("\n");
    const { drawings } = run(src, [42]);
    const l = drawings.labels[0];
    expect(l.xloc).toBe("bar_time");
    expect(l.x).toBe(1_700_000_000 * 1000); // time en ms
    expect(l.y).toBe(42);
    expect(l.style).toBe("label_down");
    expect(l.color).toBe("#F23645");
    expect(l.textcolor).toBe("#FFFFFF");
    expect(l.size).toBe("large");
  });

  it("line.new(x1,y1,x2,y2) con extend y style nombrados", () => {
    const src = [
      'indicator("d", overlay=true)',
      "line.new(bar_index, low, bar_index, high, color=color.blue, style=line.style_dashed, width=2, extend=extend.right)",
    ].join("\n");
    const { drawings } = run(src, [20]);
    expect(drawings.lines).toHaveLength(1);
    const ln = drawings.lines[0];
    expect(ln.p1.index).toBe(0);
    expect(ln.p1.price).toBe(19); // low = close-1
    expect(ln.p2.price).toBe(21); // high = close+1
    expect(ln.color).toBe("#2962FF");
    expect(ln.style).toBe("dashed");
    expect(ln.width).toBe(2);
    expect(ln.extend).toBe("right");
  });

  it("box.new(left,top,right,bottom) con bgcolor/border", () => {
    const src = [
      'indicator("d", overlay=true)',
      "box.new(bar_index, high, bar_index, low, bgcolor=color.green, border_color=color.red, border_width=3)",
    ].join("\n");
    const { drawings } = run(src, [50]);
    expect(drawings.boxes).toHaveLength(1);
    const b = drawings.boxes[0];
    expect(b.topLeft.index).toBe(0);
    expect(b.topLeft.price).toBe(51);
    expect(b.bottomRight.price).toBe(49);
    expect(b.bgcolor).toBe("#089981");
    expect(b.borderColor).toBe("#F23645");
    expect(b.borderWidth).toBe(3);
  });
});

describe("Fase C — chart.point.new + formas con punto", () => {
  it("chart.point.new(time, price) y (time, index, price)", () => {
    const src = [
      'indicator("d", overlay=true)',
      "p1 = chart.point.new(time, close)",
      "p2 = chart.point.new(na, bar_index, high)",
      "line.new(p1, p2, xloc=xloc.bar_time)",
    ].join("\n");
    const { drawings } = run(src, [30]);
    const ln = drawings.lines[0];
    expect(ln.p1.time).toBe(1_700_000_000 * 1000);
    expect(ln.p1.index).toBeNull();
    expect(ln.p1.price).toBe(30);
    expect(ln.p2.time).toBeNull();
    expect(ln.p2.index).toBe(0);
    expect(ln.p2.price).toBe(31);
  });

  it("label.new(chart.point, text)", () => {
    const src = [
      'indicator("d", overlay=true)',
      "label.new(chart.point.new(time, na, close), text='pt', xloc=xloc.bar_time)",
    ].join("\n");
    const { drawings } = run(src, [12]);
    const l = drawings.labels[0];
    expect(l.text).toBe("pt");
    expect(l.y).toBe(12);
  });
});

describe("Fase C — persistencia y mutación", () => {
  it("var line l + set_second_point cada barra ⇒ MISMA línea se mueve", () => {
    const src = [
      'indicator("d", overlay=true)',
      "var line l = na",
      "if bar_index == 0",
      "    l := line.new(chart.point.new(time, na, close), chart.point.new(time, na, close), xloc=xloc.bar_time)",
      "l.set_second_point(chart.point.new(time, na, high))",
    ].join("\n");
    const { drawings } = run(src, [10, 20, 30]);
    // Una sola línea viva; su p2 se mueve a la última barra (high = 31).
    expect(drawings.lines).toHaveLength(1);
    expect(drawings.lines[0].p2.price).toBe(31);
    expect(drawings.lines[0].p2.time).toBe((1_700_000_000 + 2 * 60) * 1000);
  });

  it(".delete() retira el objeto del resultado", () => {
    const src = [
      'indicator("d", overlay=true)',
      "var label l = na",
      "if bar_index == 0",
      "    l := label.new(bar_index, close, 'a')",
      "if bar_index == 2",
      "    l.delete()",
    ].join("\n");
    const { drawings } = run(src, [1, 2, 3]);
    expect(drawings.labels).toHaveLength(0);
  });

  it("mutadores de label set_text / set_xy", () => {
    const src = [
      'indicator("d", overlay=true)',
      "var label l = na",
      "if bar_index == 0",
      "    l := label.new(bar_index, close, 'init')",
      "l.set_text('updated')",
      "l.set_xy(bar_index, high)",
    ].join("\n");
    const { drawings } = run(src, [5, 6]);
    const l = drawings.labels[0];
    expect(l.text).toBe("updated");
    expect(l.x).toBe(1);
    expect(l.y).toBe(7);
  });
});

describe("Fase C — límites max_*_count", () => {
  it("max_lines_count=2 con 5 line.new no-var ⇒ solo 2 vivas (las más nuevas)", () => {
    const src = [
      'indicator("d", overlay=true, max_lines_count=2)',
      "line.new(bar_index, 1, bar_index, 1)",
      "line.new(bar_index, 2, bar_index, 2)",
      "line.new(bar_index, 3, bar_index, 3)",
      "line.new(bar_index, 4, bar_index, 4)",
      "line.new(bar_index, 5, bar_index, 5)",
    ].join("\n");
    const { drawings } = run(src, [1]);
    expect(drawings.lines).toHaveLength(2);
    // Las 2 supervivientes son las últimas creadas (precio 4 y 5).
    const prices = drawings.lines.map((l) => l.p1.price).sort();
    expect(prices).toEqual([4, 5]);
  });

  it("default 50 etiquetas: 60 label.new ⇒ 50 vivas", () => {
    const src = [
      'indicator("d", overlay=true)',
      "for i = 1 to 60",
      "    label.new(bar_index, i, 'x')",
    ].join("\n");
    const { drawings } = run(src, [1]);
    expect(drawings.labels).toHaveLength(50);
  });
});

describe("Fase C — plotcandle", () => {
  it("plotcandle recolecta OHLC por barra con colores", () => {
    const src = [
      'indicator("d", overlay=true)',
      "plotcandle(open, high, low, close, title='C', color=close > open ? color.green : color.red)",
    ].join("\n");
    const { candles } = run(src, [10, 12, 9]);
    expect(candles).toHaveLength(1);
    expect(candles[0].title).toBe("C");
    expect(candles[0].points).toHaveLength(3);
    const p0 = candles[0].points[0];
    expect(p0.open).toBe(10);
    expect(p0.high).toBe(11);
    expect(p0.low).toBe(9);
    expect(p0.close).toBe(10);
    // barra 1: close 12 > open 10 → verde
    expect(candles[0].points[1].color).toBe("#089981");
    // barra 2: close 9 < open 12 → rojo
    expect(candles[0].points[2].color).toBe("#F23645");
  });

  it("na en open omite la barra (whitespace)", () => {
    const src = [
      'indicator("d", overlay=true)',
      "o = bar_index == 1 ? na : open",
      "plotcandle(o, high, low, close)",
    ].join("\n");
    const { candles } = run(src, [10, 20, 30]);
    // 3 barras, pero la del medio tiene open=na → 2 puntos.
    expect(candles[0].points).toHaveLength(2);
    expect(candles[0].points.map((p) => p.time)).toEqual([1_700_000_000, 1_700_000_000 + 120]);
  });

  it("bordercolor / wickcolor nombrados", () => {
    const src = [
      'indicator("d", overlay=true)',
      "plotcandle(open, high, low, close, color=color.blue, wickcolor=color.gray, bordercolor=color.black)",
    ].join("\n");
    const { candles } = run(src, [10]);
    const p = candles[0].points[0];
    expect(p.color).toBe("#2962FF");
    expect(p.wickColor).toBe("#787B86");
    expect(p.borderColor).toBe("#000000");
  });
});

describe("Fase C — constantes y color(na)", () => {
  it("constantes de namespace resuelven", () => {
    const src = [
      'indicator("d", overlay=true)',
      "label.new(bar_index, close, 'x', style=label.style_label_up, xloc=xloc.bar_index, size=size.tiny)",
      "line.new(bar_index, low, bar_index, high, extend=extend.both, style=line.style_dotted)",
    ].join("\n");
    const { drawings } = run(src, [10]);
    expect(drawings.labels[0].style).toBe("label_up");
    expect(drawings.labels[0].size).toBe("tiny");
    expect(drawings.lines[0].extend).toBe("both");
    expect(drawings.lines[0].style).toBe("dotted");
  });

  it("color(na) ⇒ null (sin color)", () => {
    const src = [
      'indicator("d", overlay=true)',
      "box.new(bar_index, high, bar_index, low, bgcolor=color(na), border_color=color(na))",
    ].join("\n");
    const { drawings } = run(src, [10]);
    expect(drawings.boxes[0].bgcolor).toBeNull();
    expect(drawings.boxes[0].borderColor).toBeNull();
  });

  it("forma funcional line.set_xy2(l, ...) muta la línea", () => {
    const src = [
      'indicator("d", overlay=true)',
      "var line l = na",
      "if bar_index == 0",
      "    l := line.new(bar_index, 1, bar_index, 2)",
      "line.set_xy2(l, bar_index, 99)",
    ].join("\n");
    const { drawings } = run(src, [1, 2]);
    expect(drawings.lines[0].p2.price).toBe(99);
    expect(drawings.lines[0].p2.index).toBe(1);
  });
});
