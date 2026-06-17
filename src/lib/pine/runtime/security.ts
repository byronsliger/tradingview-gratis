import type { Candle } from "@/lib/binance/types";
import type { CallExpr, Expr } from "../ast";
import { PineRuntimeError, type SourcePos } from "../errors";
import { SERIES_BUILTINS } from "./builtins-core";
import type { ExecutionContext } from "./context";
import { TupleValue, type EvalValue } from "./values";

/**
 * request.security en v1 — alcance SCOPED a lo que el SMC usa: el `expr` es SIEMPRE
 * un builtin de serie (open/high/low/close/volume/time/hl2/hlc3/ohlc4/bar_index),
 * posiblemente con historial `[n]`, o una TUPLA de tales. Cualquier otra expresión
 * lanza un error claro en vez de evaluarse mal.
 *
 * Semántica de alineación (lookahead_on, que es lo que usa el SMC):
 *  - Para la barra actual del chart (time T en segundos), la vela HTF "contenedora"
 *    es la de mayor `time` con `time <= T`.
 *  - `close[0]` = valor de la vela contenedora (OHLC FINAL — semántica lookahead_on).
 *  - `close[n]` (n>0) = valor de la vela HTF n posiciones antes de la contenedora.
 *  - `time[k]` devuelve el `time` de esa vela HTF en MILISEGUNDOS (como el builtin time).
 *
 * Sin lookahead (off) → aproximación documentada: se usa la vela ANTERIOR a la
 * contenedora (índice -1) como base, simulando que la barra HTF aún no ha cerrado.
 */

/** Una "serie pedida": un builtin de serie con un offset histórico constante. */
interface SeriesRequest {
  field: string; // open/high/low/close/volume/time/hl2/hlc3/ohlc4/bar_index
  offset: number; // [n] (0 por defecto)
}

/** Constantes simbólicas de barmerge.* (lookahead/gaps). */
export const BARMERGE_LOOKAHEAD_ON = "lookahead_on";
export const BARMERGE_LOOKAHEAD_OFF = "lookahead_off";

/**
 * Evalúa `request.security(symbol, timeframe, expr, lookahead?, gaps?)` en la barra
 * actual. `timeframeValue` y `lookaheadOn` ya vienen evaluados por el interpreter
 * (son escalares simbólicos); `exprArg` es el AST crudo del 3er argumento (debe ser
 * un builtin de serie o un array literal de tales).
 */
export function evalRequestSecurity(
  ctx: ExecutionContext,
  call: CallExpr,
  timeframeValue: string,
  lookaheadOn: boolean,
): EvalValue {
  const exprArg = namedOrPositional(call, "expression", 2);
  if (!exprArg) {
    throw new PineRuntimeError("request.security requiere una expresión", call);
  }

  // Las velas de la serie objetivo: '' (o el tf del chart) → las propias del chart.
  const series = resolveSeries(ctx, timeframeValue);

  if (exprArg.kind === "array") {
    // Tupla de series builtin: [close[1], open[1], ...].
    const values = exprArg.elements.map((el) =>
      evalSeriesRequest(ctx, parseSeriesExpr(el), series, lookaheadOn),
    );
    return new TupleValue(values);
  }
  const req = parseSeriesExpr(exprArg);
  return evalSeriesRequest(ctx, req, series, lookaheadOn);
}

/** Expr del 2º argumento (timeframe) — el interpreter lo evalúa a string. */
export function timeframeArgExpr(call: CallExpr): Expr | undefined {
  return namedOrPositional(call, "timeframe", 1);
}

/** Expr del 4º argumento (lookahead) — el interpreter lo evalúa a símbolo. */
export function lookaheadArgExpr(call: CallExpr): Expr | undefined {
  return namedOrPositional(call, "lookahead", 3);
}

/**
 * Resuelve las velas de la serie objetivo. timeframe '' (o igual al del chart) →
 * las velas del propio chart. Si no hay datos HTF para ese tf → null (na), con un
 * warning una sola vez.
 */
function resolveSeries(ctx: ExecutionContext, tf: string): Candle[] | null {
  const trimmed = tf.trim();
  if (trimmed === "" || trimmed === (ctx.timeframe ?? "")) {
    return ctx.candles;
  }
  const htf = ctx.htf[trimmed];
  if (!htf) {
    ctx.warnMissingHtf(trimmed);
    return null;
  }
  return htf;
}

/**
 * Localiza el índice de la vela HTF "contenedora" de la barra actual del chart:
 * la de mayor `time` (segundos) con `time <= T`. -1 si T es anterior a toda la serie.
 */
function containingIndex(series: Candle[], chartTimeSec: number): number {
  let lo = 0;
  let hi = series.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].time <= chartTimeSec) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

/** Evalúa una SeriesRequest (campo + offset) sobre la serie HTF alineada. */
function evalSeriesRequest(
  ctx: ExecutionContext,
  req: SeriesRequest,
  series: Candle[] | null,
  lookaheadOn: boolean,
): EvalValue {
  if (series === null) return null; // sin datos HTF → na
  const chartTimeSec = ctx.candles[ctx.barIndex].time;
  let base = containingIndex(series, chartTimeSec);
  // lookahead_off: usar la vela ANTERIOR a la contenedora (aún no cerró).
  if (!lookaheadOn) base -= 1;
  const idx = base - req.offset;
  if (idx < 0 || idx >= series.length) return null;
  return seriesFieldValue(series[idx], idx, req.field);
}

/** Valor de un builtin de serie sobre una vela concreta de la serie objetivo. */
function seriesFieldValue(c: Candle, index: number, field: string): EvalValue {
  switch (field) {
    case "open":
      return c.open;
    case "high":
      return c.high;
    case "low":
      return c.low;
    case "close":
      return c.close;
    case "volume":
      return c.volume;
    case "time":
      return c.time * 1000; // Pine expone time en milisegundos
    case "bar_index":
      return index;
    case "hl2":
      return (c.high + c.low) / 2;
    case "hlc3":
      return (c.high + c.low + c.close) / 3;
    case "ohlc4":
      return (c.open + c.high + c.low + c.close) / 4;
    default:
      return null;
  }
}

/**
 * Parsea la expresión de request.security al subconjunto soportado: un builtin de
 * serie, opcionalmente con `[n]` (offset constante >= 0). Cualquier otra forma →
 * PineRuntimeError claro.
 */
function parseSeriesExpr(e: Expr): SeriesRequest {
  if (e.kind === "ident" && SERIES_BUILTINS.has(e.name)) {
    return { field: e.name, offset: 0 };
  }
  if (e.kind === "hist") {
    if (e.base.kind === "ident" && SERIES_BUILTINS.has(e.base.name)) {
      if (e.offset.kind !== "number" || !Number.isInteger(e.offset.value) || e.offset.value < 0) {
        throw unsupportedExpr(e);
      }
      return { field: e.base.name, offset: e.offset.value };
    }
  }
  throw unsupportedExpr(e);
}

function unsupportedExpr(pos: SourcePos): PineRuntimeError {
  return new PineRuntimeError(
    "request.security solo soporta series builtin (open/high/low/close/volume/time/hl2/hlc3/ohlc4/bar_index, con [n]) y tuplas de ellas en v1",
    pos,
  );
}

/** Devuelve el Expr del arg `name` (nombrado) o de la posición `pos` (posicional). */
function namedOrPositional(call: CallExpr, name: string, pos: number): Expr | undefined {
  let positional = 0;
  for (const arg of call.args) {
    if (arg.name === name) return arg.value;
    if (arg.name === null) {
      if (positional === pos) return arg.value;
      positional++;
    }
  }
  return undefined;
}
