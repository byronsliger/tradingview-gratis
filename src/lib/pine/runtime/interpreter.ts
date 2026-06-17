import type { Candle } from "@/lib/binance/types";
import type {
  CallArg,
  CallExpr,
  Expr,
  FieldAccess,
  HistAccess,
  Identifier,
  MemberExpr,
  Program,
  Stmt,
} from "../ast";
import { PineRuntimeError, type SourcePos } from "../errors";
import type { InputDef, PineValue, RunContext, RunOptions } from "../types";
import {
  COLOR_CONSTANTS,
  HLINE_PARAMS,
  INDICATOR_PARAMS,
  NAMESPACE_CONSTANTS,
  PLOTCANDLE_PARAMS,
  PLOTCHAR_PARAMS,
  PLOTSHAPE_PARAMS,
  PLOT_PARAMS,
  SERIES_BUILTINS,
  SOURCE_NAMES,
} from "./builtins-core";
import { mathBuiltins } from "./builtins-math";
import { taBuiltins } from "./builtins-ta";
import { type DrawingLimits, ExecutionContext } from "./context";
import { PineArray } from "./arrays";
import { arrayNewFromGeneric, callArrayMethod } from "./array-methods";
import {
  boxNew,
  callDrawMethod,
  chartPointNew,
  labelNew,
  lineNew,
} from "./draw-methods";
import { ChartPoint, PineBox, PineLabel, PineLine } from "./drawings";
import { PineObject, type FieldDef, type TypeDescriptor } from "./objects";
import {
  BARMERGE_LOOKAHEAD_ON,
  evalRequestSecurity,
  lookaheadArgExpr,
  timeframeArgExpr,
} from "./security";
import { Series } from "./series";
import { parseTimeframe, periodId } from "./timeframe";
import { TupleValue, type EvalValue } from "./values";

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
  inputDefs: InputDef[] = [],
  limits?: DrawingLimits,
  runCtx?: RunContext,
): ExecutionContext {
  const ctx = new ExecutionContext(candles, inputs, options, inputDefs, limits, runCtx);
  // Registrar funciones de usuario y tipos (UDTs) antes de ejecutar barras (hoisting).
  for (const stmt of program.statements) {
    if (stmt.kind === "funcDecl") {
      ctx.functions.set(stmt.name, {
        params: stmt.params,
        paramDefaults: stmt.paramDefaults,
        decl: stmt,
      });
    } else if (stmt.kind === "typeDecl") {
      const descriptor: TypeDescriptor = {
        name: stmt.name,
        fields: stmt.fields.map(
          (f): FieldDef => ({ name: f.name, typeRef: f.typeRef, default: f.default }),
        ),
      };
      ctx.types.set(stmt.name, descriptor);
    }
  }
  for (let bar = 0; bar < candles.length; bar++) {
    ctx.startBar(bar);
    for (const stmt of program.statements) {
      try {
        execStmt(ctx, stmt);
      } catch (sig) {
        // break/continue fuera de un for: error posicionado en vez de crash.
        if (sig instanceof LoopSignal) {
          throw new PineRuntimeError(`'${sig.kind}' solo es válido dentro de un bucle for`, stmt);
        }
        throw sig;
      }
    }
  }
  return ctx;
}

/** Señal de control de flujo lanzada por break/continue dentro de un for. */
class LoopSignal {
  constructor(readonly kind: "break" | "continue") {}
}

function execStmt(ctx: ExecutionContext, stmt: Stmt): void {
  ctx.consumeFuel(stmt);
  switch (stmt.kind) {
    case "varDecl": {
      if (SERIES_BUILTINS.has(stmt.name) || stmt.name === "na") {
        throw new PineRuntimeError(`No se puede redeclarar el builtin '${stmt.name}'`, stmt);
      }
      // evalExprT: la RHS puede ser un objeto (Type.new()/acceso a campo/función).
      declareVar(ctx, stmt.isVar, stmt.name, () => evalExprT(ctx, stmt.init), stmt);
      return;
    }
    case "tupleDecl": {
      const value = evalExprT(ctx, stmt.init);
      if (!(value instanceof TupleValue)) {
        throw new PineRuntimeError(
          "El lado derecho de [a, b] = … debe devolver una tupla",
          stmt,
        );
      }
      if (value.values.length !== stmt.names.length) {
        throw new PineRuntimeError(
          `La tupla tiene ${value.values.length} valores pero se desestructuran ${stmt.names.length}`,
          stmt,
        );
      }
      stmt.names.forEach((name, i) => {
        if (SERIES_BUILTINS.has(name) || name === "na") {
          throw new PineRuntimeError(`No se puede redeclarar el builtin '${name}'`, stmt);
        }
        const v = value.values[i];
        declareVar(ctx, stmt.isVar, name, () => v, stmt);
      });
      return;
    }
    case "assign": {
      const slot = ctx.lookupVar(stmt.name);
      if (!slot) {
        throw new PineRuntimeError(
          `No se puede asignar a '${stmt.name}' con ':=' porque no está declarada`,
          stmt,
        );
      }
      // evalExprT: puede reasignarse un objeto (o na de objeto).
      slot.series.set(ctx.barIndex, evalExprT(ctx, stmt.value));
      return;
    }
    case "fieldAssign": {
      const obj = evalExprT(ctx, stmt.target.target);
      if (obj === null) {
        throw new PineRuntimeError(
          `No se puede asignar al campo '${stmt.target.field}' de un objeto na`,
          stmt.target,
        );
      }
      if (!(obj instanceof PineObject)) {
        throw new PineRuntimeError(
          `Solo se puede asignar a campos de un objeto (UDT)`,
          stmt.target,
        );
      }
      if (!obj.fields.has(stmt.target.field)) {
        throw new PineRuntimeError(
          `El tipo '${obj.typeName}' no tiene el campo '${stmt.target.field}'`,
          stmt.target,
        );
      }
      obj.fields.set(stmt.target.field, evalExprT(ctx, stmt.value));
      return;
    }
    case "typeDecl":
      // Ya registrada en runProgram (hoisting); no-op por barra.
      return;
    case "ifStmt": {
      if (toBool(evalExpr(ctx, stmt.cond))) {
        execBlock(ctx, stmt.then);
      } else if (stmt.elseBranch) {
        execBlock(ctx, stmt.elseBranch);
      }
      return;
    }
    case "forStmt":
      execFor(ctx, stmt);
      return;
    case "forInStmt":
      execForIn(ctx, stmt);
      return;
    case "break":
      throw new LoopSignal("break");
    case "continue":
      throw new LoopSignal("continue");
    case "funcDecl":
      // Ya registrada en runProgram (hoisting); no-op por barra.
      return;
    case "exprStmt":
      // evalExprT: una llamada como statement (label.new(...), arr.push(x), …) puede
      // devolver un handle/objeto/array — su valor se descarta, pero no debe forzar
      // contexto escalar (que rechazaría dibujos).
      evalExprT(ctx, stmt.expr);
      return;
  }
}

function execBlock(ctx: ExecutionContext, stmts: Stmt[]): void {
  for (const s of stmts) execStmt(ctx, s);
}

/**
 * Declara/actualiza una variable. En scope local de función, los `var` persisten
 * entre barras vía persistentVarSlot; el resto vive en el scope (recreado por call).
 */
function declareVar(
  ctx: ExecutionContext,
  isVar: boolean,
  name: string,
  computeInit: () => EvalValue,
  pos: Stmt,
): void {
  const inFunction = ctx.currentScope() !== ctx.vars;
  if (inFunction) {
    // Dentro de una función todos los locales son series persistentes entre
    // barras (keyed por call-site + nombre), para que `x[1]` lea la barra previa.
    // Los `var` ya inicializados arrastran su valor; el resto se recalcula cada
    // barra conservando el historial.
    const { slot, existed } = ctx.persistentVarSlot(name, isVar);
    ctx.currentScope().set(name, slot);
    if (isVar && existed) {
      slot.series.set(ctx.barIndex, slot.series.get(ctx.barIndex, 1));
    } else {
      slot.series.set(ctx.barIndex, computeInit());
    }
    return;
  }
  const scope = ctx.currentScope();
  const existing = scope.get(name);
  if (isVar && existing) {
    existing.series.set(ctx.barIndex, existing.series.get(ctx.barIndex, 1));
    return;
  }
  const slot = existing ?? { series: new Series(), isVar };
  if (!existing) scope.set(name, slot);
  slot.series.set(ctx.barIndex, computeInit());
  void pos;
}

function execFor(ctx: ExecutionContext, stmt: Extract<Stmt, { kind: "forStmt" }>): void {
  const fromV = evalExpr(ctx, stmt.from);
  const toV = evalExpr(ctx, stmt.to);
  if (typeof fromV !== "number" || typeof toV !== "number") {
    throw new PineRuntimeError("Los límites de 'for' deben ser numéricos", stmt);
  }
  const step = stmt.step ? evalExpr(ctx, stmt.step) : null;
  if (step !== null && typeof step !== "number") {
    throw new PineRuntimeError("El paso de 'for' debe ser numérico", stmt);
  }
  let stepN = typeof step === "number" ? step : toV >= fromV ? 1 : -1;
  if (stepN === 0) stepN = toV >= fromV ? 1 : -1;

  // Slot del contador en el scope actual.
  const scope = ctx.currentScope();
  const slot: { series: Series; isVar: boolean } = { series: new Series(), isVar: false };
  scope.set(stmt.varName, slot);

  const ascending = stepN > 0;
  for (let i = fromV; ascending ? i <= toV : i >= toV; i += stepN) {
    ctx.consumeFuel(stmt); // cada iteración consume fuel
    slot.series.set(ctx.barIndex, i);
    try {
      execBlock(ctx, stmt.body);
    } catch (sig) {
      if (sig instanceof LoopSignal) {
        if (sig.kind === "break") break;
        continue;
      }
      throw sig;
    }
  }
}

/**
 * `for [i, v] in arr` / `for v in arr`. Itera sobre un snapshot del tamaño inicial
 * del array (mutar el array durante la iteración no cambia el nº de vueltas). Iterar
 * sobre `na` lanza (como Pine). Cada iteración consume fuel; soporta break/continue.
 */
function execForIn(ctx: ExecutionContext, stmt: Extract<Stmt, { kind: "forInStmt" }>): void {
  const iterable = evalExprT(ctx, stmt.iterable);
  if (iterable === null) {
    throw new PineRuntimeError("No se puede iterar sobre un array na", stmt);
  }
  if (!(iterable instanceof PineArray)) {
    throw new PineRuntimeError("'for ... in' requiere un array", stmt);
  }

  const scope = ctx.currentScope();
  const valueSlot: { series: Series; isVar: boolean } = { series: new Series(), isVar: false };
  scope.set(stmt.valueVar, valueSlot);
  let indexSlot: { series: Series; isVar: boolean } | null = null;
  if (stmt.indexVar !== null) {
    indexSlot = { series: new Series(), isVar: false };
    scope.set(stmt.indexVar, indexSlot);
  }

  // Snapshot de los ELEMENTOS (copia), no solo del tamaño: si el cuerpo muta el
  // array (p. ej. deleteOrderBlocks hace remove(index) durante la iteración), el
  // valor de cada vuelta sigue siendo el elemento original y nunca se lee na de
  // una posición ya removida.
  const snapshot = iterable.items.slice();
  for (let i = 0; i < snapshot.length; i++) {
    ctx.consumeFuel(stmt); // cada iteración consume fuel
    valueSlot.series.set(ctx.barIndex, snapshot[i] ?? null);
    if (indexSlot) indexSlot.series.set(ctx.barIndex, i);
    try {
      execBlock(ctx, stmt.body);
    } catch (sig) {
      if (sig instanceof LoopSignal) {
        if (sig.kind === "break") break;
        continue;
      }
      throw sig;
    }
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
      return scalar(evalIdentT(ctx, e), e);
    case "member":
      return evalMember(ctx, e);
    case "fieldAccess":
      return scalar(evalFieldAccess(ctx, e), e);
    case "call":
      return evalCall(ctx, e);
    case "unary": {
      const v = evalExpr(ctx, e.operand);
      // `not na` → na (semántica lógica de Pine); `not bool` invierte.
      if (e.op === "not") return v === null ? null : !toBool(v);
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
      // Cortocircuito como Pine: solo se evalúa la rama tomada. Esto evita
      // crashes en patrones guard (`size > 0 ? arr.get(i) : fallback`). Efecto
      // colateral aceptado: un ta.* en la rama no tomada no avanza ese tick.
      return toBool(evalExpr(ctx, e.cond))
        ? evalExpr(ctx, e.whenTrue)
        : evalExpr(ctx, e.whenFalse);
    }
    case "hist":
      return scalar(evalHistT(ctx, e), e);
    case "ifExpr":
    case "switchExpr":
      return scalar(evalExprT(ctx, e), e);
    case "array":
      throw new PineRuntimeError(
        "Los arrays solo están soportados como 'options' de input.*",
        e,
      );
  }
}

/** Exige un valor escalar; una tupla o un objeto en contexto escalar es un error. */
function scalar(v: EvalValue, pos: SourcePos): PineValue {
  if (v instanceof TupleValue) {
    throw new PineRuntimeError("Se usó una tupla donde se esperaba un valor", pos);
  }
  if (v instanceof PineObject) {
    throw new PineRuntimeError(
      `Se usó un objeto de tipo '${v.typeName}' donde se esperaba un valor escalar`,
      pos,
    );
  }
  if (v instanceof PineArray) {
    throw new PineRuntimeError(
      "Se usó un array donde se esperaba un valor escalar",
      pos,
    );
  }
  if (v instanceof PineLabel || v instanceof PineLine || v instanceof PineBox || v instanceof ChartPoint) {
    throw new PineRuntimeError(
      "Se usó un objeto de dibujo donde se esperaba un valor escalar",
      pos,
    );
  }
  return v;
}

/**
 * Variante tuple-/objeto-capable de evalExpr: call/if/switch/array pueden devolver
 * tuplas; ident/hist/fieldAccess pueden devolver objetos (instancias de UDT).
 */
function evalExprT(ctx: ExecutionContext, e: Expr): EvalValue {
  if (e.kind === "call") return evalCallT(ctx, e);
  if (e.kind === "ident") return evalIdentT(ctx, e);
  if (e.kind === "hist") return evalHistT(ctx, e);
  if (e.kind === "fieldAccess") return evalFieldAccess(ctx, e);
  // Ternario object-capable: las ramas pueden devolver objetos/arrays/handles
  // (p.ej. `internal ? internalHigh : swingHigh`). Ambas se evalúan (semántica de
  // series de Pine) en modo tuple-/objeto-capable.
  if (e.kind === "ternary") {
    ctx.consumeFuel(e);
    // Cortocircuito como Pine: solo la rama tomada (object-/tuple-capable).
    return toBool(evalExpr(ctx, e.cond))
      ? evalExprT(ctx, e.whenTrue)
      : evalExprT(ctx, e.whenFalse);
  }
  // `[a, b]` como valor de retorno de una función → tupla (elementos pueden ser objetos).
  if (e.kind === "array") {
    return new TupleValue(e.elements.map((el) => evalExprT(ctx, el)));
  }
  if (e.kind === "ifExpr") {
    for (const branch of e.branches) {
      if (branch.cond === null || toBool(evalExpr(ctx, branch.cond))) {
        return evalBlockValue(ctx, branch.body);
      }
    }
    return null; // ninguna rama y sin else → na
  }
  if (e.kind === "switchExpr") {
    const subject = e.subject ? evalExpr(ctx, e.subject) : null;
    for (const c of e.cases) {
      if (c.match === null) return evalBlockValue(ctx, c.body); // rama default
      const m = evalExpr(ctx, c.match);
      const matches = e.subject ? valuesEqual(subject, m) : toBool(m);
      if (matches) return evalBlockValue(ctx, c.body);
    }
    return null;
  }
  return evalExpr(ctx, e);
}

/** Ejecuta un bloque y devuelve el valor de su última expresión (como en Pine). */
function evalBlockValue(ctx: ExecutionContext, stmts: Stmt[]): EvalValue {
  let value: EvalValue = null;
  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i];
    if (i === stmts.length - 1 && s.kind === "exprStmt") {
      value = evalExprT(ctx, s.expr);
    } else {
      execStmt(ctx, s);
    }
  }
  return value;
}

function valuesEqual(a: PineValue, b: PineValue): boolean {
  if (a === null || b === null) return false;
  return a === b;
}

function evalIdentT(ctx: ExecutionContext, e: Identifier): EvalValue {
  if (e.name === "na") return null;
  if (SERIES_BUILTINS.has(e.name)) return builtinSeriesValue(ctx, e.name, ctx.barIndex);
  const slot = ctx.lookupVar(e.name);
  if (slot) return slot.series.get(ctx.barIndex);
  throw new PineRuntimeError(`Variable '${e.name}' no definida`, e);
}

/** Lectura de un campo de objeto: `obj.field` (encadenable). */
function evalFieldAccess(ctx: ExecutionContext, e: FieldAccess): EvalValue {
  const target = evalExprT(ctx, e.target);
  if (target === null) {
    throw new PineRuntimeError(
      `No se puede leer el campo '${e.field}' de un objeto na`,
      e,
    );
  }
  if (!(target instanceof PineObject)) {
    throw new PineRuntimeError(
      `El acceso a campo '.${e.field}' requiere un objeto (UDT)`,
      e,
    );
  }
  if (!target.fields.has(e.field)) {
    throw new PineRuntimeError(
      `El tipo '${target.typeName}' no tiene el campo '${e.field}'`,
      e,
    );
  }
  return target.fields.get(e.field) ?? null;
}

function evalMember(ctx: ExecutionContext, e: MemberExpr): PineValue {
  if (e.object === "color") {
    const c = COLOR_CONSTANTS[e.property];
    if (c !== undefined) return c;
    throw new PineRuntimeError(`'color.${e.property}' no existe`, e);
  }
  // Constantes de namespace: plot.style_*, hline.style_*, location.*, shape.*, size.*
  const nsTable = NAMESPACE_CONSTANTS[e.object];
  if (nsTable && e.object !== "color") {
    const v = nsTable[e.property];
    if (v !== undefined) return v;
    throw new PineRuntimeError(`'${e.object}.${e.property}' no existe`, e);
  }
  if (e.object === "math") {
    const v = MATH_CONSTANTS[e.property];
    if (v !== undefined) return v;
    throw new PineRuntimeError(`'math.${e.property}' no es una constante conocida`, e);
  }
  // `ta.tr` se puede usar como variable (sin llamar); su estado vive en nodeId.
  if (e.object === "ta" && e.property === "tr") {
    return scalar(taBuiltins.tr.fn(ctx, e.nodeId, []), e);
  }
  if (e.object === "barmerge") return evalBarmergeConst(e);
  if (e.object === "syminfo") return evalSyminfoConst(ctx, e);
  if (e.object === "barstate") return evalBarstateConst(ctx, e);
  if (e.object === "timeframe") return evalTimeframeConst(ctx, e);
  throw new PineRuntimeError(`'${e.object}.${e.property}' no está soportado como valor`, e);
}

/** barmerge.lookahead_on/off, barmerge.gaps_on/off → strings simbólicos. */
function evalBarmergeConst(e: MemberExpr): PineValue {
  switch (e.property) {
    case "lookahead_on":
      return "lookahead_on";
    case "lookahead_off":
      return "lookahead_off";
    case "gaps_on":
      return "gaps_on";
    case "gaps_off":
      return "gaps_off";
    default:
      throw new PineRuntimeError(`'barmerge.${e.property}' no existe`, e);
  }
}

/** syminfo.tickerid/.ticker → símbolo del runCtx (o ""); resto mínimo. */
function evalSyminfoConst(ctx: ExecutionContext, e: MemberExpr): PineValue {
  switch (e.property) {
    case "tickerid":
    case "ticker":
      return ctx.symbol;
    case "prefix":
      return "";
    case "mintick":
      return 0;
    default:
      throw new PineRuntimeError(`'syminfo.${e.property}' aún no está soportado`, e);
  }
}

/**
 * barstate.* — todas las barras son históricas en el motor (no hay realtime):
 * isfirst (barra 0), islast/islastconfirmedhistory (última barra), ishistory true,
 * isnew true (una pasada por barra), isrealtime false (documentado).
 */
function evalBarstateConst(ctx: ExecutionContext, e: MemberExpr): PineValue {
  const last = ctx.candles.length - 1;
  switch (e.property) {
    case "isfirst":
      return ctx.barIndex === 0;
    case "islast":
    case "islastconfirmedhistory":
      return ctx.barIndex === last;
    case "ishistory":
      return true;
    case "isnew":
      return true;
    case "isrealtime":
    case "isconfirmed":
      // En el motor no hay realtime: todas las barras son históricas confirmadas.
      return e.property === "isconfirmed";
    default:
      throw new PineRuntimeError(`'barstate.${e.property}' aún no está soportado`, e);
  }
}

/** timeframe.period/multiplier/isdaily/isweekly/ismonthly (del tf actual). */
function evalTimeframeConst(ctx: ExecutionContext, e: MemberExpr): PineValue {
  const info = parseTimeframe(ctx.timeframe);
  switch (e.property) {
    case "period":
      return ctx.timeframe;
    case "multiplier":
      return info ? info.multiplier : null;
    case "isdaily":
      return info?.unit === "day";
    case "isweekly":
      return info?.unit === "week";
    case "ismonthly":
      return info?.unit === "month";
    case "isintraday":
      return info?.unit === "minute";
    case "isseconds":
      return false;
    case "isminutes":
      return info?.unit === "minute";
    default:
      throw new PineRuntimeError(`'timeframe.${e.property}' aún no está soportado`, e);
  }
}

/**
 * Llamadas timeframe.*: in_seconds(tf?) → segundos del tf (o del actual);
 * change(tf) → true en la primera barra de un nuevo periodo del tf dado.
 */
function evalTimeframeCall(ctx: ExecutionContext, e: CallExpr, prop: string): PineValue {
  const argExprs = e.args.map((a) => a.value);
  if (prop === "in_seconds") {
    const tf =
      argExprs.length > 0 ? evalExpr(ctx, argExprs[0]) : ctx.timeframe;
    const tfStr = typeof tf === "string" ? tf : ctx.timeframe;
    const info = parseTimeframe(tfStr === "" ? ctx.timeframe : tfStr);
    return info ? info.seconds : null;
  }
  if (prop === "change") {
    if (argExprs.length === 0) {
      throw new PineRuntimeError("timeframe.change() requiere un timeframe", e);
    }
    const tf = evalExpr(ctx, argExprs[0]);
    let tfStr = typeof tf === "string" ? tf : "";
    // '' = timeframe del chart. Cada barra ES un periodo del tf del chart, así
    // que el cambio es true en cada barra (clave para los FVG, que exigen
    // timeframe.change('')). Resolvemos a ctx.timeframe; si no hay, true siempre.
    if (tfStr.trim() === "") {
      tfStr = ctx.timeframe ?? "";
      if (tfStr.trim() === "") return true;
    }
    const info = parseTimeframe(tfStr);
    if (!info) return false;
    const cur = ctx.candles[ctx.barIndex];
    if (ctx.barIndex === 0) return true; // primera barra = inicio de periodo
    const prev = ctx.candles[ctx.barIndex - 1];
    return periodId(cur.time, info) !== periodId(prev.time, info);
  }
  throw new PineRuntimeError(`'timeframe.${prop}()' aún no está soportado`, e);
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
  return scalar(evalCallT(ctx, e), e);
}

function evalCallT(ctx: ExecutionContext, e: CallExpr): EvalValue {
  const callee = e.callee;

  // Constructor de UDT: `Type.new(args)`. El callee es un fieldAccess cuyo target
  // es un identificador que nombra un tipo registrado y cuyo field es "new".
  if (
    callee.kind === "fieldAccess" &&
    callee.target.kind === "ident" &&
    callee.field === "new" &&
    ctx.types.has(callee.target.name)
  ) {
    return constructObject(ctx, ctx.types.get(callee.target.name)!, e);
  }

  // Constructor `chart.point.new(...)`: el callee es un fieldAccess cuyo target es el
  // MemberExpr `chart.point` y cuyo field es "new".
  if (
    callee.kind === "fieldAccess" &&
    callee.field === "new" &&
    callee.target.kind === "member" &&
    callee.target.object === "chart" &&
    callee.target.property === "point"
  ) {
    const argValues = e.args.map((a) => evalExprT(ctx, a.value));
    return chartPointNew(argValues, e);
  }

  // Método sobre un array o un handle de dibujo: `arr.push(x)`, `l.set_xy1(...)`,
  // `b.delete()`. El callee es un fieldAccess cuyo target evalúa al receptor.
  if (callee.kind === "fieldAccess") {
    const target = evalExprT(ctx, callee.target);
    if (target instanceof PineArray) {
      const argValues = e.args.map((a) => evalExprT(ctx, a.value));
      return callArrayMethod(target, callee.field, argValues, e);
    }
    if (target instanceof PineLabel || target instanceof PineLine || target instanceof PineBox) {
      const argValues = e.args.map((a) => evalExprT(ctx, a.value));
      return callDrawMethod(target, callee.field, argValues, e);
    }
    if (target === null) {
      throw new PineRuntimeError(
        `No se puede llamar a '.${callee.field}()' sobre un objeto na`,
        e,
      );
    }
    throw new PineRuntimeError(
      `'.${callee.field}()' no está soportado (los métodos de objeto llegan en una fase posterior)`,
      e,
    );
  }

  // input.*()/input(): NO evalúa los args (son constantes ya extraídas por
  // analyze; además el defval de input.source es un identificador, no un valor).
  if (
    (callee.kind === "ident" && callee.name === "input") ||
    (callee.kind === "member" && callee.object === "input")
  ) {
    return resolveInput(ctx, e);
  }

  // Funciones de usuario: se evalúan los args y se ejecuta el cuerpo en un scope
  // local propio. El call-site se usa para que el estado ta.* interno sea único
  // por sitio de invocación.
  if (callee.kind === "ident" && ctx.functions.has(callee.name)) {
    return callUserFunction(ctx, e, callee.name);
  }

  // request.security(symbol, timeframe, expr, lookahead?, gaps?): el 3er arg (expr)
  // NO se evalúa como escalar (puede ser una serie builtin o una tupla); el módulo
  // security lo interpreta. Aquí solo resolvemos timeframe y lookahead a escalares.
  if (callee.kind === "member" && callee.object === "request" && callee.property === "security") {
    const tfExpr = timeframeArgExpr(e);
    if (!tfExpr) throw new PineRuntimeError("request.security requiere un timeframe", e);
    const tfValue = evalExpr(ctx, tfExpr);
    const lookaheadExpr = lookaheadArgExpr(e);
    const lookaheadOn = lookaheadExpr
      ? evalExpr(ctx, lookaheadExpr) === BARMERGE_LOOKAHEAD_ON
      : false;
    return evalRequestSecurity(ctx, e, typeof tfValue === "string" ? tfValue : "", lookaheadOn);
  }

  // timeframe.in_seconds(tf?) / timeframe.change(tf): builtins temporales con args.
  if (callee.kind === "member" && callee.object === "timeframe") {
    return evalTimeframeCall(ctx, e, callee.property);
  }

  // Namespace `array.*`: constructores (new/new_float/…) y forma funcional
  // `array.metodo(arr, args)`. Los args se evalúan tuple-/array-/objeto-capable.
  if (callee.kind === "member" && callee.object === "array") {
    const argValues = e.args.map((a) => evalExprT(ctx, a.value));
    if (callee.property.startsWith("new")) {
      return arrayNewFromGeneric(callee.property, argValues, e);
    }
    // Forma funcional: el primer argumento es el array, el resto los parámetros.
    if (argValues.length === 0) {
      throw new PineRuntimeError(`'array.${callee.property}()' requiere el array como primer argumento`, e);
    }
    const arr = argValues[0];
    if (!(arr instanceof PineArray)) {
      throw new PineRuntimeError(
        `El primer argumento de 'array.${callee.property}()' debe ser un array`,
        e,
      );
    }
    return callArrayMethod(arr, callee.property, argValues.slice(1), e);
  }

  // Namespace de dibujos: `label.new(...)`, `line.new(...)`, `box.new(...)` y forma
  // funcional de mutadores `line.set_xy1(l, ...)`, `label.delete(lbl)`, …
  if (
    callee.kind === "member" &&
    (callee.object === "label" || callee.object === "line" || callee.object === "box")
  ) {
    const ns = callee.object;
    const evaluatedArgs = e.args.map((a) => ({ name: a.name, value: evalExprT(ctx, a.value) }));
    if (callee.property === "new") {
      if (ns === "label") return labelNew(ctx.drawings, evaluatedArgs, e);
      if (ns === "line") return lineNew(ctx.drawings, evaluatedArgs, e);
      return boxNew(ctx.drawings, evaluatedArgs, e);
    }
    // Forma funcional: el primer argumento es el handle, el resto los parámetros.
    if (evaluatedArgs.length === 0) {
      throw new PineRuntimeError(`'${ns}.${callee.property}()' requiere el handle como primer argumento`, e);
    }
    const handle = evaluatedArgs[0].value;
    if (handle === null) {
      throw new PineRuntimeError(`'${ns}.${callee.property}()' recibió un handle na`, e);
    }
    if (!(handle instanceof PineLabel || handle instanceof PineLine || handle instanceof PineBox)) {
      throw new PineRuntimeError(
        `El primer argumento de '${ns}.${callee.property}()' debe ser un ${ns}`,
        e,
      );
    }
    return callDrawMethod(handle, callee.property, evaluatedArgs.slice(1).map((a) => a.value), e);
  }

  const evaluated = evalArgs(ctx, e.args);

  if (callee.kind === "ident") {
    switch (callee.name) {
      case "plot": {
        const mapped = mapArgs(e, evaluated, PLOT_PARAMS, 1);
        const v = mapped[0];
        const c = mapped[2];
        ctx.recordPlot(
          e.callSiteId,
          typeof v === "number" && Number.isFinite(v) ? v : null,
          typeof c === "string" ? c : null,
        );
        return null;
      }
      case "indicator":
        mapArgs(e, evaluated, INDICATOR_PARAMS, 0);
        return null;
      case "hline":
        // Estática: analyze ya extrajo el HLineSpec; en runtime es un no-op.
        mapArgs(e, evaluated, HLINE_PARAMS, 1);
        return null;
      case "plotshape": {
        const mapped = mapArgs(e, evaluated, PLOTSHAPE_PARAMS, 1);
        const c = mapped[4];
        ctx.recordShape(e.callSiteId, toBool(mapped[0] ?? null), typeof c === "string" ? c : null);
        return null;
      }
      case "plotchar": {
        const mapped = mapArgs(e, evaluated, PLOTCHAR_PARAMS, 1);
        const c = mapped[4];
        ctx.recordShape(e.callSiteId, toBool(mapped[0] ?? null), typeof c === "string" ? c : null);
        return null;
      }
      case "plotcandle": {
        const mapped = mapArgs(e, evaluated, PLOTCANDLE_PARAMS, 4);
        const numOrNull = (v: PineValue | undefined): number | null =>
          typeof v === "number" && Number.isFinite(v) ? v : null;
        const strOrU = (v: PineValue | undefined): string | undefined =>
          typeof v === "string" ? v : undefined;
        const open = numOrNull(mapped[0]);
        // na en open (p.ej. plotcandle(na, high, low, close)) → cuerpo omitido (whitespace).
        if (open === null) return null;
        ctx.recordCandle(e.callSiteId, {
          open,
          high: numOrNull(mapped[1]),
          low: numOrNull(mapped[2]),
          close: numOrNull(mapped[3]),
          color: strOrU(mapped[5]),
          wickColor: strOrU(mapped[6]),
          borderColor: strOrU(mapped[9]),
        });
        return null;
      }
      case "color": {
        // color(x): con na → null (sin color/transparente); con un color → passthrough.
        const mapped = mapArgs(e, evaluated, ["x"], 1);
        const v = mapped[0];
        return typeof v === "string" ? v : null;
      }
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
      case "fixnan": {
        // Arrastra el último valor no-na (na hasta que aparezca el primero).
        const mapped = mapArgs(e, evaluated, ["source"], 1);
        const v = mapped[0];
        const st = ctx.getState<{ last: PineValue }>(e.callSiteId, () => ({ last: null }));
        if (v !== null && v !== undefined) st.last = v;
        return st.last;
      }
      case "alertcondition": {
        // No-op: registra la condición (no dispara nada en el motor). NO debe lanzar.
        // Firma: alertcondition(condition, title, message). Se evalúan los args (por
        // si tienen efectos de serie ta.*) pero el resultado se descarta.
        mapArgs(e, evaluated, ["condition", "title", "message"], 1);
        return null;
      }
      default:
        throw new PineRuntimeError(`Función '${callee.name}' desconocida`, e);
    }
  }

  if (callee.object === "str") {
    return evalStrCall(callee.property, evaluated, e);
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
  if (callee.object === "color") {
    if (callee.property === "new") {
      const mapped = mapArgs(e, evaluated, ["color", "transp"], 2);
      return colorNew(mapped[0], mapped[1], e);
    }
    if (callee.property === "rgb") {
      const mapped = mapArgs(e, evaluated, ["red", "green", "blue", "transp"], 3);
      return colorRgb(mapped, e);
    }
    throw new PineRuntimeError(`'color.${callee.property}()' aún no está soportado`, e);
  }
  throw new PineRuntimeError(`Función '${callee.object}.${callee.property}' desconocida`, e);
}

/** Convierte un PineValue a su representación de texto (estilo Pine str.tostring). */
function pineToString(v: PineValue): string {
  if (v === null) return "NaN";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "NaN";
    // Enteros sin decimales; el resto con hasta ~10 cifras significativas sin ceros sobrantes.
    if (Number.isInteger(v)) return String(v);
    return String(Number(v.toFixed(10)));
  }
  return v;
}

/**
 * str.* — subset usado por el SMC:
 * - str.format(fmt, ...args): sustituye {0},{1},… por los args (números formateados).
 * - str.tostring(x[, fmt]): x a texto.
 * - str.length/contains/replace_all/upper/lower/split como extras razonables.
 */
function evalStrCall(prop: string, evaluated: EvaluatedArg[], e: CallExpr): PineValue {
  const vals = evaluated.map((a) => a.value);
  switch (prop) {
    case "format": {
      const fmt = vals[0];
      if (typeof fmt !== "string") {
        throw new PineRuntimeError("str.format() requiere una cadena de formato", e);
      }
      const args = vals.slice(1);
      return fmt.replace(/\{(\d+)(?::[^}]*)?\}/g, (_m, idx: string) => {
        const i = Number(idx);
        return i >= 0 && i < args.length ? pineToString(args[i]) : "";
      });
    }
    case "tostring":
      return pineToString(vals[0] ?? null);
    case "tonumber": {
      const v = vals[0];
      if (typeof v === "number") return v;
      if (typeof v === "string") {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    }
    case "length":
      return typeof vals[0] === "string" ? vals[0].length : 0;
    case "upper":
      return typeof vals[0] === "string" ? vals[0].toUpperCase() : "";
    case "lower":
      return typeof vals[0] === "string" ? vals[0].toLowerCase() : "";
    case "contains":
      return typeof vals[0] === "string" && typeof vals[1] === "string"
        ? vals[0].includes(vals[1])
        : false;
    case "replace_all":
      return typeof vals[0] === "string" && typeof vals[1] === "string" && typeof vals[2] === "string"
        ? vals[0].split(vals[1]).join(vals[2])
        : typeof vals[0] === "string"
          ? vals[0]
          : "";
    default:
      throw new PineRuntimeError(`'str.${prop}()' aún no está soportado`, e);
  }
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/** transp 0-100 → alpha 255-0 → byte hex. */
function transpToAlphaHex(transp: PineValue | undefined): string {
  const t = typeof transp === "number" && Number.isFinite(transp) ? transp : 0;
  const alpha = clamp255(255 * (1 - Math.max(0, Math.min(100, t)) / 100));
  return alpha.toString(16).padStart(2, "0").toUpperCase();
}

/** color.new(color, transp): aplica transparencia → #rrggbbaa. */
function colorNew(base: PineValue | undefined, transp: PineValue | undefined, pos: SourcePos): string {
  if (typeof base !== "string" || !/^#[0-9a-fA-F]{6,8}$/.test(base)) {
    throw new PineRuntimeError("color.new() requiere un color válido", pos);
  }
  const rgb = base.slice(1, 7).toUpperCase();
  return "#" + rgb + transpToAlphaHex(transp);
}

/** color.rgb(r, g, b, transp?): construye #rrggbb[aa]. */
function colorRgb(mapped: (PineValue | undefined)[], pos: SourcePos): string {
  const r = mapped[0];
  const g = mapped[1];
  const b = mapped[2];
  if (typeof r !== "number" || typeof g !== "number" || typeof b !== "number") {
    throw new PineRuntimeError("color.rgb() requiere componentes numéricos", pos);
  }
  const hex =
    "#" +
    clamp255(r).toString(16).padStart(2, "0") +
    clamp255(g).toString(16).padStart(2, "0") +
    clamp255(b).toString(16).padStart(2, "0");
  const out = hex.toUpperCase();
  return mapped[3] === undefined ? out : out + transpToAlphaHex(mapped[3]);
}

/**
 * Construye una instancia de UDT con `Type.new(args)`. Los argumentos posicionales
 * y nombrados se mapean a los campos en orden de declaración. Los campos no provistos
 * usan su default (evaluado en la barra actual, en cada `.new()`) o `na` si no tiene.
 */
function constructObject(
  ctx: ExecutionContext,
  desc: TypeDescriptor,
  e: CallExpr,
): PineObject {
  const fieldNames = desc.fields.map((f) => f.name);
  // values-capable arg mapping (objetos como argumentos son válidos).
  const out: (EvalValue | undefined)[] = new Array(desc.fields.length).fill(undefined);
  const provided: boolean[] = new Array(desc.fields.length).fill(false);
  let positional = 0;
  let sawNamed = false;
  for (const a of e.args) {
    const value = evalExprT(ctx, a.value);
    if (a.name === null) {
      if (sawNamed) {
        throw new PineRuntimeError(
          "Los argumentos posicionales deben ir antes que los nombrados",
          a.value,
        );
      }
      if (positional >= desc.fields.length) {
        throw new PineRuntimeError(
          `Demasiados argumentos para ${desc.name}.new() (máximo ${desc.fields.length})`,
          a.value,
        );
      }
      provided[positional] = true;
      out[positional++] = value;
    } else {
      sawNamed = true;
      const idx = fieldNames.indexOf(a.name);
      if (idx < 0) {
        throw new PineRuntimeError(`El tipo '${desc.name}' no tiene el campo '${a.name}'`, a.value);
      }
      if (provided[idx]) {
        throw new PineRuntimeError(`Campo '${a.name}' repetido en ${desc.name}.new()`, a.value);
      }
      provided[idx] = true;
      out[idx] = value;
    }
  }
  const fields = new Map<string, EvalValue>();
  desc.fields.forEach((f, i) => {
    if (provided[i]) {
      fields.set(f.name, out[i] ?? null);
    } else if (f.default) {
      fields.set(f.name, evalExprT(ctx, f.default));
    } else {
      fields.set(f.name, null);
    }
  });
  return new PineObject(desc.name, fields);
}

/**
 * Invoca una función de usuario: evalúa los args en el scope actual, abre un
 * scope local con los parámetros enlazados y ejecuta el cuerpo. El valor es la
 * última expresión del cuerpo (puede ser una tupla `[a, b]`).
 */
function callUserFunction(ctx: ExecutionContext, e: CallExpr, name: string): EvalValue {
  const def = ctx.functions.get(name);
  if (!def) throw new PineRuntimeError(`Función '${name}' desconocida`, e);
  for (const a of e.args) {
    if (a.name !== null) {
      throw new PineRuntimeError("Las funciones de usuario no admiten argumentos nombrados", e);
    }
  }
  if (e.args.length > def.params.length) {
    throw new PineRuntimeError(
      `'${name}' espera ${def.params.length} argumento(s), recibió ${e.args.length}`,
      e,
    );
  }
  // Evaluar los args provistos en el scope del llamador antes de abrir el scope local.
  // evalExprT: una función de usuario puede recibir (y devolver) objetos.
  const argValues = e.args.map((a) => evalExprT(ctx, a.value));

  const scope = ctx.pushScope(String(e.callSiteId));
  try {
    def.params.forEach((p, i) => {
      // Parámetro como serie persistente: `p[1]` lee el valor pasado en la barra
      // anterior por este mismo sitio de invocación (semántica de series de Pine).
      // Si no se pasó (menos args que params), se usa el default del parámetro;
      // si tampoco tiene default → error.
      let value: EvalValue;
      if (i < argValues.length) {
        value = argValues[i];
      } else if (def.paramDefaults[i]) {
        value = evalExprT(ctx, def.paramDefaults[i]!);
      } else {
        throw new PineRuntimeError(
          `'${name}' requiere el argumento '${p}' (sin valor por defecto)`,
          e,
        );
      }
      const { slot } = ctx.persistentVarSlot(p, false);
      slot.series.set(ctx.barIndex, value);
      scope.set(p, slot);
    });
    return evalBlockValue(ctx, def.decl.body);
  } finally {
    ctx.popScope();
  }
}

/**
 * Resuelve un input.*() en runtime: override del usuario (por id) → defval.
 * Devuelve el mismo valor en todas las barras (salvo source, que lee la serie).
 */
function resolveInput(ctx: ExecutionContext, e: CallExpr): PineValue {
  const def = ctx.inputDef(e.callSiteId);
  if (!def) {
    throw new PineRuntimeError("input.* sin definición analizada (error interno)", e);
  }
  const override = ctx.inputs[def.id];
  const raw = override !== undefined ? override : def.defval;
  switch (def.type) {
    case "int":
    case "float": {
      let n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n)) n = Number(def.defval);
      if (def.type === "int") n = Math.round(n);
      if (def.minval !== undefined && n < def.minval) n = def.minval;
      if (def.maxval !== undefined && n > def.maxval) n = def.maxval;
      return n;
    }
    case "bool":
      return raw === true || raw === "true" || raw === 1;
    case "string":
    case "color":
      return String(raw);
    case "source": {
      const name = String(raw);
      const src = SOURCE_NAMES.has(name) ? name : String(def.defval);
      return builtinSeriesValue(ctx, src, ctx.barIndex);
    }
  }
}

function evalHistT(ctx: ExecutionContext, e: HistAccess): EvalValue {
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
    const slot = ctx.lookupVar(name);
    if (slot) return n === null ? null : slot.series.get(ctx.barIndex, n);
    throw new PineRuntimeError(`Variable '${name}' no definida`, e.base);
  }

  // Base arbitraria: se evalúa SIEMPRE (también con offset na) para poblar la
  // serie oculta barra a barra, y luego se lee con el offset.
  const hidden = ctx.getHiddenSeries(e.nodeId);
  hidden.set(ctx.barIndex, evalExprT(ctx, e.base));
  return n === null ? null : hidden.get(ctx.barIndex, n);
}

function builtinSeriesValue(ctx: ExecutionContext, name: string, index: number): PineValue {
  // last_bar_*: tiempo/índice de la ÚLTIMA vela del dataset (independiente de `index`).
  if (name === "last_bar_time") {
    const last = ctx.candles[ctx.candles.length - 1];
    return last ? last.time * 1000 : null;
  }
  if (name === "last_bar_index") {
    return ctx.candles.length - 1;
  }
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
