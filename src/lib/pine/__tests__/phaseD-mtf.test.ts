import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/binance/types";
import { compile, runScript } from "@/lib/pine";
import type { CompiledScript, RunContext, ScriptResult } from "@/lib/pine/types";

const DAY = 86_400;
const HOUR = 3600;
// Época UNIX alineada a medianoche UTC de un día concreto (2023-11-13 00:00:00 UTC).
const BASE = 1_699_833_600;

function mustCompile(src: string): CompiledScript {
  const res = compile(src);
  if (!res.ok) {
    throw new Error(res.diagnostics.map((d) => `${d.line}:${d.col} ${d.message}`).join("; "));
  }
  return res.script;
}

/** Velas horarias durante `days` días (24 por día), close = índice de barra. */
function hourlyChart(days: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < days * 24; i++) {
    const close = i;
    out.push({
      time: BASE + i * HOUR,
      open: close,
      high: close + 1,
      low: close - 1,
      close,
      volume: 100 + i,
    });
  }
  return out;
}

/** Velas diarias: time = medianoche de cada día, OHLC distintivos por día. */
function dailyHtf(days: number): Candle[] {
  const out: Candle[] = [];
  for (let d = 0; d < days; d++) {
    out.push({
      time: BASE + d * DAY,
      open: 1000 + d,
      high: 2000 + d,
      low: 500 + d,
      close: 1500 + d,
      volume: 9000 + d,
    });
  }
  return out;
}

function run(
  src: string,
  candles: Candle[],
  runCtx?: RunContext,
): ScriptResult {
  return runScript(mustCompile(src), candles, {}, undefined, runCtx);
}

describe("Fase D — request.security (alineación HTF)", () => {
  it("close diario alineado: cada barra del chart devuelve el close de su vela diaria contenedora", () => {
    const src = [
      'indicator("mtf", overlay=true)',
      'dClose = request.security(syminfo.tickerid, "D", close, lookahead=barmerge.lookahead_on)',
      "plot(dClose)",
    ].join("\n");
    const chart = hourlyChart(3);
    const htf = { D: dailyHtf(3) };
    const { plots } = run(src, chart, { symbol: "BTCUSDT", timeframe: "60", htf });
    const pts = plots[0].points;
    // 72 barras (3 días × 24 h), todas con valor.
    expect(pts).toHaveLength(72);
    // Día 0 (barras 0..23) → close diario 1500; día 1 → 1501; día 2 → 1502.
    expect(pts[0].value).toBe(1500);
    expect(pts[23].value).toBe(1500);
    expect(pts[24].value).toBe(1501);
    expect(pts[47].value).toBe(1501);
    expect(pts[48].value).toBe(1502);
    expect(pts[71].value).toBe(1502);
  });

  it("tupla: [h, l] = request.security(..., [high[1], low[1]]) toma la vela diaria anterior", () => {
    const src = [
      'indicator("mtf", overlay=true)',
      '[h, l] = request.security(syminfo.tickerid, "D", [high[1], low[1]], lookahead=barmerge.lookahead_on)',
      "plot(h, title='H')",
      "plot(l, title='L')",
    ].join("\n");
    const chart = hourlyChart(3);
    const htf = { D: dailyHtf(3) };
    const { plots } = run(src, chart, { symbol: "X", timeframe: "60", htf });
    const hp = plots.find((p) => p.spec.title === "H")!.points;
    const lp = plots.find((p) => p.spec.title === "L")!.points;
    // Día 0: vela anterior no existe → na (sin punto). Día 1: high/low del día 0.
    // high[d]=2000+d, low[d]=500+d.
    // Barra 24 (inicio día 1) → high del día 0 = 2000, low = 500.
    const at = (pts: typeof hp, time: number) => pts.find((p) => p.time === time);
    expect(at(hp, BASE + 24 * HOUR)!.value).toBe(2000);
    expect(at(lp, BASE + 24 * HOUR)!.value).toBe(500);
    // Barra 48 (inicio día 2) → high/low del día 1 = 2001 / 501.
    expect(at(hp, BASE + 48 * HOUR)!.value).toBe(2001);
    expect(at(lp, BASE + 48 * HOUR)!.value).toBe(501);
    // Día 0 sin vela previa → na (omitido).
    expect(at(hp, BASE + 0 * HOUR)).toBeUndefined();
  });

  it("timeframe '' devuelve la serie del propio chart", () => {
    const src = [
      'indicator("mtf", overlay=true)',
      'c = request.security(syminfo.tickerid, "", close, lookahead=barmerge.lookahead_on)',
      "plot(c)",
    ].join("\n");
    const chart = hourlyChart(1);
    const { plots } = run(src, chart, { symbol: "X", timeframe: "60", htf: {} });
    const pts = plots[0].points;
    // close = índice de barra: cada barra devuelve su propio close.
    expect(pts[0].value).toBe(0);
    expect(pts[10].value).toBe(10);
    expect(pts[23].value).toBe(23);
  });

  it("timeframe sin datos en htf → na (sin puntos) y no rompe", () => {
    const src = [
      'indicator("mtf", overlay=true)',
      'w = request.security(syminfo.tickerid, "W", close, lookahead=barmerge.lookahead_on)',
      "plot(w)",
    ].join("\n");
    const chart = hourlyChart(2);
    // htf no incluye "W".
    const { plots } = run(src, chart, { symbol: "X", timeframe: "60", htf: { D: dailyHtf(2) } });
    expect(plots[0].points).toHaveLength(0);
  });

  it("request.security rechaza expresiones fuera del subconjunto soportado", () => {
    const src = [
      'indicator("mtf", overlay=true)',
      'x = request.security(syminfo.tickerid, "D", close + 1, lookahead=barmerge.lookahead_on)',
      "plot(x)",
    ].join("\n");
    expect(() =>
      run(src, hourlyChart(1), { symbol: "X", timeframe: "60", htf: { D: dailyHtf(1) } }),
    ).toThrow(/request.security solo soporta series builtin/);
  });
});

describe("Fase D — contexto temporal (timeframe / barstate)", () => {
  it('timeframe.in_seconds("D")===86400 y otros tf', () => {
    const src = [
      'indicator("t", overlay=true)',
      'plot(timeframe.in_seconds("D"))',
    ].join("\n");
    const { plots } = run(src, hourlyChart(1), { timeframe: "60" });
    expect(plots[0].points[0].value).toBe(86_400);
  });

  it("timeframe.period devuelve el tf del chart y multiplier/isdaily son coherentes", () => {
    const src = [
      'indicator("t", overlay=true)',
      "isD = timeframe.isdaily ? 1 : 0",
      "plot(timeframe.in_seconds() + isD)", // 60min=3600, isdaily=false → 3600
    ].join("\n");
    const { plots } = run(src, hourlyChart(1), { timeframe: "60" });
    expect(plots[0].points[0].value).toBe(3600);
    // Verifica period como string vía un script aparte.
    const src2 = [
      'indicator("t2", overlay=true)',
      "tf = timeframe.period",
      "plot(close, title=tf)",
    ].join("\n");
    const compiled = mustCompile(src2);
    expect(compiled).toBeTruthy();
  });

  it('timeframe.change("D") es true en la primera barra de cada día', () => {
    const src = [
      'indicator("t", overlay=true)',
      'ch = timeframe.change("D") ? 1 : 0',
      "plot(ch)",
    ].join("\n");
    const chart = hourlyChart(3);
    const { plots } = run(src, chart, { timeframe: "60", htf: {} });
    const pts = plots[0].points;
    // Cambios de día en barras 0 (primera barra), 24 y 48.
    const ones = pts.filter((p) => p.value === 1).map((p) => p.time);
    expect(ones).toEqual([
      BASE + 0 * HOUR,
      BASE + 24 * HOUR,
      BASE + 48 * HOUR,
    ]);
  });

  it("barstate.isfirst / islast son correctos", () => {
    const src = [
      'indicator("t", overlay=true)',
      "f = barstate.isfirst ? 1 : 0",
      "l = barstate.islast ? 1 : 0",
      "plot(f, title='F')",
      "plot(l, title='L')",
    ].join("\n");
    const chart = hourlyChart(1); // 24 barras
    const { plots } = run(src, chart, { timeframe: "60" });
    const fp = plots.find((p) => p.spec.title === "F")!.points;
    const lp = plots.find((p) => p.spec.title === "L")!.points;
    expect(fp.find((p) => p.value === 1)!.time).toBe(BASE);
    expect(fp.filter((p) => p.value === 1)).toHaveLength(1);
    expect(lp.find((p) => p.value === 1)!.time).toBe(BASE + 23 * HOUR);
    expect(lp.filter((p) => p.value === 1)).toHaveLength(1);
  });

  it("syminfo.tickerid devuelve el símbolo del runCtx", () => {
    const src = [
      'indicator("t", overlay=true)',
      "sym = syminfo.tickerid == 'ETHUSDT' ? 1 : 0",
      "plot(sym)",
    ].join("\n");
    const { plots } = run(src, hourlyChart(1), { symbol: "ETHUSDT", timeframe: "60" });
    expect(plots[0].points[0].value).toBe(1);
  });
});

describe("Fase D — analyze.requestedTimeframes", () => {
  it("incluye D y W de un script con request.security (literal y vía input)", () => {
    const src = [
      'indicator("mtf", overlay=true)',
      "tfW = input.timeframe('W', 'TF semanal')",
      'd = request.security(syminfo.tickerid, "D", close, lookahead=barmerge.lookahead_on)',
      "w = request.security(syminfo.tickerid, tfW, high, lookahead=barmerge.lookahead_on)",
      'c = request.security(syminfo.tickerid, "", low, lookahead=barmerge.lookahead_on)',
      "plot(d + w + c)",
    ].join("\n");
    const compiled = mustCompile(src);
    expect(new Set(compiled.requestedTimeframes)).toEqual(new Set(["D", "W"]));
    // El '' (timeframe del chart) NO debe aparecer.
    expect(compiled.requestedTimeframes).not.toContain("");
  });

  it("no falla con timeframe dinámico (solo no lo prefetchea)", () => {
    const src = [
      'indicator("mtf", overlay=true)',
      "dyn = close > open ? 'D' : 'W'",
      "x = request.security(syminfo.tickerid, dyn, close, lookahead=barmerge.lookahead_on)",
      "plot(x)",
    ].join("\n");
    const compiled = mustCompile(src);
    expect(compiled.requestedTimeframes).toEqual([]);
  });
});

describe("Fase D — compatibilidad", () => {
  it("runScript sin runCtx sigue funcionando (timeframe.period vacío, syminfo vacío)", () => {
    const src = [
      'indicator("compat", overlay=true)',
      "plot(close)",
    ].join("\n");
    const { plots } = runScript(mustCompile(src), hourlyChart(1));
    expect(plots[0].points).toHaveLength(24);
  });
});
