import type { CallExpr, Expr, Program, Stmt } from "./ast";
import type { SourcePos } from "./errors";
import { parseTimeframe } from "./runtime/timeframe";
import {
  COLOR_CONSTANTS,
  DEFAULT_PLOT_COLOR,
  HLINE_PARAMS,
  INDICATOR_PARAMS,
  INPUT_PARAMS,
  LABEL_SIZE_NAMES,
  NAMESPACE_CONSTANTS,
  SIZE_CONSTANTS,
  PLOTCANDLE_PARAMS,
  PLOTCHAR_PARAMS,
  PLOTSHAPE_PARAMS,
  PLOT_PARAMS,
  PLOT_STYLE_CONSTANTS,
  SHAPE_CONSTANTS,
  SOURCE_NAMES,
} from "./runtime/builtins-core";
import type {
  CandleSpec,
  Diagnostic,
  DrawingLimitsSpec,
  HLineSpec,
  IndicatorMeta,
  InputDef,
  InputType,
  PlotSpec,
  PlotStyle,
  ShapeSpec,
} from "./types";

/** Resultado del pase estático sobre el AST (sin ejecutar el script). */
export interface Analysis {
  meta: IndicatorMeta;
  plots: PlotSpec[];
  inputs: InputDef[];
  hlines: HLineSpec[];
  shapes: ShapeSpec[];
  candleSpecs: CandleSpec[];
  limits: DrawingLimitsSpec;
  /** Timeframes pedidos vía request.security (literales o input con default literal). */
  requestedTimeframes: string[];
  warnings: Diagnostic[];
  errors: Diagnostic[];
}

const TOP_OF_FILE: SourcePos = { line: 1, col: 1, start: 0, end: 0 };

const INPUT_TYPES = new Set(["int", "float", "bool", "string", "color", "source", "timeframe"]);
const HLINE_DEFAULT_COLOR = "#787B86";

/**
 * Extrae estáticamente la meta de indicator(), los PlotSpec de cada plot(),
 * los InputDef de input.*, las hline() y los ShapeSpec de plotshape/plotchar.
 * Los errores (defval/price no constantes, etc.) hacen fallar la compilación.
 */
export function analyze(program: Program): Analysis {
  const warnings: Diagnostic[] = [];
  const errors: Diagnostic[] = [];
  const diag = (list: Diagnostic[], pos: SourcePos, message: string, severity: Diagnostic["severity"]): void => {
    list.push({ severity, message, line: pos.line, col: pos.col, start: pos.start, end: pos.end });
  };
  const warn = (pos: SourcePos, message: string): void => diag(warnings, pos, message, "warning");
  const error = (pos: SourcePos, message: string): void => diag(errors, pos, message, "error");

  const constEnv = collectTopLevelConsts(program);
  const calls = collectCalls(program);
  const indicatorCalls = calls.filter((c) => isBareCall(c, "indicator"));
  const plotCalls = calls.filter((c) => isBareCall(c, "plot"));
  const hlineCalls = calls.filter((c) => isBareCall(c, "hline"));
  const shapeCalls = calls.filter((c) => isBareCall(c, "plotshape") || isBareCall(c, "plotchar"));
  const candleCalls = calls.filter((c) => isBareCall(c, "plotcandle"));
  const inputCalls = calls.filter(
    (c) =>
      isBareCall(c, "input") ||
      (c.callee.kind === "member" && c.callee.object === "input"),
  );

  const meta: IndicatorMeta = { title: "Indicator", overlay: false };
  const limits: DrawingLimitsSpec = { maxLabels: 50, maxLines: 50, maxBoxes: 50 };
  if (indicatorCalls.length === 0) {
    warn(TOP_OF_FILE, "El script no declara indicator(); se usa título y overlay por defecto");
  } else {
    if (indicatorCalls.length > 1) {
      warn(indicatorCalls[1], "indicator() declarado más de una vez; se usa el primero");
    }
    const ind = indicatorCalls[0];
    const titleExpr = argExpr(ind, INDICATOR_PARAMS, "title");
    if (titleExpr) {
      const title = literalOf(titleExpr, constEnv);
      if (typeof title === "string") meta.title = title;
      else warn(titleExpr, "El título de indicator() debe ser una cadena literal");
    }
    const shortExpr = argExpr(ind, INDICATOR_PARAMS, "shorttitle");
    if (shortExpr) {
      const short = literalOf(shortExpr, constEnv);
      if (typeof short === "string") meta.shorttitle = short;
    }
    const overlayExpr = argExpr(ind, INDICATOR_PARAMS, "overlay");
    if (overlayExpr) {
      const overlay = literalOf(overlayExpr, constEnv);
      if (typeof overlay === "boolean") meta.overlay = overlay;
      else warn(overlayExpr, "overlay debe ser true o false literal");
    }
    const limitArg = (name: string): number | undefined => {
      const expr = argExpr(ind, INDICATOR_PARAMS, name);
      if (!expr) return undefined;
      const lit = literalOf(expr, constEnv);
      if (typeof lit === "number" && Number.isFinite(lit) && lit >= 0) return Math.round(lit);
      warn(expr, `'${name}' de indicator() debe ser un número literal; se usa 50`);
      return undefined;
    };
    limits.maxLabels = limitArg("max_labels_count") ?? 50;
    limits.maxLines = limitArg("max_lines_count") ?? 50;
    limits.maxBoxes = limitArg("max_boxes_count") ?? 50;
  }

  // ---- inputs ------------------------------------------------------------
  const inputs: InputDef[] = [];
  const usedIds = new Set<string>();
  inputCalls.forEach((call, i) => {
    const def = analyzeInput(call, i + 1, usedIds, { warn, error }, constEnv);
    if (def) {
      inputs.push(def);
      usedIds.add(def.id);
    }
  });

  // ---- plots --------------------------------------------------------------
  const plots: PlotSpec[] = plotCalls.map((call, i) => {
    const titleExpr = argExpr(call, PLOT_PARAMS, "title");
    const titleLit = titleExpr ? literalOf(titleExpr, constEnv) : undefined;
    const colorExpr = argExpr(call, PLOT_PARAMS, "color");
    const colorLit = colorExpr ? literalOf(colorExpr, constEnv) : undefined;
    let style: PlotStyle = "line";
    const styleExpr = argExpr(call, PLOT_PARAMS, "style");
    if (styleExpr) {
      const styleLit = literalOf(styleExpr, constEnv);
      if (typeof styleLit === "string" && isPlotStyle(styleLit)) style = styleLit;
      else warn(styleExpr, "style de plot() no reconocido; se usa plot.style_line");
    }
    let linewidth = 1;
    const lwExpr = argExpr(call, PLOT_PARAMS, "linewidth");
    if (lwExpr) {
      const lw = literalOf(lwExpr, constEnv);
      if (typeof lw === "number" && Number.isFinite(lw)) linewidth = Math.max(1, Math.min(4, Math.round(lw)));
      else warn(lwExpr, "linewidth debe ser un número literal; se usa 1");
    }
    return {
      id: call.callSiteId,
      title: typeof titleLit === "string" ? titleLit : `Plot ${i + 1}`,
      color: typeof colorLit === "string" ? colorLit : DEFAULT_PLOT_COLOR,
      style,
      linewidth,
    };
  });

  // ---- hlines -------------------------------------------------------------
  const hlines: HLineSpec[] = [];
  for (const call of hlineCalls) {
    const priceExpr = argExpr(call, HLINE_PARAMS, "price");
    const price = priceExpr ? literalOf(priceExpr, constEnv) : undefined;
    if (typeof price !== "number" || !Number.isFinite(price)) {
      error(
        priceExpr ?? call,
        "El precio de hline() debe ser una constante numérica (literal)",
      );
      continue;
    }
    const titleExpr = argExpr(call, HLINE_PARAMS, "title");
    const titleLit = titleExpr ? literalOf(titleExpr, constEnv) : undefined;
    const colorExpr = argExpr(call, HLINE_PARAMS, "color");
    const colorLit = colorExpr ? literalOf(colorExpr, constEnv) : undefined;
    const styleExpr = argExpr(call, HLINE_PARAMS, "linestyle");
    const styleLit = styleExpr ? literalOf(styleExpr, constEnv) : undefined;
    const lwExpr = argExpr(call, HLINE_PARAMS, "linewidth");
    const lwLit = lwExpr ? literalOf(lwExpr, constEnv) : undefined;
    hlines.push({
      id: call.callSiteId,
      price,
      title: typeof titleLit === "string" ? titleLit : undefined,
      color: typeof colorLit === "string" ? colorLit : HLINE_DEFAULT_COLOR,
      linestyle: typeof styleLit === "number" ? Math.max(0, Math.min(4, Math.round(styleLit))) : 0,
      linewidth: typeof lwLit === "number" ? Math.max(1, Math.min(4, Math.round(lwLit))) : 1,
    });
  }

  // ---- shapes (plotshape / plotchar) --------------------------------------
  const shapes: ShapeSpec[] = shapeCalls.map((call, i) => {
    const isChar = isBareCall(call, "plotchar");
    const params = isChar ? PLOTCHAR_PARAMS : PLOTSHAPE_PARAMS;
    const titleExpr = argExpr(call, params, "title");
    const titleLit = titleExpr ? literalOf(titleExpr, constEnv) : undefined;

    let style = isChar ? "char" : "xcross";
    if (!isChar) {
      const styleExpr = argExpr(call, params, "style");
      if (styleExpr) {
        const s = literalOf(styleExpr, constEnv);
        if (typeof s === "string" && SHAPE_CONSTANTS[s] !== undefined) style = s;
        else warn(styleExpr, "style de plotshape() no reconocido; se usa shape.xcross");
      }
    }

    let location: ShapeSpec["location"] = "abovebar";
    const locExpr = argExpr(call, params, "location");
    if (locExpr) {
      const l = literalOf(locExpr, constEnv);
      if (l === "abovebar" || l === "belowbar" || l === "absolute" || l === "top" || l === "bottom") {
        location = l;
        if (l === "absolute") {
          warn(locExpr, "location.absolute se dibuja como aboveBar (limitación del motor)");
        }
      } else {
        warn(locExpr, "location de plotshape/plotchar no reconocida; se usa location.abovebar");
      }
    }

    const colorExpr = argExpr(call, params, "color");
    const colorLit = colorExpr ? literalOf(colorExpr, constEnv) : undefined;
    const textExpr = argExpr(call, params, "text");
    const textLit = textExpr ? literalOf(textExpr, constEnv) : undefined;
    let size = 1;
    const sizeExpr = argExpr(call, params, "size");
    if (sizeExpr) {
      const s = literalOf(sizeExpr, constEnv);
      // size.* ahora resuelve a nombre simbólico ('tiny'…); lo remapeamos a su factor.
      if (typeof s === "string" && SIZE_CONSTANTS[s] !== undefined) size = SIZE_CONSTANTS[s];
      else if (typeof s === "number" && Number.isFinite(s)) size = s;
      else warn(sizeExpr, "size de plotshape/plotchar no reconocido; se usa size.auto");
    }
    let char: string | undefined;
    if (isChar) {
      const charExpr = argExpr(call, params, "char");
      const c = charExpr ? literalOf(charExpr, constEnv) : undefined;
      char = typeof c === "string" && c.length > 0 ? c : "★";
    }

    return {
      id: call.callSiteId,
      title: typeof titleLit === "string" ? titleLit : `Shape ${i + 1}`,
      style,
      location,
      color: typeof colorLit === "string" ? colorLit : COLOR_CONSTANTS.blue,
      text: typeof textLit === "string" ? textLit : undefined,
      char,
      size,
    };
  });

  // ---- plotcandle ---------------------------------------------------------
  const candleSpecs: CandleSpec[] = candleCalls.map((call, i) => {
    const titleExpr = argExpr(call, PLOTCANDLE_PARAMS, "title");
    const titleLit = titleExpr ? literalOf(titleExpr, constEnv) : undefined;
    return {
      id: call.callSiteId,
      title: typeof titleLit === "string" ? titleLit : `Candle ${i + 1}`,
    };
  });

  // Las llamadas de dibujo (label/line/box.new) no se conocen estáticamente; basta
  // con que exista alguna para no avisar "no dibuja nada".
  const hasDrawingCall = calls.some(
    (c) =>
      c.callee.kind === "member" &&
      (c.callee.object === "label" || c.callee.object === "line" || c.callee.object === "box") &&
      c.callee.property === "new",
  );
  if (
    plots.length === 0 &&
    shapes.length === 0 &&
    hlines.length === 0 &&
    candleSpecs.length === 0 &&
    !hasDrawingCall
  ) {
    warn(TOP_OF_FILE, "El script no tiene ningún plot(): no dibujará nada");
  }

  // ---- requestedTimeframes (request.security) -----------------------------
  const requestedTimeframes = collectRequestedTimeframes(program, calls, constEnv);

  return {
    meta,
    plots,
    inputs,
    hlines,
    shapes,
    candleSpecs,
    limits,
    requestedTimeframes,
    warnings,
    errors,
  };
}

/**
 * Extrae los timeframes que el script pide vía request.security. Resuelve el 2º
 * argumento (timeframe) si es: (a) un string literal, o (b) una variable ligada a
 * un input.timeframe/input.string/input() con default string literal. Los tf
 * dinámicos (no resolubles) se omiten (la app no puede prefetchearlos).
 *
 * NOTA: drawLevels()/inputs cuyo timeframe acaba en una de esas variables ya quedan
 * cubiertos: el alias variable→default se resuelve aquí. El '' (timeframe del chart)
 * se descarta.
 */
function collectRequestedTimeframes(
  program: Program,
  calls: CallExpr[],
  constEnv: Map<string, number | string | boolean>,
): string[] {
  // Mapa de variable → string default, para variables ligadas a input.timeframe/
  // input.string/input() cuyo defval sea un literal string.
  const varDefaults = new Map<string, string>();
  for (const stmt of program.statements) {
    if (stmt.kind !== "varDecl") continue;
    if (stmt.init.kind !== "call") continue;
    const callee = stmt.init.callee;
    const isInput =
      (callee.kind === "ident" && callee.name === "input") ||
      (callee.kind === "member" && callee.object === "input");
    if (!isInput) continue;
    const params =
      callee.kind === "member" ? INPUT_PARAMS[callee.property] : INPUT_PARAMS.generic;
    if (!params) continue;
    const defvalExpr = argExpr(stmt.init, params, "defval");
    const lit = defvalExpr ? literalOf(defvalExpr, constEnv) : undefined;
    if (typeof lit === "string") varDefaults.set(stmt.name, lit);
  }

  const out = new Set<string>();
  const securityCalls = calls.filter(
    (c) => c.callee.kind === "member" && c.callee.object === "request" && c.callee.property === "security",
  );
  for (const call of securityCalls) {
    const tfExpr = securityTimeframeArg(call);
    if (!tfExpr) continue;
    // (a) literal string directo.
    const lit = literalOf(tfExpr, constEnv);
    if (typeof lit === "string") {
      if (lit.trim() !== "") out.add(lit);
      continue;
    }
    // (b) variable ligada a un input con default string.
    if (tfExpr.kind === "ident") {
      const def = varDefaults.get(tfExpr.name);
      if (def !== undefined && def.trim() !== "") out.add(def);
    }
    // Cualquier otra forma: dinámica/no resoluble → se omite (no se puede prefetch).
  }

  // (c) Heurística: cualquier literal string del programa que sea un timeframe
  // válido ('D','W','M','60','240'…). Captura el caso de request.security con el
  // timeframe pasado como PARÁMETRO de función (p.ej. drawLevels('W', …) en el
  // SMC), que el análisis estático no puede rastrear hasta el request.security.
  // parseTimeframe rechaza los demás strings ('All','BOS','Colored'…), así que
  // el riesgo de prefetch espurio es mínimo.
  forEachStringLiteral(program, (s) => {
    if (s.trim() !== "" && parseTimeframe(s) !== null) out.add(s);
  });

  return [...out];
}

/** Visita el valor de cada literal string del programa (statements + expresiones). */
function forEachStringLiteral(program: Program, cb: (value: string) => void): void {
  const visitExpr = (e: Expr): void => {
    switch (e.kind) {
      case "string":
        cb(e.value);
        return;
      case "call":
        for (const a of e.args) visitExpr(a.value);
        return;
      case "array":
        for (const el of e.elements) visitExpr(el);
        return;
      case "unary":
        visitExpr(e.operand);
        return;
      case "binary":
        visitExpr(e.left);
        visitExpr(e.right);
        return;
      case "ternary":
        visitExpr(e.cond);
        visitExpr(e.whenTrue);
        visitExpr(e.whenFalse);
        return;
      case "hist":
        visitExpr(e.base);
        visitExpr(e.offset);
        return;
      case "ifExpr":
        for (const b of e.branches) {
          if (b.cond) visitExpr(b.cond);
          visitStmts(b.body);
        }
        return;
      case "switchExpr":
        if (e.subject) visitExpr(e.subject);
        for (const c of e.cases) {
          if (c.match) visitExpr(c.match);
          visitStmts(c.body);
        }
        return;
      case "fieldAccess":
        visitExpr(e.target);
        return;
      default:
        return;
    }
  };
  const visitStmts = (stmts: Stmt[]): void => {
    for (const stmt of stmts) {
      switch (stmt.kind) {
        case "varDecl":
        case "tupleDecl":
          visitExpr(stmt.init);
          break;
        case "assign":
          visitExpr(stmt.value);
          break;
        case "fieldAssign":
          visitExpr(stmt.value);
          break;
        case "exprStmt":
          visitExpr(stmt.expr);
          break;
        case "ifStmt":
          visitExpr(stmt.cond);
          visitStmts(stmt.then);
          if (stmt.elseBranch) visitStmts(stmt.elseBranch);
          break;
        case "forStmt":
          visitExpr(stmt.from);
          visitExpr(stmt.to);
          if (stmt.step) visitExpr(stmt.step);
          visitStmts(stmt.body);
          break;
        case "forInStmt":
          visitExpr(stmt.iterable);
          visitStmts(stmt.body);
          break;
        case "funcDecl":
          visitStmts(stmt.body);
          break;
        default:
          break;
      }
    }
  };
  visitStmts(program.statements);
}

/** 2º argumento (timeframe) de request.security, sea posicional o nombrado. */
function securityTimeframeArg(call: CallExpr): Expr | undefined {
  let positional = 0;
  for (const arg of call.args) {
    if (arg.name === "timeframe") return arg.value;
    if (arg.name === null) {
      if (positional === 1) return arg.value;
      positional++;
    }
  }
  return undefined;
}

interface Reporter {
  warn: (pos: SourcePos, message: string) => void;
  error: (pos: SourcePos, message: string) => void;
}

/** Extrae un InputDef de una llamada input.*()/input(); null si hay error fatal. */
function analyzeInput(
  call: CallExpr,
  ordinal: number,
  usedIds: Set<string>,
  { warn, error }: Reporter,
  constEnv: Map<string, number | string | boolean>,
): InputDef | null {
  let typeName: string;
  if (call.callee.kind === "member") {
    typeName = call.callee.property;
    if (!INPUT_TYPES.has(typeName)) {
      error(call, `'input.${typeName}()' no está soportado (usa int/float/bool/string/color/source)`);
      return null;
    }
  } else {
    typeName = "generic";
  }
  const params = INPUT_PARAMS[typeName];

  const defvalExpr = argExpr(call, params, "defval");
  if (!defvalExpr) {
    error(call, "input.* requiere un valor por defecto (defval)");
    return null;
  }

  // defval: para source es un identificador (close, hl2, …); para el resto un literal.
  // Un `input(NAME)` cuyo NAME es una constante de nivel superior (p.ej. `GREEN`,
  // `HISTORICAL`) NO es un source: se resuelve a su valor constante más abajo.
  const isSourceDefval =
    typeName === "source" ||
    (typeName === "generic" &&
      defvalExpr.kind === "ident" &&
      constEnv.get(defvalExpr.name) === undefined);
  let defval: number | string | boolean;
  let type: InputType;
  if (isSourceDefval) {
    if (defvalExpr.kind !== "ident" || !SOURCE_NAMES.has(defvalExpr.name)) {
      error(
        defvalExpr,
        "input.source solo admite open/high/low/close/volume/hl2/hlc3/ohlc4",
      );
      return null;
    }
    type = "source";
    defval = defvalExpr.name;
  } else {
    const lit = literalOf(defvalExpr, constEnv);
    if (lit === undefined) {
      error(defvalExpr, "El valor por defecto de input.* debe ser una constante");
      return null;
    }
    if (typeName === "generic") {
      type = inferInputType(defvalExpr, lit);
    } else if (typeName === "timeframe") {
      // input.timeframe se modela como un input.string (su valor es un tf-string).
      type = "string";
    } else {
      type = typeName as InputType;
    }
    // Validación de tipo del defval declarado
    if ((type === "int" || type === "float") && typeof lit !== "number") {
      error(defvalExpr, `El defval de input.${type} debe ser numérico`);
      return null;
    }
    if (type === "bool" && typeof lit !== "boolean") {
      error(defvalExpr, "El defval de input.bool debe ser true o false");
      return null;
    }
    if ((type === "string" || type === "color") && typeof lit !== "string") {
      error(defvalExpr, `El defval de input.${type} debe ser una cadena`);
      return null;
    }
    defval = type === "int" && typeof lit === "number" ? Math.round(lit) : lit;
  }

  const titleExpr = argExpr(call, params, "title");
  const titleLit = titleExpr ? literalOf(titleExpr, constEnv) : undefined;
  let title: string | undefined;
  if (titleExpr) {
    if (typeof titleLit === "string") title = titleLit;
    else warn(titleExpr, "El title de input.* debe ser una cadena literal; se ignora");
  }

  const numericArg = (name: string): number | undefined => {
    const expr = argExpr(call, params, name);
    if (!expr) return undefined;
    const lit = literalOf(expr, constEnv);
    if (typeof lit === "number" && Number.isFinite(lit)) return lit;
    warn(expr, `'${name}' de input.* debe ser un número literal; se ignora`);
    return undefined;
  };
  const minval = params.includes("minval") ? numericArg("minval") : undefined;
  const maxval = params.includes("maxval") ? numericArg("maxval") : undefined;
  const step = params.includes("step") ? numericArg("step") : undefined;

  let options: (string | number)[] | undefined;
  const optionsExpr = params.includes("options") ? argExpr(call, params, "options") : undefined;
  if (optionsExpr) {
    if (optionsExpr.kind !== "array") {
      error(optionsExpr, "options de input.* debe ser un array literal: options=[a, b, c]");
      return null;
    }
    options = [];
    for (const el of optionsExpr.elements) {
      const v = literalOf(el, constEnv);
      if (typeof v === "string" || typeof v === "number") options.push(v);
      else {
        error(el, "Cada opción de options debe ser un literal (número o cadena)");
        return null;
      }
    }
  }

  // id estable: title si existe y no colisiona; si no, posicional.
  let id = title && !usedIds.has(title) ? title : `input${ordinal}`;
  if (usedIds.has(id)) id = `input${ordinal}`;

  return { id, type, defval, title, minval, maxval, step, options, callSiteId: call.callSiteId };
}

function inferInputType(expr: Expr, lit: number | string | boolean): InputType {
  if (typeof lit === "boolean") return "bool";
  if (typeof lit === "number") return Number.isInteger(lit) ? "int" : "float";
  // string: color si el literal era #hex, una constante color.* o un valor #rrggbb[aa]
  // (p.ej. `input(GREEN)` con `GREEN = #F23645` resuelto vía constEnv).
  if (expr.kind === "color") return "color";
  if (expr.kind === "member" && expr.object === "color") return "color";
  if (typeof lit === "string" && /^#[0-9a-fA-F]{6,8}$/.test(lit)) return "color";
  return "string";
}

function isPlotStyle(v: string): v is PlotStyle {
  return Object.values(PLOT_STYLE_CONSTANTS).includes(v);
}

function isBareCall(call: CallExpr, name: string): boolean {
  return call.callee.kind === "ident" && call.callee.name === name;
}

/** Todas las CallExpr del programa, en orden de aparición en el fuente. */
function collectCalls(program: Program): CallExpr[] {
  const out: CallExpr[] = [];
  const visit = (e: Expr): void => {
    switch (e.kind) {
      case "call":
        out.push(e);
        for (const arg of e.args) visit(arg.value);
        return;
      case "array":
        for (const el of e.elements) visit(el);
        return;
      case "unary":
        visit(e.operand);
        return;
      case "binary":
        visit(e.left);
        visit(e.right);
        return;
      case "ternary":
        visit(e.cond);
        visit(e.whenTrue);
        visit(e.whenFalse);
        return;
      case "hist":
        visit(e.base);
        visit(e.offset);
        return;
      case "fieldAccess":
        visit(e.target);
        return;
      case "ifExpr":
        for (const b of e.branches) {
          if (b.cond) visit(b.cond);
          visitStmts(b.body);
        }
        return;
      case "switchExpr":
        if (e.subject) visit(e.subject);
        for (const c of e.cases) {
          if (c.match) visit(c.match);
          visitStmts(c.body);
        }
        return;
      default:
        return;
    }
  };
  const visitStmts = (stmts: Stmt[]): void => {
    for (const stmt of stmts) {
      switch (stmt.kind) {
        case "varDecl":
          visit(stmt.init);
          break;
        case "tupleDecl":
          visit(stmt.init);
          break;
        case "assign":
          visit(stmt.value);
          break;
        case "fieldAssign":
          visit(stmt.target);
          visit(stmt.value);
          break;
        case "exprStmt":
          visit(stmt.expr);
          break;
        case "ifStmt":
          visit(stmt.cond);
          visitStmts(stmt.then);
          if (stmt.elseBranch) visitStmts(stmt.elseBranch);
          break;
        case "forStmt":
          visit(stmt.from);
          visit(stmt.to);
          if (stmt.step) visit(stmt.step);
          visitStmts(stmt.body);
          break;
        case "forInStmt":
          visit(stmt.iterable);
          visitStmts(stmt.body);
          break;
        case "funcDecl":
          visitStmts(stmt.body);
          break;
        case "typeDecl":
          for (const f of stmt.fields) if (f.default) visit(f.default);
          break;
        case "break":
        case "continue":
          break;
      }
    }
  };
  visitStmts(program.statements);
  return out;
}

/**
 * Expr del argumento `name`, sea nombrado o posicional (según el orden de `params`).
 */
function argExpr(call: CallExpr, params: string[], name: string): Expr | undefined {
  const idx = params.indexOf(name);
  let positional = 0;
  for (const arg of call.args) {
    if (arg.name === name) return arg.value;
    if (arg.name === null) {
      if (positional === idx) return arg.value;
      positional++;
    }
  }
  return undefined;
}

/**
 * Valor de un literal estático; undefined si la expresión no es constante.
 * Resuelve: literales, constantes de namespace (color.*, plot.style_*, …), `-x`,
 * identificadores ligados a constantes de nivel superior (constEnv), y las llamadas
 * constantes `color.new(c, t)` / `color.rgb(r, g, b[, t])` (las usa input.color del SMC).
 */
function literalOf(
  expr: Expr,
  constEnv?: Map<string, number | string | boolean>,
): number | string | boolean | undefined {
  switch (expr.kind) {
    case "number":
    case "string":
    case "bool":
    case "color":
      return expr.value;
    case "unary": {
      if (expr.op !== "-") return undefined;
      const v = literalOf(expr.operand, constEnv);
      return typeof v === "number" ? -v : undefined;
    }
    case "member":
      // size.* es numérico en NAMESPACE_CONSTANTS (para plotshape), pero como valor
      // de input.string/label-size lo queremos como nombre simbólico ('tiny'…). El
      // único consumidor numérico (plotshape size) lo remapea con sizeNameToNumber().
      if (expr.object === "size") return LABEL_SIZE_NAMES[expr.property] ?? undefined;
      return NAMESPACE_CONSTANTS[expr.object]?.[expr.property];
    case "ident":
      return constEnv?.get(expr.name);
    case "call":
      return constColorCall(expr, constEnv);
    default:
      return undefined;
  }
}

/** Evalúa estáticamente `color.new(c, transp)` / `color.rgb(r,g,b[,t])` con args constantes. */
function constColorCall(
  call: CallExpr,
  constEnv?: Map<string, number | string | boolean>,
): string | undefined {
  if (call.callee.kind !== "member" || call.callee.object !== "color") return undefined;
  const args = call.args.map((a) => literalOf(a.value, constEnv));
  const clamp255 = (v: number): string =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0").toUpperCase();
  const alphaHex = (transp: unknown): string => {
    const t = typeof transp === "number" && Number.isFinite(transp) ? transp : 0;
    return Math.max(0, Math.min(255, Math.round(255 * (1 - Math.max(0, Math.min(100, t)) / 100))))
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  };
  if (call.callee.property === "new") {
    const base = args[0];
    if (typeof base !== "string" || !/^#[0-9a-fA-F]{6,8}$/.test(base)) return undefined;
    return "#" + base.slice(1, 7).toUpperCase() + alphaHex(args[1]);
  }
  if (call.callee.property === "rgb") {
    const [r, g, b, t] = args;
    if (typeof r !== "number" || typeof g !== "number" || typeof b !== "number") return undefined;
    const hex = "#" + clamp255(r) + clamp255(g) + clamp255(b);
    return t === undefined ? hex : hex + alphaHex(t);
  }
  return undefined;
}

/**
 * Mapa de constantes de nivel superior: `NAME = <literal>`. Resuelve referencias entre
 * constantes en orden de declaración (p.ej. `TINY = size.tiny`, luego usado en options).
 * Solo varDecl de nivel superior con init constante; el resto se omite.
 */
function collectTopLevelConsts(program: Program): Map<string, number | string | boolean> {
  const env = new Map<string, number | string | boolean>();
  for (const stmt of program.statements) {
    if (stmt.kind !== "varDecl") continue;
    const v = literalOf(stmt.init, env);
    if (v !== undefined) env.set(stmt.name, v);
  }
  return env;
}
