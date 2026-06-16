import type { Candle } from "@/lib/binance/types";
import { analyze } from "./analyze";
import { PineSyntaxError, toDiagnostic } from "./errors";
import { lex } from "./lexer";
import { parse } from "./parser";
import { runProgram } from "./runtime/interpreter";
import type {
  CompiledScript,
  CompileResult,
  PlotPoint,
  PlotResult,
  RunOptions,
  ScriptResult,
  ShapePoint,
  ShapeResult,
  ShapeSpec,
} from "./types";

/**
 * Compila código Pine: lex → parse → análisis estático.
 * Nunca lanza por errores del usuario: los devuelve como diagnostics posicionados.
 */
export function compile(source: string): CompileResult {
  try {
    const { tokens, version } = lex(source);
    const program = parse(tokens);
    const analysis = analyze(program);
    if (analysis.errors.length > 0) {
      return { ok: false, diagnostics: analysis.errors };
    }
    return {
      ok: true,
      script: {
        version,
        meta: analysis.meta,
        plots: analysis.plots,
        inputs: analysis.inputs,
        hlines: analysis.hlines,
        shapes: analysis.shapes,
        warnings: analysis.warnings,
        program,
      },
    };
  } catch (err) {
    if (err instanceof PineSyntaxError) {
      return { ok: false, diagnostics: [toDiagnostic(err)] };
    }
    throw err;
  }
}

/** Pine shape.* / plotchar → los 4 markers de lightweight-charts. */
function markerShapeFor(spec: ShapeSpec): ShapePoint["shape"] {
  switch (spec.style) {
    case "triangleup":
    case "arrowup":
    case "labelup":
      return "arrowUp";
    case "triangledown":
    case "arrowdown":
    case "labeldown":
      return "arrowDown";
    case "circle":
    case "char":
      return "circle";
    default:
      // cross, xcross, square, diamond, flag
      return "square";
  }
}

/** location.* → posición de marker (absolute/top → aboveBar, limitación documentada). */
function markerPositionFor(location: ShapeSpec["location"]): ShapePoint["position"] {
  return location === "belowbar" || location === "bottom" ? "belowBar" : "aboveBar";
}

/**
 * Ejecuta un script compilado sobre las velas y materializa los puntos de cada
 * plot (omitiendo na) y los markers de plotshape/plotchar. Lanza PineRuntimeError
 * ante errores de ejecución o fuel agotado — el caller decide cómo presentarlo.
 */
export function runScript(
  script: CompiledScript,
  candles: Candle[],
  inputs: Record<string, number | string | boolean> = {},
  options?: RunOptions,
): ScriptResult {
  const ctx = runProgram(script.program, candles, inputs, options, script.inputs);

  const plots: PlotResult[] = script.plots.map((spec) => {
    const values = ctx.plotValues.get(spec.id);
    const colors = ctx.plotColors.get(spec.id);
    const points: PlotPoint[] = [];
    if (values) {
      for (let i = 0; i < candles.length; i++) {
        const v = values[i];
        if (typeof v !== "number") continue;
        const color = colors?.[i];
        points.push(
          color !== undefined
            ? { time: candles[i].time, value: v, color }
            : { time: candles[i].time, value: v },
        );
      }
    }
    return { spec, points };
  });

  const shapes: ShapeResult[] = script.shapes.map((spec) => {
    const marks = ctx.shapeMarks.get(spec.id);
    const points: ShapePoint[] = [];
    if (marks) {
      const position = markerPositionFor(spec.location);
      const shape = markerShapeFor(spec);
      const text = spec.char ?? spec.text;
      for (let i = 0; i < candles.length; i++) {
        const m = marks[i];
        if (m === undefined) continue;
        points.push({
          time: candles[i].time,
          position,
          shape,
          color: m ?? spec.color,
          ...(text !== undefined ? { text } : {}),
          ...(spec.size !== 1 ? { size: spec.size } : {}),
        });
      }
    }
    return { spec, points };
  });

  return { plots, shapes };
}

export { PineRuntimeError, PineSyntaxError } from "./errors";
export type {
  CompiledScript,
  CompileResult,
  Diagnostic,
  HLineSpec,
  IndicatorMeta,
  InputDef,
  InputType,
  PineValue,
  PlotPoint,
  PlotResult,
  PlotSpec,
  PlotStyle,
  RunOptions,
  ScriptResult,
  ShapePoint,
  ShapeResult,
  ShapeSpec,
} from "./types";
