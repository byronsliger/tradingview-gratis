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
    return {
      ok: true,
      script: {
        version,
        meta: analysis.meta,
        plots: analysis.plots,
        inputs: analysis.inputs,
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

/**
 * Ejecuta un script compilado sobre las velas y materializa los puntos de cada
 * plot (omitiendo na). Lanza PineRuntimeError ante errores de ejecución o fuel
 * agotado — el caller decide cómo presentarlo.
 */
export function runScript(
  script: CompiledScript,
  candles: Candle[],
  inputs: Record<string, number | string | boolean> = {},
  options?: RunOptions,
): ScriptResult {
  const ctx = runProgram(script.program, candles, inputs, options);
  const plots: PlotResult[] = script.plots.map((spec) => {
    const values = ctx.plotValues.get(spec.id);
    const points: PlotPoint[] = [];
    if (values) {
      for (let i = 0; i < candles.length; i++) {
        const v = values[i];
        if (typeof v === "number") points.push({ time: candles[i].time, value: v });
      }
    }
    return { spec, points };
  });
  return { plots };
}

export { PineRuntimeError, PineSyntaxError } from "./errors";
export type {
  CompiledScript,
  CompileResult,
  Diagnostic,
  IndicatorMeta,
  InputDef,
  PineValue,
  PlotPoint,
  PlotResult,
  PlotSpec,
  RunOptions,
  ScriptResult,
} from "./types";
