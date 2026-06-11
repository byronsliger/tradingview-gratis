import type { Program } from "./ast";

/** Diagnóstico de compilación con posición exacta en el fuente. */
export interface Diagnostic {
  severity: "error" | "warning";
  message: string;
  line: number;
  col: number;
  start: number;
  end: number;
}

/** Plot declarado estáticamente por analyze(). `id` = callSiteId del plot() en el AST. */
export interface PlotSpec {
  id: number;
  title: string;
  color: string;
}

export type InputType = "int" | "float" | "bool" | "string" | "color" | "source";

/** Definición de un input.* — vacío en Fase 1, la estructura queda lista para Fase 4. */
export interface InputDef {
  id: string;
  type: InputType;
  defval: number | string | boolean;
  title?: string;
  minval?: number;
  maxval?: number;
  step?: number;
  options?: (string | number)[];
}

export interface IndicatorMeta {
  title: string;
  shorttitle?: string;
  overlay: boolean;
}

export interface CompiledScript {
  version: number | null;
  meta: IndicatorMeta;
  plots: PlotSpec[];
  inputs: InputDef[];
  warnings: Diagnostic[];
  program: Program;
}

export interface PlotPoint {
  time: number;
  value: number;
}

export interface PlotResult {
  spec: PlotSpec;
  points: PlotPoint[];
}

export interface ScriptResult {
  plots: PlotResult[];
}

/** Valor Pine en runtime: number | bool | string (incluye colores) | na (null). */
export type PineValue = number | boolean | string | null;

export type CompileResult =
  | { ok: true; script: CompiledScript }
  | { ok: false; diagnostics: Diagnostic[] };

/** Límites de fuel configurables (los tests los bajan para provocar el aborto). */
export interface RunOptions {
  maxFuelPerBar?: number;
  maxFuelTotal?: number;
}
