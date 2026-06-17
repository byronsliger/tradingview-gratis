// Constantes y tablas compartidas entre analyze y el runtime.

/** Constantes color.* (paleta de Pine v5; hex compatible con lightweight-charts). */
export const COLOR_CONSTANTS: Record<string, string> = {
  aqua: "#00BCD4",
  black: "#000000",
  blue: "#2962FF",
  fuchsia: "#E040FB",
  gray: "#787B86",
  green: "#089981",
  lime: "#00E676",
  maroon: "#880E4F",
  navy: "#311B92",
  olive: "#808000",
  orange: "#FF9800",
  purple: "#9C27B0",
  red: "#F23645",
  silver: "#B2B5BE",
  teal: "#008080",
  white: "#FFFFFF",
  yellow: "#FDD835",
};

export const DEFAULT_PLOT_COLOR = COLOR_CONSTANTS.blue;

/** Series virtuales sobre el array de velas. */
export const SERIES_BUILTINS = new Set([
  "open",
  "high",
  "low",
  "close",
  "volume",
  "time",
  "bar_index",
  "hl2",
  "hlc3",
  "ohlc4",
]);

/** Parámetros aceptados por plot(); series/title/color/linewidth/style tienen efecto. */
export const PLOT_PARAMS = [
  "series",
  "title",
  "color",
  "linewidth",
  "style",
  "trackprice",
  "histbase",
  "offset",
  "display",
];

/** Constantes plot.style_* → PlotStyle del motor (los *br caen al estilo base). */
export const PLOT_STYLE_CONSTANTS: Record<string, string> = {
  style_line: "line",
  style_linebr: "line",
  style_stepline: "stepline",
  style_stepline_diamond: "stepline",
  style_histogram: "histogram",
  style_columns: "columns",
  style_area: "area",
  style_areabr: "area",
  style_circles: "circles",
  style_cross: "cross",
};

/** Constantes hline.style_* → LineStyle de lightweight-charts. */
export const HLINE_STYLE_CONSTANTS: Record<string, number> = {
  style_solid: 0,
  style_dotted: 1,
  style_dashed: 2,
};

/** Constantes location.* de plotshape/plotchar. */
export const LOCATION_CONSTANTS: Record<string, string> = {
  abovebar: "abovebar",
  belowbar: "belowbar",
  top: "top",
  bottom: "bottom",
  absolute: "absolute",
};

/** Constantes shape.* (se mapean a los 4 markers de lightweight-charts en index.ts). */
export const SHAPE_CONSTANTS: Record<string, string> = {
  xcross: "xcross",
  cross: "cross",
  triangleup: "triangleup",
  triangledown: "triangledown",
  flag: "flag",
  circle: "circle",
  arrowup: "arrowup",
  arrowdown: "arrowdown",
  labelup: "labelup",
  labeldown: "labeldown",
  square: "square",
  diamond: "diamond",
};

/** Constantes size.* → factor de tamaño del marker (default 1). */
export const SIZE_CONSTANTS: Record<string, number> = {
  auto: 1,
  tiny: 0.5,
  small: 0.75,
  normal: 1,
  large: 1.5,
  huge: 2,
};

/** Constantes label.style_* → nombre simbólico de estilo (la capa de render lo mapea). */
export const LABEL_STYLE_CONSTANTS: Record<string, string> = {
  style_none: "none",
  style_label_up: "label_up",
  style_label_down: "label_down",
  style_label_left: "label_left",
  style_label_right: "label_right",
  style_label_lower_left: "label_lower_left",
  style_label_lower_right: "label_lower_right",
  style_label_upper_left: "label_upper_left",
  style_label_upper_right: "label_upper_right",
  style_label_center: "label_center",
  style_circle: "circle",
  style_square: "square",
  style_diamond: "diamond",
  style_arrowup: "arrowup",
  style_arrowdown: "arrowdown",
  style_xcross: "xcross",
  style_cross: "cross",
  style_triangleup: "triangleup",
  style_triangledown: "triangledown",
  style_flag: "flag",
  style_text_outline: "text_outline",
};

/** Constantes line.style_* / box.* → nombre simbólico de estilo de línea. */
export const LINE_STYLE_CONSTANTS: Record<string, string> = {
  style_solid: "solid",
  style_dashed: "dashed",
  style_dotted: "dotted",
  style_arrow_left: "arrow_left",
  style_arrow_right: "arrow_right",
  style_arrow_both: "arrow_both",
};

/** Constantes xloc.* → unidad de la coordenada X de un dibujo. */
export const XLOC_CONSTANTS: Record<string, string> = {
  bar_time: "bar_time",
  bar_index: "bar_index",
};

/** Constantes extend.* → dirección de extensión de línea/caja. */
export const EXTEND_CONSTANTS: Record<string, string> = {
  none: "none",
  left: "left",
  right: "right",
  both: "both",
};

/** Constantes barmerge.* → strings simbólicos (lookahead/gaps de request.security). */
export const BARMERGE_CONSTANTS: Record<string, string> = {
  lookahead_on: "lookahead_on",
  lookahead_off: "lookahead_off",
  gaps_on: "gaps_on",
  gaps_off: "gaps_off",
};

/** Constantes size.* SIMBÓLICAS para labels (size.* numérico vive en SIZE_CONSTANTS para plotshape). */
export const LABEL_SIZE_NAMES: Record<string, string> = {
  auto: "auto",
  tiny: "tiny",
  small: "small",
  normal: "normal",
  large: "large",
  huge: "huge",
};

/** Tabla unificada de constantes por namespace (analyze y evalMember la comparten). */
export const NAMESPACE_CONSTANTS: Record<string, Record<string, string | number>> = {
  color: COLOR_CONSTANTS,
  plot: PLOT_STYLE_CONSTANTS,
  hline: HLINE_STYLE_CONSTANTS,
  location: LOCATION_CONSTANTS,
  shape: SHAPE_CONSTANTS,
  size: SIZE_CONSTANTS,
  label: LABEL_STYLE_CONSTANTS,
  line: LINE_STYLE_CONSTANTS,
  box: LINE_STYLE_CONSTANTS,
  xloc: XLOC_CONSTANTS,
  extend: EXTEND_CONSTANTS,
  barmerge: BARMERGE_CONSTANTS,
};

/** Parámetros de hline() (price/title/color/linestyle/linewidth tienen efecto). */
export const HLINE_PARAMS = [
  "price",
  "title",
  "color",
  "linestyle",
  "linewidth",
  "editable",
  "display",
];

/** Parámetros de plotshape() (orden Pine v5). */
export const PLOTSHAPE_PARAMS = [
  "series",
  "title",
  "style",
  "location",
  "color",
  "offset",
  "text",
  "textcolor",
  "editable",
  "size",
  "show_last",
  "display",
];

/** Parámetros de plotchar() (orden Pine v5). */
export const PLOTCHAR_PARAMS = [
  "series",
  "title",
  "char",
  "location",
  "color",
  "offset",
  "text",
  "textcolor",
  "editable",
  "size",
  "show_last",
  "display",
];

/** Series admitidas como input.source (subset documentado: sin time/bar_index). */
export const SOURCE_NAMES = new Set([
  "open",
  "high",
  "low",
  "close",
  "volume",
  "hl2",
  "hlc3",
  "ohlc4",
]);

/** Parámetros aceptados por cada variante de input.* (y el input() genérico). */
export const INPUT_PARAMS: Record<string, string[]> = {
  int: ["defval", "title", "minval", "maxval", "step", "tooltip", "inline", "group", "confirm", "options", "display"],
  float: ["defval", "title", "minval", "maxval", "step", "tooltip", "inline", "group", "confirm", "options", "display"],
  bool: ["defval", "title", "tooltip", "inline", "group", "confirm", "display"],
  string: ["defval", "title", "options", "tooltip", "inline", "group", "confirm", "display"],
  color: ["defval", "title", "tooltip", "inline", "group", "confirm", "display"],
  source: ["defval", "title", "tooltip", "inline", "group", "display"],
  timeframe: ["defval", "title", "options", "tooltip", "inline", "group", "confirm", "display"],
  generic: ["defval", "title", "tooltip", "inline", "group", "confirm", "display"],
};

/** Parámetros aceptados por indicator(); solo title/shorttitle/overlay/max_*_count tienen efecto. */
export const INDICATOR_PARAMS = [
  "title",
  "shorttitle",
  "overlay",
  "format",
  "precision",
  "timeframe",
  "timeframe_gaps",
  "max_bars_back",
  "max_lines_count",
  "max_labels_count",
  "max_boxes_count",
];

/** Parámetros de label.new() en su forma (x, y, text, ...). */
export const LABEL_PARAMS = [
  "x",
  "y",
  "text",
  "xloc",
  "yloc",
  "color",
  "style",
  "textcolor",
  "size",
  "textalign",
  "tooltip",
  "text_font_family",
  "force_overlay",
];

/** Parámetros de line.new() en su forma (x1, y1, x2, y2, ...). */
export const LINE_PARAMS = [
  "x1",
  "y1",
  "x2",
  "y2",
  "xloc",
  "extend",
  "color",
  "style",
  "width",
  "force_overlay",
];

/** Parámetros de box.new() en su forma (left, top, right, bottom, ...). */
export const BOX_PARAMS = [
  "left",
  "top",
  "right",
  "bottom",
  "border_color",
  "border_width",
  "border_style",
  "extend",
  "xloc",
  "bgcolor",
  "text",
  "text_size",
  "text_color",
  "text_halign",
  "text_valign",
  "text_wrap",
  "text_font_family",
  "force_overlay",
];

/** Parámetros de plotcandle() (orden Pine v5). */
export const PLOTCANDLE_PARAMS = [
  "open",
  "high",
  "low",
  "close",
  "title",
  "color",
  "wickcolor",
  "editable",
  "show_last",
  "bordercolor",
  "display",
  "force_overlay",
];
