import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Candle } from "@/lib/binance/types";
import { compile, runScript } from "@/lib/pine";

// Indicador real LuxAlgo Smart Money Concepts (~400 líneas). Ejercita TODO el
// lenguaje Pine v5 avanzado: UDTs, arrays, objetos de dibujo, MTF, switch,
// funciones con defaults, varip, barstate, str.format, alertcondition.
const SRC = readFileSync(join(__dirname, "fixtures", "smc-luxalgo.pine"), "utf8");

function synth(n: number, stepSec: number, t0 = 1_700_000_000): Candle[] {
  let s = 99;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const out: Candle[] = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    const o = p;
    p = p * (1 + (rnd() - 0.5) * 0.03);
    out.push({ time: t0 + i * stepSec, open: o, high: Math.max(o, p) + rnd(), low: Math.min(o, p) - rnd(), close: p, volume: 100 + i });
  }
  return out;
}

describe("LuxAlgo SMC end-to-end", () => {
  it("compila sin errores", () => {
    const res = compile(SRC);
    if (!res.ok) {
      throw new Error(res.diagnostics.map((d) => `${d.line}:${d.col} ${d.message}`).join("\n"));
    }
    expect(res.ok).toBe(true);
  });

  function runWith(inputs: Record<string, number | string | boolean>, htf: Record<string, Candle[]> = {}) {
    const res = compile(SRC);
    if (!res.ok) throw new Error("no compila");
    return runScript(res.script, synth(300, 3600), inputs, undefined, { symbol: "BTCUSDT", timeframe: "60", htf });
  }

  it("corre con los ajustes por defecto y produce dibujos", () => {
    const out = runWith({});
    const d = out.drawings!;
    expect(d.lines.length + d.boxes.length + d.labels.length).toBeGreaterThan(0);
    expect(out.candles!.length).toBeGreaterThan(0);
  });

  it("corre con todas las features activas (FVG, swing OB, zonas, swings, color candles)", () => {
    const out = runWith({
      "Show Swings Points": true,
      "Swing Order Blocks": true,
      "Fair Value Gaps": true,
      "Premium/Discount Zones": true,
      "Color Candles": true,
      "Confluence Filter": true,
    });
    expect(out.drawings!.boxes.length).toBeGreaterThan(0);
  });

  it("corre con niveles MTF (str.format + request.security D/W/M)", () => {
    const out = runWith(
      { Daily: true, Weekly: true, Monthly: true },
      { D: synth(40, 86400), W: synth(10, 604800), M: synth(6, 2592000) },
    );
    expect(out.drawings!.lines.length).toBeGreaterThan(0);
  });

  it("corre en modo monocromo", () => {
    expect(() => runWith({ Style: "Monochrome" })).not.toThrow();
  });

  it("no lanza al mitigar order blocks (for-in que muta el array durante 1500 velas)", () => {
    // Serie larga con ondas → crea y mitiga order blocks, ejercitando
    // deleteOrderBlocks (remove(index) dentro de un for-in). Regresión del
    // bug 'No se puede leer barHigh de un objeto na'.
    let s = 7;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    let p = 100;
    const candles: Candle[] = [];
    for (let i = 0; i < 1500; i++) {
      const o = p;
      p = p + (Math.sin(i / 40) * 3 + Math.sin(i / 13) * 1.5) * 0.5 + (rnd() - 0.5) * 4;
      if (p < 5) p = 5;
      candles.push({ time: 1_700_000_000 + i * 3600, open: o, high: Math.max(o, p) + rnd() * 2, low: Math.min(o, p) - rnd() * 2, close: p, volume: 100 + i });
    }
    const res = compile(SRC);
    if (!res.ok) throw new Error("no compila");
    expect(() =>
      runScript(res.script, candles, { "Swing Order Blocks": true, "Internal Order Blocks": true, "Fair Value Gaps": true }, undefined, { symbol: "BTCUSDT", timeframe: "60", htf: {} }),
    ).not.toThrow();
  });
});
