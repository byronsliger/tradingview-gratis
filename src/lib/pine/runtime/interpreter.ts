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
import type { InputDef, PineValue, RunOptions } from "../types";
import {
  COLOR_CONSTANTS,
  HLINE_PARAMS,
  INDICATOR_PARAMS,
  NAMESPACE_CONSTANTS,
  PLOTCHAR_PARAMS,
  PLOTSHAPE_PARAMS,
  PLOT_PARAMS,
  SERIES_BUILTINS,
  SOURCE_NAMES,
} from "./builtins-core";
import { mathBuiltins } from "./builtins-math";
import { taBuiltins } from "./builtins-ta";
import { ExecutionContext } from "./context";
import { PineObject, type FieldDef, type TypeDescriptor } from "./objects";
import { Series } from "./series";
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
): ExecutionContext {
  const ctx = new ExecutionContext(candles, inputs, options, inputDefs);
  // Registrar funciones de usuario y tipos (UDTs) antes de ejecutar barras (hoisting).
  for (const stmt of program.statements) {
    if (stmt.kind === "funcDecl") {
      ctx.functions.set(stmt.name, { params: stmt.params, decl: stmt });
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
    case "break":
      throw new LoopSignal("break");
    case "continue":
      throw new LoopSignal("continue");
    case "funcDecl":
      // Ya registrada en runProgram (hoisting); no-op por barra.
      return;
    case "exprStmt":
      evalExpr(ctx, stmt.expr);
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
      const cond = toBool(evalExpr(ctx, e.cond));
      // Ambas ramas se evalúan siempre (semántica de series de Pine).
      const whenTrue = evalExpr(ctx, e.whenTrue);
      const whenFalse = evalExpr(ctx, e.whenFalse);
      return cond ? whenTrue : whenFalse;
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

  if (callee.kind === "fieldAccess") {
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
  if (e.args.length !== def.params.length) {
    throw new PineRuntimeError(
      `'${name}' espera ${def.params.length} argumento(s), recibió ${e.args.length}`,
      e,
    );
  }
  // Evaluar args en el scope del llamador antes de abrir el scope local.
  // evalExprT: una función de usuario puede recibir (y devolver) objetos.
  const argValues = e.args.map((a) => evalExprT(ctx, a.value));

  const scope = ctx.pushScope(String(e.callSiteId));
  try {
    def.params.forEach((p, i) => {
      // Parámetro como serie persistente: `p[1]` lee el valor pasado en la barra
      // anterior por este mismo sitio de invocación (semántica de series de Pine).
      const { slot } = ctx.persistentVarSlot(p, false);
      slot.series.set(ctx.barIndex, argValues[i]);
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
