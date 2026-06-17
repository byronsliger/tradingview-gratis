// Constructores y mutadores de los objetos de dibujo (label / line / box / chart.point).
// Despachados desde el interpreter: los constructores como `label.new(...)` (callee
// member object='label'/'line'/'box' o fieldAccess para chart.point.new), y los
// mutadores como métodos sobre el handle (`l.set_xy1(...)` → fieldAccess cuyo target
// evalúa a un handle de dibujo).

import { PineRuntimeError, type SourcePos } from "../errors";
import { ChartPoint, type DrawingStore, PineBox, PineLabel, PineLine } from "./drawings";
import { type EvalValue } from "./values";

const DEFAULT_LINE_COLOR = "#2962FF";
const DEFAULT_LABEL_COLOR = "#2962FF";
const DEFAULT_LABEL_TEXTCOLOR = "#FFFFFF";

/** Valor → number|null (na de coordenadas). */
function num(v: EvalValue | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Resuelve un color de los args mapeados: si el parámetro NO fue provisto → fallback;
 * si fue provisto como `na`/`color(na)` (null) → null (sin color/transparente).
 */
function colorArg(m: MappedArgs, name: string, fallback: string | null): string | null {
  if (!m.has(name)) return fallback;
  const v = m.get(name);
  if (v === null || v === undefined) return null;
  return typeof v === "string" ? v : fallback;
}

/** Color de un argumento posicional crudo (mutadores): null si na. */
function colorOf(v: EvalValue | undefined): string | null {
  if (v === null || v === undefined) return null;
  return typeof v === "string" ? v : null;
}

function strOf(v: EvalValue | undefined, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

/** size.* llega como número (NAMESPACE_CONSTANTS["size"] es numérico) → nombre simbólico. */
function sizeName(v: EvalValue | undefined): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") {
    if (v <= 0.5) return "tiny";
    if (v <= 0.75) return "small";
    if (v < 1.5) return "normal";
    if (v < 2) return "large";
    return "huge";
  }
  return "normal";
}

function asChartPoint(v: EvalValue | undefined, pos: SourcePos, what: string): ChartPoint {
  if (v instanceof ChartPoint) return v;
  throw new PineRuntimeError(`'${what}' requiere un chart.point`, pos);
}

/** chart.point.new(time, price) o chart.point.new(time, index, price). */
export function chartPointNew(args: EvalValue[], pos: SourcePos): ChartPoint {
  if (args.length === 2) {
    return new ChartPoint(num(args[0]), null, num(args[1]));
  }
  if (args.length >= 3) {
    return new ChartPoint(num(args[0]), num(args[1]), num(args[2]));
  }
  throw new PineRuntimeError("chart.point.new() requiere (time, price) o (time, index, price)", pos);
}

interface MappedArgs {
  /** valor por nombre o posición; undefined si no provisto. */
  get(name: string): EvalValue | undefined;
  /** ¿el parámetro fue provisto (incluso como na)? */
  has(name: string): boolean;
}

/** Mapea args posicionales/nombrados a un objeto consultable por nombre de parámetro. */
function mapDrawArgs(
  args: { name: string | null; value: EvalValue }[],
  params: string[],
  pos: SourcePos,
): MappedArgs {
  const byName = new Map<string, EvalValue>();
  let positional = 0;
  let sawNamed = false;
  for (const a of args) {
    if (a.name === null) {
      if (sawNamed) {
        throw new PineRuntimeError("Los argumentos posicionales deben ir antes que los nombrados", pos);
      }
      if (positional < params.length) byName.set(params[positional], a.value);
      positional++;
    } else {
      sawNamed = true;
      // Tolerante: parámetros no modelados (tooltip/force_overlay/yloc/…) se guardan igual.
      byName.set(a.name, a.value);
    }
  }
  return { get: (name) => byName.get(name), has: (name) => byName.has(name) };
}

/** label.new(x, y, text, ...) o label.new(chart.point, text, ...). */
export function labelNew(
  store: DrawingStore,
  args: { name: string | null; value: EvalValue }[],
  pos: SourcePos,
): PineLabel {
  // Forma con chart.point: primer argumento posicional es un ChartPoint.
  const first = args.find((a) => a.name === null)?.value;
  if (first instanceof ChartPoint) {
    const rest = args.filter((a) => a !== args.find((x) => x.name === null));
    const m = mapDrawArgs(
      rest,
      ["text", "xloc", "yloc", "color", "style", "textcolor", "size"],
      pos,
    );
    return store.newLabel(
      first.time ?? first.index,
      first.price,
      strOf(m.get("text"), ""),
      colorArg(m, "color", DEFAULT_LABEL_COLOR),
      colorArg(m, "textcolor", DEFAULT_LABEL_TEXTCOLOR),
      strOf(m.get("style"), "label_down"),
      sizeName(m.get("size")),
      strOf(m.get("xloc"), first.time !== null ? "bar_time" : "bar_index"),
    );
  }
  const m = mapDrawArgs(args, LABEL_PARAMS_LOCAL, pos);
  const xloc = strOf(m.get("xloc"), "bar_index");
  return store.newLabel(
    num(m.get("x")),
    num(m.get("y")),
    strOf(m.get("text"), ""),
    colorArg(m, "color", DEFAULT_LABEL_COLOR),
    colorArg(m, "textcolor", DEFAULT_LABEL_TEXTCOLOR),
    strOf(m.get("style"), "label_down"),
    sizeName(m.get("size")),
    xloc,
  );
}

const LABEL_PARAMS_LOCAL = [
  "x", "y", "text", "xloc", "yloc", "color", "style", "textcolor", "size",
];

/** line.new(x1, y1, x2, y2, ...) o line.new(point1, point2, ...). */
export function lineNew(
  store: DrawingStore,
  args: { name: string | null; value: EvalValue }[],
  pos: SourcePos,
): PineLine {
  const positionals = args.filter((a) => a.name === null);
  if (positionals[0]?.value instanceof ChartPoint && positionals[1]?.value instanceof ChartPoint) {
    const p1 = positionals[0].value;
    const p2 = positionals[1].value;
    const rest = args.filter((a) => a !== positionals[0] && a !== positionals[1]);
    const m = mapDrawArgs(rest, ["xloc", "extend", "color", "style", "width"], pos);
    return store.newLine(
      p1,
      p2,
      colorArg(m, "color", DEFAULT_LINE_COLOR),
      strOf(m.get("style"), "solid"),
      typeof m.get("width") === "number" ? (m.get("width") as number) : 1,
      strOf(m.get("xloc"), p1.time !== null ? "bar_time" : "bar_index"),
      strOf(m.get("extend"), "none"),
    );
  }
  const m = mapDrawArgs(args, LINE_PARAMS_LOCAL, pos);
  const xloc = strOf(m.get("xloc"), "bar_index");
  const useTime = xloc === "bar_time";
  const p1 = makePoint(num(m.get("x1")), num(m.get("y1")), useTime);
  const p2 = makePoint(num(m.get("x2")), num(m.get("y2")), useTime);
  return store.newLine(
    p1,
    p2,
    colorArg(m, "color", DEFAULT_LINE_COLOR),
    strOf(m.get("style"), "solid"),
    typeof m.get("width") === "number" ? (m.get("width") as number) : 1,
    xloc,
    strOf(m.get("extend"), "none"),
  );
}

const LINE_PARAMS_LOCAL = ["x1", "y1", "x2", "y2", "xloc", "extend", "color", "style", "width"];

/** box.new(left, top, right, bottom, ...) o box.new(point1, point2, ...). */
export function boxNew(
  store: DrawingStore,
  args: { name: string | null; value: EvalValue }[],
  pos: SourcePos,
): PineBox {
  const positionals = args.filter((a) => a.name === null);
  if (positionals[0]?.value instanceof ChartPoint && positionals[1]?.value instanceof ChartPoint) {
    const tl = positionals[0].value;
    const br = positionals[1].value;
    const rest = args.filter((a) => a !== positionals[0] && a !== positionals[1]);
    const m = mapDrawArgs(rest, ["border_color", "border_width", "border_style", "extend", "xloc", "bgcolor"], pos);
    return store.newBox(
      tl,
      br,
      colorArg(m, "bgcolor", null),
      colorArg(m, "border_color", DEFAULT_LINE_COLOR),
      typeof m.get("border_width") === "number" ? (m.get("border_width") as number) : 1,
      strOf(m.get("xloc"), tl.time !== null ? "bar_time" : "bar_index"),
      strOf(m.get("extend"), "none"),
    );
  }
  const m = mapDrawArgs(args, BOX_PARAMS_LOCAL, pos);
  const xloc = strOf(m.get("xloc"), "bar_index");
  const useTime = xloc === "bar_time";
  const tl = makePoint(num(m.get("left")), num(m.get("top")), useTime);
  const br = makePoint(num(m.get("right")), num(m.get("bottom")), useTime);
  return store.newBox(
    tl,
    br,
    colorArg(m, "bgcolor", null),
    colorArg(m, "border_color", DEFAULT_LINE_COLOR),
    typeof m.get("border_width") === "number" ? (m.get("border_width") as number) : 1,
    xloc,
    strOf(m.get("extend"), "none"),
  );
}

const BOX_PARAMS_LOCAL = [
  "left", "top", "right", "bottom", "border_color", "border_width", "border_style",
  "extend", "xloc", "bgcolor",
];

/** Construye un ChartPoint a partir de coordenadas crudas (x como time o index). */
function makePoint(x: number | null, y: number | null, useTime: boolean): ChartPoint {
  return useTime ? new ChartPoint(x, null, y) : new ChartPoint(null, x, y);
}

/**
 * Despacha un método/mutador sobre un handle de dibujo: `l.set_xy1(...)`, `b.delete()`,
 * `lbl.set_text(...)`. Devuelve el valor del método (la mayoría void → null).
 */
export function callDrawMethod(
  target: PineLabel | PineLine | PineBox,
  method: string,
  args: EvalValue[],
  pos: SourcePos,
): EvalValue {
  if (target instanceof PineLabel) return labelMethod(target, method, args, pos);
  if (target instanceof PineLine) return lineMethod(target, method, args, pos);
  return boxMethod(target, method, args, pos);
}

function labelMethod(label: PineLabel, method: string, args: EvalValue[], pos: SourcePos): EvalValue {
  switch (method) {
    case "set_x":
      label.x = num(args[0]);
      return null;
    case "set_y":
      label.y = num(args[0]);
      return null;
    case "set_xy":
      label.x = num(args[0]);
      label.y = num(args[1]);
      return null;
    case "set_text":
      label.text = strOf(args[0], "");
      return null;
    case "set_color":
      label.color = colorOf(args[0]);
      return null;
    case "set_textcolor":
      label.textcolor = colorOf(args[0]);
      return null;
    case "set_style":
      label.style = strOf(args[0], label.style);
      return null;
    case "set_size":
      label.size = sizeName(args[0]);
      return null;
    case "set_point": {
      const p = asChartPoint(args[0], pos, "label.set_point");
      label.x = p.time ?? p.index;
      label.y = p.price;
      return null;
    }
    case "set_xloc": {
      // set_xloc(x, xloc): reposiciona y cambia la unidad.
      label.x = num(args[0]);
      label.xloc = strOf(args[1], label.xloc);
      return null;
    }
    case "delete":
      label.deleted = true;
      return null;
    case "get_x":
      return label.x;
    case "get_y":
      return label.y;
    default:
      throw new PineRuntimeError(`'label.${method}()' no está soportado`, pos);
  }
}

function lineMethod(line: PineLine, method: string, args: EvalValue[], pos: SourcePos): EvalValue {
  switch (method) {
    case "set_first_point":
      line.p1 = asChartPoint(args[0], pos, "line.set_first_point");
      return null;
    case "set_second_point":
      line.p2 = asChartPoint(args[0], pos, "line.set_second_point");
      return null;
    case "set_xy1":
      line.p1 = makePoint(num(args[0]), num(args[1]), line.xloc === "bar_time");
      return null;
    case "set_xy2":
      line.p2 = makePoint(num(args[0]), num(args[1]), line.xloc === "bar_time");
      return null;
    case "set_x1":
      if (line.xloc === "bar_time") line.p1.time = num(args[0]);
      else line.p1.index = num(args[0]);
      return null;
    case "set_y1":
      line.p1.price = num(args[0]);
      return null;
    case "set_x2":
      if (line.xloc === "bar_time") line.p2.time = num(args[0]);
      else line.p2.index = num(args[0]);
      return null;
    case "set_y2":
      line.p2.price = num(args[0]);
      return null;
    case "set_color":
      line.color = colorOf(args[0]);
      return null;
    case "set_style":
      line.style = strOf(args[0], line.style);
      return null;
    case "set_width":
      line.width = typeof args[0] === "number" ? args[0] : line.width;
      return null;
    case "set_extend":
      line.extend = strOf(args[0], line.extend);
      return null;
    case "delete":
      line.deleted = true;
      return null;
    case "get_x1":
      return line.p1.time ?? line.p1.index;
    case "get_y1":
      return line.p1.price;
    case "get_x2":
      return line.p2.time ?? line.p2.index;
    case "get_y2":
      return line.p2.price;
    default:
      throw new PineRuntimeError(`'line.${method}()' no está soportado`, pos);
  }
}

function boxMethod(box: PineBox, method: string, args: EvalValue[], pos: SourcePos): EvalValue {
  switch (method) {
    case "set_top_left_point":
      box.topLeft = asChartPoint(args[0], pos, "box.set_top_left_point");
      return null;
    case "set_bottom_right_point":
      box.bottomRight = asChartPoint(args[0], pos, "box.set_bottom_right_point");
      return null;
    case "set_lefttop":
      box.topLeft = makePoint(num(args[0]), num(args[1]), box.xloc === "bar_time");
      return null;
    case "set_rightbottom":
      box.bottomRight = makePoint(num(args[0]), num(args[1]), box.xloc === "bar_time");
      return null;
    case "set_left":
      if (box.xloc === "bar_time") box.topLeft.time = num(args[0]);
      else box.topLeft.index = num(args[0]);
      return null;
    case "set_top":
      box.topLeft.price = num(args[0]);
      return null;
    case "set_right":
      if (box.xloc === "bar_time") box.bottomRight.time = num(args[0]);
      else box.bottomRight.index = num(args[0]);
      return null;
    case "set_bottom":
      box.bottomRight.price = num(args[0]);
      return null;
    case "set_bgcolor":
      box.bgcolor = colorOf(args[0]);
      return null;
    case "set_border_color":
      box.borderColor = colorOf(args[0]);
      return null;
    case "set_border_width":
      box.borderWidth = typeof args[0] === "number" ? args[0] : box.borderWidth;
      return null;
    case "set_border_style":
      // estilo de borde no modelado por separado; no-op tolerante.
      return null;
    case "set_extend":
      box.extend = strOf(args[0], box.extend);
      return null;
    case "delete":
      box.deleted = true;
      return null;
    default:
      throw new PineRuntimeError(`'box.${method}()' no está soportado`, pos);
  }
}
