import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";

/**
 * Autocompletado de builtins de Pine para CodeMirror 6.
 *
 * Dos modos:
 * - Tras `ns.` (ej. `ta.`, `math.`) ofrece SOLO los miembros de ese namespace.
 * - En texto suelto ofrece keywords, funciones top-level, series vars y los
 *   propios namespaces (para que al elegir `ta` escribas `ta.` y dispares el
 *   segundo modo escribiendo el punto).
 *
 * La lista refleja lo que el motor implementa (runtime/builtins-*.ts + parser);
 * mantenerla en sync si se añaden builtins nuevos.
 */

type Member = string | { label: string; detail?: string };

function fn(label: string, detail = "función"): Completion {
  return { label, type: "function", detail };
}

function members(ns: string, list: Member[], type: "function" | "property" = "function"): Completion[] {
  return list.map((m) => {
    const label = typeof m === "string" ? m : m.label;
    const detail = typeof m === "string" ? undefined : m.detail;
    return { label, type, detail: detail ?? `${ns}.${label}` };
  });
}

/** Miembros por namespace. La clave es lo que va antes del punto. */
const NAMESPACE_MEMBERS: Record<string, Completion[]> = {
  ta: members("ta", [
    "sma", "ema", "rma", "wma", "vwma", "rsi", "stdev", "highest", "lowest",
    "change", "tr", "atr", "crossover", "crossunder", "cross", "linreg",
    "mom", "roc", "sum", "cum", "barssince", "valuewhen", "bb", "kc", "macd",
  ]),
  math: members("math", [
    "abs", "sqrt", "log", "exp", "floor", "ceil", "round", "pow", "max", "min",
    "avg", "sum", "sign", "sin", "cos", "tan", "todegrees", "toradians",
  ]),
  color: members("color", [
    "new", "rgb",
    { label: "red", detail: "color" }, { label: "green", detail: "color" },
    { label: "blue", detail: "color" }, { label: "orange", detail: "color" },
    { label: "purple", detail: "color" }, { label: "yellow", detail: "color" },
    { label: "white", detail: "color" }, { label: "black", detail: "color" },
    { label: "gray", detail: "color" }, { label: "teal", detail: "color" },
    { label: "lime", detail: "color" }, { label: "maroon", detail: "color" },
    { label: "navy", detail: "color" }, { label: "olive", detail: "color" },
    { label: "fuchsia", detail: "color" }, { label: "aqua", detail: "color" },
    { label: "silver", detail: "color" },
  ]),
  input: members("input", [
    "int", "float", "bool", "string", "color", "source",
  ]),
  location: members("location", [
    { label: "abovebar", detail: "location" },
    { label: "belowbar", detail: "location" },
    { label: "absolute", detail: "location" },
    { label: "top", detail: "location" },
    { label: "bottom", detail: "location" },
  ], "property"),
  shape: members("shape", [
    { label: "triangleup", detail: "shape" },
    { label: "triangledown", detail: "shape" },
    { label: "circle", detail: "shape" },
    { label: "arrowup", detail: "shape" },
    { label: "arrowdown", detail: "shape" },
    { label: "cross", detail: "shape" },
    { label: "labelup", detail: "shape" },
    { label: "labeldown", detail: "shape" },
  ], "property"),
  plot: members("plot", [
    { label: "style_line", detail: "estilo" },
    { label: "style_stepline", detail: "estilo" },
    { label: "style_histogram", detail: "estilo" },
    { label: "style_columns", detail: "estilo" },
    { label: "style_area", detail: "estilo" },
    { label: "style_circles", detail: "estilo" },
    { label: "style_cross", detail: "estilo" },
  ], "property"),
};

/** Namespaces que ofrecemos en texto suelto (al elegirlos escribes `ns` y luego `.`). */
const NAMESPACE_KEYWORDS: Completion[] = Object.keys(NAMESPACE_MEMBERS).map((ns) => ({
  label: ns,
  type: "namespace",
  detail: "namespace",
}));

const KEYWORDS: Completion[] = [
  "var", "varip", "if", "else", "for", "to", "by", "while", "switch",
  "and", "or", "not", "true", "false", "na",
].map((label) => ({ label, type: "keyword" }));

const TOP_LEVEL: Completion[] = [
  fn("indicator", "indicator(title, overlay)"),
  fn("plot", "plot(series, …)"),
  fn("plotshape", "plotshape(series, …)"),
  fn("plotchar", "plotchar(series, …)"),
  fn("hline", "hline(price, …)"),
  fn("fill", "fill(…)"),
  fn("nz", "nz(x, replacement)"),
  fn("na", "na(x) / valor na"),
  fn("fixnan", "fixnan(x)"),
];

const SERIES_VARS: Completion[] = [
  "open", "high", "low", "close", "volume", "time", "bar_index",
  "last_bar_index", "hl2", "hlc3", "ohlc4",
].map((label) => ({ label, type: "variable", detail: "serie" }));

/** Opciones de texto suelto (sin namespace prefijo). */
const TOP_OPTIONS: Completion[] = [
  ...KEYWORDS,
  ...NAMESPACE_KEYWORDS,
  ...TOP_LEVEL,
  ...SERIES_VARS,
];

/**
 * Fuente de autocompletado. Detecta `ns.miembro` con matchBefore y, si no,
 * cae al modo de palabra suelta.
 */
export function pineCompletions(context: CompletionContext): CompletionResult | null {
  // Modo namespace: `ta.<cursor>` (palabra opcional tras el punto).
  const nsMatch = context.matchBefore(/([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z0-9_]*)/);
  if (nsMatch) {
    const dot = nsMatch.text.indexOf(".");
    const ns = nsMatch.text.slice(0, dot);
    const list = NAMESPACE_MEMBERS[ns];
    if (list) {
      return {
        from: nsMatch.from + dot + 1,
        options: list,
        validFor: /^[A-Za-z0-9_]*$/,
      };
    }
    // Namespace desconocido: no autocompletar miembros.
    return null;
  }

  // Modo palabra suelta.
  const word = context.matchBefore(/[A-Za-z_][A-Za-z0-9_]*/);
  if (!word) {
    // Solo abrir explícitamente (Ctrl+Espacio) cuando no hay palabra.
    if (!context.explicit) return null;
    return { from: context.pos, options: TOP_OPTIONS, validFor: /^[A-Za-z0-9_]*$/ };
  }
  if (word.from === word.to && !context.explicit) return null;
  return {
    from: word.from,
    options: TOP_OPTIONS,
    validFor: /^[A-Za-z0-9_]*$/,
  };
}
