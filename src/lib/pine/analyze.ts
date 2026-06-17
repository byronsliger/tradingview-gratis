import type { CallExpr, Expr, Program, Stmt } from "./ast";
import type { SourcePos } from "./errors";
import {
  COLOR_CONSTANTS,
  DEFAULT_PLOT_COLOR,
  HLINE_PARAMS,
  INDICATOR_PARAMS,
  INPUT_PARAMS,
  NAMESPACE_CONSTANTS,
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
  warnings: Diagnostic[];
  errors: Diagnostic[];
}

const TOP_OF_FILE: SourcePos = { line: 1, col: 1, start: 0, end: 0 };

const INPUT_TYPES = new Set(["int", "float", "bool", "string", "color", "source"]);
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
      const title = literalOf(titleExpr);
      if (typeof title === "string") meta.title = title;
      else warn(titleExpr, "El título de indicator() debe ser una cadena literal");
    }
    const shortExpr = argExpr(ind, INDICATOR_PARAMS, "shorttitle");
    if (shortExpr) {
      const short = literalOf(shortExpr);
      if (typeof short === "string") meta.shorttitle = short;
    }
    const overlayExpr = argExpr(ind, INDICATOR_PARAMS, "overlay");
    if (overlayExpr) {
      const overlay = literalOf(overlayExpr);
      if (typeof overlay === "boolean") meta.overlay = overlay;
      else warn(overlayExpr, "overlay debe ser true o false literal");
    }
    const limitArg = (name: string): number | undefined => {
      const expr = argExpr(ind, INDICATOR_PARAMS, name);
      if (!expr) return undefined;
      const lit = literalOf(expr);
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
    const def = analyzeInput(call, i + 1, usedIds, { warn, error });
    if (def) {
      inputs.push(def);
      usedIds.add(def.id);
    }
  });

  // ---- plots --------------------------------------------------------------
  const plots: PlotSpec[] = plotCalls.map((call, i) => {
    const titleExpr = argExpr(call, PLOT_PARAMS, "title");
    const titleLit = titleExpr ? literalOf(titleExpr) : undefined;
    const colorExpr = argExpr(call, PLOT_PARAMS, "color");
    const colorLit = colorExpr ? literalOf(colorExpr) : undefined;
    let style: PlotStyle = "line";
    const styleExpr = argExpr(call, PLOT_PARAMS, "style");
    if (styleExpr) {
      const styleLit = literalOf(styleExpr);
      if (typeof styleLit === "string" && isPlotStyle(styleLit)) style = styleLit;
      else warn(styleExpr, "style de plot() no reconocido; se usa plot.style_line");
    }
    let linewidth = 1;
    const lwExpr = argExpr(call, PLOT_PARAMS, "linewidth");
    if (lwExpr) {
      const lw = literalOf(lwExpr);
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
    const price = priceExpr ? literalOf(priceExpr) : undefined;
    if (typeof price !== "number" || !Number.isFinite(price)) {
      error(
        priceExpr ?? call,
        "El precio de hline() debe ser una constante numérica (literal)",
      );
      continue;
    }
    const titleExpr = argExpr(call, HLINE_PARAMS, "title");
    const titleLit = titleExpr ? literalOf(titleExpr) : undefined;
    const colorExpr = argExpr(call, HLINE_PARAMS, "color");
    const colorLit = colorExpr ? literalOf(colorExpr) : undefined;
    const styleExpr = argExpr(call, HLINE_PARAMS, "linestyle");
    const styleLit = styleExpr ? literalOf(styleExpr) : undefined;
    const lwExpr = argExpr(call, HLINE_PARAMS, "linewidth");
    const lwLit = lwExpr ? literalOf(lwExpr) : undefined;
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
    const titleLit = titleExpr ? literalOf(titleExpr) : undefined;

    let style = isChar ? "char" : "xcross";
    if (!isChar) {
      const styleExpr = argExpr(call, params, "style");
      if (styleExpr) {
        const s = literalOf(styleExpr);
        if (typeof s === "string" && SHAPE_CONSTANTS[s] !== undefined) style = s;
        else warn(styleExpr, "style de plotshape() no reconocido; se usa shape.xcross");
      }
    }

    let location: ShapeSpec["location"] = "abovebar";
    const locExpr = argExpr(call, params, "location");
    if (locExpr) {
      const l = literalOf(locExpr);
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
    const colorLit = colorExpr ? literalOf(colorExpr) : undefined;
    const textExpr = argExpr(call, params, "text");
    const textLit = textExpr ? literalOf(textExpr) : undefined;
    let size = 1;
    const sizeExpr = argExpr(call, params, "size");
    if (sizeExpr) {
      const s = literalOf(sizeExpr);
      if (typeof s === "number" && Number.isFinite(s)) size = s;
      else warn(sizeExpr, "size de plotshape/plotchar no reconocido; se usa size.auto");
    }
    let char: string | undefined;
    if (isChar) {
      const charExpr = argExpr(call, params, "char");
      const c = charExpr ? literalOf(charExpr) : undefined;
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
    const titleLit = titleExpr ? literalOf(titleExpr) : undefined;
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

  return { meta, plots, inputs, hlines, shapes, candleSpecs, limits, warnings, errors };
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
  let defval: number | string | boolean;
  let type: InputType;
  if (typeName === "source" || (typeName === "generic" && defvalExpr.kind === "ident")) {
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
    const lit = literalOf(defvalExpr);
    if (lit === undefined) {
      error(defvalExpr, "El valor por defecto de input.* debe ser una constante");
      return null;
    }
    if (typeName === "generic") {
      type = inferInputType(defvalExpr, lit);
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
  const titleLit = titleExpr ? literalOf(titleExpr) : undefined;
  let title: string | undefined;
  if (titleExpr) {
    if (typeof titleLit === "string") title = titleLit;
    else warn(titleExpr, "El title de input.* debe ser una cadena literal; se ignora");
  }

  const numericArg = (name: string): number | undefined => {
    const expr = argExpr(call, params, name);
    if (!expr) return undefined;
    const lit = literalOf(expr);
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
      const v = literalOf(el);
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
  // string: color si el literal era #hex o una constante color.*
  if (expr.kind === "color") return "color";
  if (expr.kind === "member" && expr.object === "color") return "color";
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
 * Resuelve también las constantes de namespace (color.*, plot.style_*, hline.style_*,
 * location.*, shape.*, size.*).
 */
function literalOf(expr: Expr): number | string | boolean | undefined {
  switch (expr.kind) {
    case "number":
    case "string":
    case "bool":
    case "color":
      return expr.value;
    case "unary": {
      if (expr.op !== "-") return undefined;
      const v = literalOf(expr.operand);
      return typeof v === "number" ? -v : undefined;
    }
    case "member":
      return NAMESPACE_CONSTANTS[expr.object]?.[expr.property];
    default:
      return undefined;
  }
}
