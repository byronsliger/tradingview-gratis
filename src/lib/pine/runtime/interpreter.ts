import type { Candle } from "@/lib/binance/types";
import type {
  CallArg,
  CallExpr,
  Expr,
  HistAccess,
  Identifier,
  MemberExpr,
  Program,
  Stmt,
} from "../ast";
import { PineRuntimeError, type SourcePos } from "../errors";
import type { PineValue, RunOptions } from "../types";
import {
  COLOR_CONSTANTS,
  INDICATOR_PARAMS,
  PLOT_PARAMS,
  SERIES_BUILTINS,
} from "./builtins-core";
import { mathBuiltins } from "./builtins-math";
import { taBuiltins } from "./builtins-ta";
import { ExecutionContext } from "./context";
import { Series } from "./series";

const MATH_CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  phi: (1 + Math.sqrt(5)) / 2,
  rphi: 2 / (1 + Math.sqrt(5)),
};

/**
 * Ejecuta el programa una vez por barra (barIndex 0..N-1) sobre las velas.
 * Devuelve el contexto con `plotValues` poblado por callSiteId.
 */
export function runProgram(
  program: Program,
  candles: Candle[],
  inputs: Record<string, number | string | boolean> = {},
  options?: RunOptions,
): ExecutionContext {
  const ctx = new ExecutionContext(candles, inputs, options);
  for (let bar = 0; bar < candles.length; bar++) {
    ctx.startBar(bar);
    for (const stmt of program.statements) execStmt(ctx, stmt);
  }
  return ctx;
}

function execStmt(ctx: ExecutionContext, stmt: Stmt): void {
  ctx.consumeFuel(stmt);
  switch (stmt.kind) {
    case "varDecl": {
      if (SERIES_BUILTINS.has(stmt.name) || stmt.name === "na") {
        throw new PineRuntimeError(`No se puede redeclarar el builtin '${stmt.name}'`, stmt);
      }
      const existing = ctx.vars.get(stmt.name);
      if (stmt.isVar && existing) {
        // `var`: el init solo corre en la primera barra; en las siguientes arrastra
        // el último valor de la barra anterior (que pudo cambiar vía `:=`).
        existing.series.set(ctx.barIndex, existing.series.get(ctx.barIndex, 1));
        return;
      }
      const slot = existing ?? { series: new Series(), isVar: stmt.isVar };
      if (!existing) ctx.vars.set(stmt.name, slot);
      slot.series.set(ctx.barIndex, evalExpr(ctx, stmt.init));
      return;
    }
    case "assign": {
      const slot = ctx.vars.get(stmt.name);
      if (!slot) {
        throw new PineRuntimeError(
          `No se puede asignar a '${stmt.name}' con ':=' porque no está declarada`,
          stmt,
        );
      }
      slot.series.set(ctx.barIndex, evalExpr(ctx, stmt.value));
      return;
    }
    case "exprStmt":
      evalExpr(ctx, stmt.expr);
      return;
  }
}

function evalExpr(ctx: ExecutionContext, e: Expr): PineValue {
  ctx.consumeFuel(e);
  switch (e.kind) {
    case "number":
    case "string":
    case "bool":
    case "color":
      return e.value;
    case "ident":
      return evalIdent(ctx, e);
    case "member":
      return evalMember(ctx, e);
    case "call":
      return evalCall(ctx, e);
    case "unary": {
      const v = evalExpr(ctx, e.operand);
      if (e.op === "not") return !toBool(v);
      if (typeof v !== "number") return null; // na (o tipo no numérico) propaga na
      return e.op === "-" ? clean(-v) : clean(v);
    }
    case "binary": {
      // Sin cortocircuito: Pine evalúa ambos operandos en cada barra para que
      // los ta.* internos mantengan su estado por call-site.
      const l = evalExpr(ctx, e.left);
      const r = evalExpr(ctx, e.right);
      return applyBinary(e.op, l, r);
    }
    case "ternary": {
      const cond = toBool(evalExpr(ctx, e.cond));
      // Ambas ramas se evalúan siempre (semántica de series de Pine).
      const whenTrue = evalExpr(ctx, e.whenTrue);
      const whenFalse = evalExpr(ctx, e.whenFalse);
      return cond ? whenTrue : whenFalse;
    }
    case "hist":
      return evalHist(ctx, e);
  }
}

function evalIdent(ctx: ExecutionContext, e: Identifier): PineValue {
  if (e.name === "na") return null;
  if (SERIES_BUILTINS.has(e.name)) return builtinSeriesValue(ctx, e.name, ctx.barIndex);
  const slot = ctx.vars.get(e.name);
  if (slot) return slot.series.get(ctx.barIndex);
  throw new PineRuntimeError(`Variable '${e.name}' no definida`, e);
}

function evalMember(ctx: ExecutionContext, e: MemberExpr): PineValue {
  if (e.object === "color") {
    const c = COLOR_CONSTANTS[e.property];
    if (c !== undefined) return c;
    throw new PineRuntimeError(`'color.${e.property}' no existe`, e);
  }
  if (e.object === "math") {
    const v = MATH_CONSTANTS[e.property];
    if (v !== undefined) return v;
    throw new PineRuntimeError(`'math.${e.property}' no es una constante conocida`, e);
  }
  // `ta.tr` se puede usar como variable (sin llamar); su estado vive en nodeId.
  if (e.object === "ta" && e.property === "tr") {
    return taBuiltins.tr.fn(ctx, e.nodeId, []);
  }
  throw new PineRuntimeError(`'${e.object}.${e.property}' no está soportado como valor`, e);
}

interface EvaluatedArg {
  name: string | null;
  value: PineValue;
  pos: SourcePos;
}

function evalArgs(ctx: ExecutionContext, args: CallArg[]): EvaluatedArg[] {
  return args.map((a) => ({ name: a.name, value: evalExpr(ctx, a.value), pos: a.value }));
}

/** Mapea args posicionales y nombrados sobre la lista de parámetros del builtin. */
function mapArgs(
  call: SourcePos,
  evaluated: EvaluatedArg[],
  params: string[],
  required: number,
  variadic = false,
): (PineValue | undefined)[] {
  if (variadic) {
    for (const a of evaluated) {
      if (a.name !== null) {
        throw new PineRuntimeError("Esta función no acepta argumentos con nombre", a.pos);
      }
    }
    if (evaluated.length < required) {
      throw new PineRuntimeError(`Faltan argumentos: se esperaban al menos ${required}`, call);
    }
    return evaluated.map((a) => a.value);
  }
  const out: (PineValue | undefined)[] = new Array(params.length).fill(undefined);
  const provided: boolean[] = new Array(params.length).fill(false);
  let positional = 0;
  let sawNamed = false;
  for (const a of evaluated) {
    if (a.name === null) {
      if (sawNamed) {
        throw new PineRuntimeError("Los argumentos posicionales deben ir antes que los nombrados", a.pos);
      }
      if (positional >= params.length) {
        throw new PineRuntimeError(`Demasiados argumentos (máximo ${params.length})`, a.pos);
      }
      provided[positional] = true;
      out[positional++] = a.value;
    } else {
      sawNamed = true;
      const idx = params.indexOf(a.name);
      if (idx < 0) throw new PineRuntimeError(`Parámetro desconocido '${a.name}'`, a.pos);
      if (provided[idx]) throw new PineRuntimeError(`Parámetro '${a.name}' repetido`, a.pos);
      provided[idx] = true;
      out[idx] = a.value;
    }
  }
  for (let i = 0; i < required; i++) {
    if (!provided[i]) {
      throw new PineRuntimeError(`Falta el argumento '${params[i]}'`, call);
    }
  }
  return out;
}

function evalCall(ctx: ExecutionContext, e: CallExpr): PineValue {
  const evaluated = evalArgs(ctx, e.args);
  const callee = e.callee;

  if (callee.kind === "ident") {
    switch (callee.name) {
      case "plot": {
        const mapped = mapArgs(e, evaluated, PLOT_PARAMS, 1);
        const v = mapped[0];
        ctx.recordPlot(e.callSiteId, typeof v === "number" && Number.isFinite(v) ? v : null);
        return null;
      }
      case "indicator":
        mapArgs(e, evaluated, INDICATOR_PARAMS, 0);
        return null;
      case "nz": {
        const mapped = mapArgs(e, evaluated, ["source", "replacement"], 1);
        const v = mapped[0];
        if (v !== null && v !== undefined) return v;
        return mapped[1] === undefined ? 0 : mapped[1];
      }
      case "na": {
        const mapped = mapArgs(e, evaluated, ["source"], 1);
        return mapped[0] === null;
      }
      case "hline":
      case "plotshape":
      case "plotchar":
      case "input":
      case "alertcondition":
        throw new PineRuntimeError(
          `'${callee.name}()' aún no está soportado (llega en una fase posterior)`,
          e,
        );
      default:
        throw new PineRuntimeError(`Función '${callee.name}' desconocida`, e);
    }
  }

  if (callee.object === "ta") {
    const builtin = taBuiltins[callee.property];
    if (!builtin) throw new PineRuntimeError(`'ta.${callee.property}' aún no está soportado`, e);
    const mapped = mapArgs(e, evaluated, builtin.params, builtin.required);
    return builtin.fn(ctx, e.callSiteId, mapped);
  }
  if (callee.object === "math") {
    const builtin = mathBuiltins[callee.property];
    if (!builtin) throw new PineRuntimeError(`'math.${callee.property}' aún no está soportado`, e);
    const mapped = mapArgs(e, evaluated, builtin.params, builtin.required, builtin.variadic === true);
    return builtin.fn(mapped);
  }
  if (callee.object === "input") {
    throw new PineRuntimeError(`'input.${callee.property}()' llega en Fase 4`, e);
  }
  throw new PineRuntimeError(`Función '${callee.object}.${callee.property}' desconocida`, e);
}

function evalHist(ctx: ExecutionContext, e: HistAccess): PineValue {
  const offRaw = evalExpr(ctx, e.offset);
  const n = typeof offRaw === "number" && Number.isFinite(offRaw) ? Math.floor(offRaw) : null;
  if (n !== null && n < 0) {
    throw new PineRuntimeError("El offset histórico no puede ser negativo", e);
  }

  if (e.base.kind === "ident") {
    const name = e.base.name;
    if (name === "na") return null;
    if (SERIES_BUILTINS.has(name)) {
      return n === null ? null : builtinSeriesValue(ctx, name, ctx.barIndex - n);
    }
    const slot = ctx.vars.get(name);
    if (slot) return n === null ? null : slot.series.get(ctx.barIndex, n);
    throw new PineRuntimeError(`Variable '${name}' no definida`, e.base);
  }

  // Base arbitraria: se evalúa SIEMPRE (también con offset na) para poblar la
  // serie oculta barra a barra, y luego se lee con el offset.
  const hidden = ctx.getHiddenSeries(e.nodeId);
  hidden.set(ctx.barIndex, evalExpr(ctx, e.base));
  return n === null ? null : hidden.get(ctx.barIndex, n);
}

function builtinSeriesValue(ctx: ExecutionContext, name: string, index: number): PineValue {
  if (index < 0 || index >= ctx.candles.length) return null;
  const c = ctx.candles[index];
  switch (name) {
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
      return c.time * 1000; // Pine expone `time` en milisegundos UNIX
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

/** na/false/0/"" son falsy; todo lo demás truthy. (`not na` → true: simplificación documentada.) */
function toBool(v: PineValue): boolean {
  if (v === null || v === false) return false;
  if (v === true) return true;
  if (typeof v === "number") return v !== 0;
  return v.length > 0;
}

/** NaN/±Infinity se normalizan a na. */
function clean(v: number): PineValue {
  return Number.isFinite(v) ? v : null;
}

function applyBinary(op: string, l: PineValue, r: PineValue): PineValue {
  switch (op) {
    case "and":
      return toBool(l) && toBool(r);
    case "or":
      return toBool(l) || toBool(r);
    case "==":
    case "!=":
    case "<":
    case "<=":
    case ">":
    case ">=":
      // Comparar con na siempre da false (incluido na == na y na != x).
      if (l === null || r === null) return false;
      return compare(op, l, r);
    default:
      break;
  }
  // Aritmética: '+' concatena strings; el resto exige números; na propaga na.
  if (op === "+" && typeof l === "string" && typeof r === "string") return l + r;
  if (typeof l !== "number" || typeof r !== "number") return null;
  switch (op) {
    case "+":
      return clean(l + r);
    case "-":
      return clean(l - r);
    case "*":
      return clean(l * r);
    case "/":
      return r === 0 ? null : clean(l / r);
    case "%":
      return r === 0 ? null : clean(l % r);
    default:
      return null;
  }
}

function compare(op: string, l: number | string | boolean, r: number | string | boolean): boolean {
  if (op === "==") return l === r;
  if (op === "!=") return l !== r;
  const comparable =
    (typeof l === "number" && typeof r === "number") ||
    (typeof l === "string" && typeof r === "string");
  if (!comparable) return false;
  switch (op) {
    case "<":
      return l < r;
    case "<=":
      return l <= r;
    case ">":
      return l > r;
    case ">=":
      return l >= r;
    default:
      return false;
  }
}
