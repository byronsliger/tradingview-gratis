import {
  HighlightStyle,
  StreamLanguage,
  type StreamParser,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";

/**
 * Soporte de lenguaje Pine para CodeMirror 6 vía StreamLanguage.
 * Tokenizer ligero (sin gramática Lezer): el parser real del motor ya da los
 * diagnósticos exactos vía pine-lint.ts — aquí solo coloreamos.
 */

const KEYWORDS = new Set([
  "var",
  "varip",
  "if",
  "else",
  "for",
  "to",
  "by",
  "while",
  "switch",
  "and",
  "or",
  "not",
]);

/** Namespaces de builtins: `ns.miembro` se colorea como builtin completo. */
const NAMESPACES = new Set([
  "ta",
  "math",
  "input",
  "color",
  "str",
  "array",
  "matrix",
  "request",
  "syminfo",
  "timeframe",
  "barstate",
  "session",
  "location",
  "shape",
  "size",
  "display",
  "format",
  "plot",
  "label",
  "line",
]);

const BUILTIN_FUNCS = new Set([
  "indicator",
  "plot",
  "plotshape",
  "plotchar",
  "plotcandle",
  "plotbar",
  "hline",
  "fill",
  "bgcolor",
  "barcolor",
  "alertcondition",
  "nz",
  "fixnan",
]);

/** Series builtin del contexto de barra. */
const SERIES_VARS = new Set([
  "open",
  "high",
  "low",
  "close",
  "volume",
  "time",
  "bar_index",
  "last_bar_index",
  "hl2",
  "hlc3",
  "ohlc4",
]);

interface PineStreamState {
  // El tokenizer es línea a línea y sin estado multilinea (strings y
  // comentarios de Pine no cruzan líneas), pero StreamParser exige un objeto.
  _unused?: never;
}

const pineStreamParser: StreamParser<PineStreamState> = {
  name: "pine",
  startState: () => ({}),
  token(stream) {
    if (stream.eatSpace()) return null;

    // Comentario de línea (incluye la directiva //@version=5)
    if (stream.match("//")) {
      stream.skipToEnd();
      return "comment";
    }

    // Color literal #rrggbb / #rrggbbaa / #rgb
    if (stream.match(/^#[0-9a-fA-F]{3,8}\b/)) return "colorLiteral";

    const ch = stream.peek();

    // Strings "…" o '…' (una sola línea, con escapes \")
    if (ch === '"' || ch === "'") {
      stream.next();
      let escaped = false;
      for (;;) {
        const next = stream.next();
        if (next == null) break;
        if (next === ch && !escaped) break;
        escaped = !escaped && next === "\\";
      }
      return "string";
    }

    // Números: enteros, decimales y notación científica
    if (stream.match(/^\d+(\.\d*)?([eE][+-]?\d+)?/) || stream.match(/^\.\d+([eE][+-]?\d+)?/)) {
      return "number";
    }

    // Identificadores, keywords y builtins
    const ident = stream.match(/^[A-Za-z_][A-Za-z0-9_]*/) as RegExpMatchArray | null;
    if (ident) {
      const word = ident[0];
      if (KEYWORDS.has(word)) return "keyword";
      if (word === "true" || word === "false") return "bool";
      if (word === "na") return "atom";
      // ns.miembro(.sub)* → builtin (ta.ema, color.new, plot.style_line, …)
      // Nota: el nombre es "pineBuiltin" porque "builtin" ya existe en la
      // tabla legacy del stream-parser (mapea a variableName.standard).
      if (NAMESPACES.has(word) && stream.match(/^\.[A-Za-z_][A-Za-z0-9_.]*/)) return "pineBuiltin";
      if (BUILTIN_FUNCS.has(word)) return "pineBuiltin";
      if (SERIES_VARS.has(word)) return "seriesVar";
      return "variableName";
    }

    // Operadores (incluye := de Pine y => de funciones)
    if (stream.match(/^(:=|==|!=|<=|>=|=>|[+\-*/%<>=?:])/)) return "operator";

    // Puntuación
    if (stream.match(/^[()[\],.]/)) return "punctuation";

    stream.next();
    return null;
  },
  languageData: {
    commentTokens: { line: "//" },
    closeBrackets: { brackets: ["(", "[", '"', "'"] },
  },
  tokenTable: {
    pineBuiltin: tags.function(tags.variableName),
    seriesVar: tags.special(tags.variableName),
    colorLiteral: tags.color,
  },
};

export const pineLanguage = StreamLanguage.define(pineStreamParser);

/** Paleta oscura acorde a TV_COLORS (fondo #131722, texto #d1d4dc). */
export const pineHighlightDark = HighlightStyle.define([
  { tag: tags.comment, color: "#787b86", fontStyle: "italic" },
  { tag: tags.keyword, color: "#bb80ff" },
  { tag: [tags.bool, tags.atom], color: "#56b6c2" },
  { tag: tags.number, color: "#e5b567" },
  { tag: tags.string, color: "#26a69a" },
  { tag: tags.color, color: "#ffb74d" },
  { tag: tags.function(tags.variableName), color: "#5b9cf6" },
  { tag: tags.special(tags.variableName), color: "#ef9a9a" },
  { tag: tags.variableName, color: "#d1d4dc" },
  { tag: tags.operator, color: "#9598a1" },
  { tag: tags.punctuation, color: "#787b86" },
]);

/** Paleta clara acorde a TV_COLORS_LIGHT (fondo #ffffff, texto #131722). */
export const pineHighlightLight = HighlightStyle.define([
  { tag: tags.comment, color: "#787b86", fontStyle: "italic" },
  { tag: tags.keyword, color: "#7c3aed" },
  { tag: [tags.bool, tags.atom], color: "#0e7490" },
  { tag: tags.number, color: "#b45309" },
  { tag: tags.string, color: "#0f766e" },
  { tag: tags.color, color: "#c2410c" },
  { tag: tags.function(tags.variableName), color: "#2962ff" },
  { tag: tags.special(tags.variableName), color: "#c2185b" },
  { tag: tags.variableName, color: "#131722" },
  { tag: tags.operator, color: "#50535e" },
  { tag: tags.punctuation, color: "#787b86" },
]);
