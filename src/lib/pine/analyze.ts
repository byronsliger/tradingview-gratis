import type { CallExpr, Expr, Program } from "./ast";
import type { SourcePos } from "./errors";
import {
  COLOR_CONSTANTS,
  DEFAULT_PLOT_COLOR,
  INDICATOR_PARAMS,
  PLOT_PARAMS,
} from "./runtime/builtins-core";
import type { Diagnostic, IndicatorMeta, InputDef, PlotSpec } from "./types";

/** Resultado del pase estático sobre el AST (sin ejecutar el script). */
export interface Analysis {
  meta: IndicatorMeta;
  plots: PlotSpec[];
  inputs: InputDef[];
  warnings: Diagnostic[];
}

const TOP_OF_FILE: SourcePos = { line: 1, col: 1, start: 0, end: 0 };

/**
 * Extrae estáticamente la meta de indicator(), los PlotSpec de cada plot()
 * y los InputDef (vacíos en Fase 1: la estructura queda lista para Fase 4).
 */
export function analyze(program: Program): Analysis {
  const warnings: Diagnostic[] = [];
  const warn = (pos: SourcePos, message: string): void => {
    warnings.push({
      severity: "warning",
      message,
      line: pos.line,
      col: pos.col,
      start: pos.start,
      end: pos.end,
    });
  };

  const calls = collectCalls(program);
  const indicatorCalls = calls.filter((c) => isBareCall(c, "indicator"));
  const plotCalls = calls.filter((c) => isBareCall(c, "plot"));

  const meta: IndicatorMeta = { title: "Indicator", overlay: false };
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
  }

  const plots: PlotSpec[] = plotCalls.map((call, i) => {
    const titleExpr = argExpr(call, PLOT_PARAMS, "title");
    const titleLit = titleExpr ? literalOf(titleExpr) : undefined;
    const colorExpr = argExpr(call, PLOT_PARAMS, "color");
    const colorLit = colorExpr ? literalOf(colorExpr) : undefined;
    return {
      id: call.callSiteId,
      title: typeof titleLit === "string" ? titleLit : `Plot ${i + 1}`,
      color: typeof colorLit === "string" ? colorLit : DEFAULT_PLOT_COLOR,
    };
  });
  if (plots.length === 0) {
    warn(TOP_OF_FILE, "El script no tiene ningún plot(): no dibujará nada");
  }

  return { meta, plots, inputs: [], warnings };
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
      default:
        return;
    }
  };
  for (const stmt of program.statements) {
    switch (stmt.kind) {
      case "varDecl":
        visit(stmt.init);
        break;
      case "assign":
        visit(stmt.value);
        break;
      case "exprStmt":
        visit(stmt.expr);
        break;
    }
  }
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

/** Valor de un literal estático; undefined si la expresión no es constante. */
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
      if (expr.object === "color") return COLOR_CONSTANTS[expr.property];
      return undefined;
    default:
      return undefined;
  }
}
