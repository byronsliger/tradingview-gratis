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

/** Estilos de plot() soportados (mapeo Pine → lightweight-charts en useUserScriptPanes). */
export type PlotStyle =
  | "line"
  | "stepline"
  | "histogram"
  | "columns"
  | "area"
  | "circles"
  | "cross";

/** Plot declarado estáticamente por analyze(). `id` = callSiteId del plot() en el AST. */
export interface PlotSpec {
  id: number;
  title: string;
  color: string;
  style: PlotStyle;
  linewidth: number;
}

/** hline() estática extraída por analyze() (el precio debe ser constante). */
export interface HLineSpec {
  id: number;
  price: number;
  title?: string;
  color: string;
  /** LineStyle de lightweight-charts: 0=sólida, 1=punteada, 2=discontinua */
  linestyle: number;
  linewidth: number;
}

/** plotshape()/plotchar() — partes estáticas extraídas por analyze(). */
export interface ShapeSpec {
  id: number;
  title: string;
  /** Estilo Pine original (triangleup, circle, …) o "char" para plotchar */
  style: string;
  location: "abovebar" | "belowbar" | "absolute" | "top" | "bottom";
  color: string;
  text?: string;
  /** Carácter de plotchar() */
  char?: string;
  size: number;
}

/** Punto de shape ya mapeado a la API de markers de lightweight-charts. */
export interface ShapePoint {
  time: number;
  position: "aboveBar" | "belowBar";
  shape: "arrowUp" | "arrowDown" | "circle" | "square";
  color: string;
  text?: string;
  size?: number;
}

export interface ShapeResult {
  spec: ShapeSpec;
  points: ShapePoint[];
}

export type InputType = "int" | "float" | "bool" | "string" | "color" | "source";

/** Definición de un input.* extraída estáticamente por analyze(). */
export interface InputDef {
  /** Clave estable: title literal si existe, si no `input{N}` posicional. */
  id: string;
  type: InputType;
  defval: number | string | boolean;
  title?: string;
  minval?: number;
  maxval?: number;
  step?: number;
  options?: (string | number)[];
  /** callSiteId del input.*() en el AST — clave de resolución en runtime. */
  callSiteId: number;
}

export interface IndicatorMeta {
  title: string;
  shorttitle?: string;
  overlay: boolean;
}

/** Límites de objetos de dibujo de indicator(max_*_count); default 50 como Pine. */
export interface DrawingLimitsSpec {
  maxLabels: number;
  maxLines: number;
  maxBoxes: number;
}

/** plotcandle() declarado estáticamente. `id` = callSiteId. */
export interface CandleSpec {
  id: number;
  title: string;
}

export interface CompiledScript {
  version: number | null;
  meta: IndicatorMeta;
  plots: PlotSpec[];
  inputs: InputDef[];
  hlines: HLineSpec[];
  shapes: ShapeSpec[];
  candleSpecs: CandleSpec[];
  limits: DrawingLimitsSpec;
  warnings: Diagnostic[];
  program: Program;
}

export interface PlotPoint {
  time: number;
  value: number;
  /** Color dinámico por barra (si plot() recibió una expresión de color). */
  color?: string;
}

export interface PlotResult {
  spec: PlotSpec;
  points: PlotPoint[];
}

/** Coordenada cruda de un dibujo: time (xloc.bar_time) e index (xloc.bar_index) + price. */
export interface DrawingPoint {
  time: number | null;
  index: number | null;
  price: number | null;
}

/** Etiqueta resuelta a coordenadas crudas + estilos (la capa de render la pinta). */
export interface LabelDrawing {
  id: number;
  x: number | null;
  y: number | null;
  text: string;
  color: string | null;
  textcolor: string | null;
  style: string;
  size: string;
  /** "bar_time" | "bar_index" */
  xloc: string;
}

/** Línea resuelta a coordenadas crudas + estilos. */
export interface LineDrawing {
  id: number;
  p1: DrawingPoint;
  p2: DrawingPoint;
  color: string | null;
  style: string;
  width: number;
  xloc: string;
  /** "none" | "left" | "right" | "both" */
  extend: string;
}

/** Caja resuelta a coordenadas crudas + estilos. */
export interface BoxDrawing {
  id: number;
  topLeft: DrawingPoint;
  bottomRight: DrawingPoint;
  bgcolor: string | null;
  borderColor: string | null;
  borderWidth: number;
  xloc: string;
  extend: string;
}

/** Grafo de objetos de dibujo vivos (no borrados) tras un run. */
export interface DrawingsResult {
  labels: LabelDrawing[];
  lines: LineDrawing[];
  boxes: BoxDrawing[];
}

/** Punto de plotcandle() por barra (na en open → omitido del array). */
export interface CandlePointResult {
  time: number;
  open: number;
  high: number | null;
  low: number | null;
  close: number | null;
  color?: string;
  wickColor?: string;
  borderColor?: string;
}

/** Serie de velas de un plotcandle(). */
export interface CandleResult {
  title: string;
  points: CandlePointResult[];
}

export interface ScriptResult {
  plots: PlotResult[];
  shapes: ShapeResult[];
  drawings: DrawingsResult;
  candles: CandleResult[];
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
