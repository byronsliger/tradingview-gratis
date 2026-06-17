import type { Candle } from "@/lib/binance/types";
import { analyze } from "./analyze";
import { PineSyntaxError, toDiagnostic } from "./errors";
import { lex } from "./lexer";
import { parse } from "./parser";
import { runProgram } from "./runtime/interpreter";
import type {
  BoxDrawing,
  CandleResult,
  CompiledScript,
  CompileResult,
  DrawingsResult,
  LabelDrawing,
  LineDrawing,
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
        candleSpecs: analysis.candleSpecs,
        limits: analysis.limits,
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
  const ctx = runProgram(script.program, candles, inputs, options, script.inputs, {
    maxLabels: script.limits.maxLabels,
    maxLines: script.limits.maxLines,
    maxBoxes: script.limits.maxBoxes,
  });

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

  // ---- drawings (objetos vivos no borrados) -------------------------------
  const labels: LabelDrawing[] = ctx.drawings.labels
    .filter((l) => !l.deleted)
    .map((l) => ({
      id: l.id,
      x: l.x,
      y: l.y,
      text: l.text,
      color: l.color,
      textcolor: l.textcolor,
      style: l.style,
      size: l.size,
      xloc: l.xloc,
    }));
  const lines: LineDrawing[] = ctx.drawings.lines
    .filter((l) => !l.deleted)
    .map((l) => ({
      id: l.id,
      p1: { time: l.p1.time, index: l.p1.index, price: l.p1.price },
      p2: { time: l.p2.time, index: l.p2.index, price: l.p2.price },
      color: l.color,
      style: l.style,
      width: l.width,
      xloc: l.xloc,
      extend: l.extend,
    }));
  const boxes: BoxDrawing[] = ctx.drawings.boxes
    .filter((b) => !b.deleted)
    .map((b) => ({
      id: b.id,
      topLeft: { time: b.topLeft.time, index: b.topLeft.index, price: b.topLeft.price },
      bottomRight: {
        time: b.bottomRight.time,
        index: b.bottomRight.index,
        price: b.bottomRight.price,
      },
      bgcolor: b.bgcolor,
      borderColor: b.borderColor,
      borderWidth: b.borderWidth,
      xloc: b.xloc,
      extend: b.extend,
    }));
  const drawings: DrawingsResult = { labels, lines, boxes };

  // ---- plotcandle ---------------------------------------------------------
  const candleResults: CandleResult[] = script.candleSpecs.map((spec) => {
    const recorded = ctx.candlePoints.get(spec.id) ?? [];
    const points = recorded
      .filter((p) => p.open !== null)
      .map((p) => ({
        time: candles[p.barIndex].time,
        open: p.open as number,
        high: p.high,
        low: p.low,
        close: p.close,
        ...(p.color !== undefined ? { color: p.color } : {}),
        ...(p.wickColor !== undefined ? { wickColor: p.wickColor } : {}),
        ...(p.borderColor !== undefined ? { borderColor: p.borderColor } : {}),
      }));
    return { title: spec.title, points };
  });

  return { plots, shapes, drawings, candles: candleResults };
}

export { PineRuntimeError, PineSyntaxError } from "./errors";
export type {
  BoxDrawing,
  CandlePointResult,
  CandleResult,
  CandleSpec,
  CompiledScript,
  CompileResult,
  Diagnostic,
  DrawingLimitsSpec,
  DrawingPoint,
  DrawingsResult,
  HLineSpec,
  IndicatorMeta,
  InputDef,
  InputType,
  LabelDrawing,
  LineDrawing,
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
