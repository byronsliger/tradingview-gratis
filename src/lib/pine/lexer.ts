import { PineSyntaxError } from "./errors";
import { KEYWORDS, type Token, type TokenType } from "./tokens";

export interface LexResult {
  tokens: Token[];
  /** Versión declarada con //@version=N, o null si no aparece. */
  version: number | null;
}

const TAB_WIDTH = 4;

// Continuación de línea — decisión documentada: Pine real trata como continuación
// cualquier línea con más indentación que el statement actual que no abre bloque.
// Replicarlo exige diferir la emisión de NEWLINE hasta conocer la indentación de la
// línea siguiente, así que usamos la regla simplificada prevista en el plan: hay
// continuación cuando el paréntesis/corchete sigue abierto, o cuando la línea
// anterior termina en operador binario, coma, '?', ':', '=', ':=', '=>', '.' o en
// 'and'/'or'/'not'. Cubre los scripts del subset de Fase 1.
const CONT_OPS = new Set([
  "+", "-", "*", "/", "%",
  "==", "!=", "<", "<=", ">", ">=",
  "=", ":=", "=>", "?", ":", ",", ".", "(", "[",
]);
const CONT_KEYWORDS = new Set(["and", "or", "not"]);

const TWO_CHAR_OPS = new Set([":=", "==", "!=", "<=", ">=", "=>"]);
const ONE_CHAR_OPS = new Set(["+", "-", "*", "/", "%", "<", ">", "=", "?", ":", ",", "(", ")", "[", "]", "."]);

const VERSION_RE = /^\/\/@version\s*=\s*(\d+)/;

function isDigit(c: string | undefined): boolean {
  return c !== undefined && c >= "0" && c <= "9";
}

function isHexDigit(c: string | undefined): boolean {
  return c !== undefined && /[0-9a-fA-F]/.test(c);
}

function isIdentStart(c: string | undefined): boolean {
  return c !== undefined && /[A-Za-z_]/.test(c);
}

function isIdentPart(c: string | undefined): boolean {
  return c !== undefined && /[A-Za-z0-9_]/.test(c);
}

export function lex(source: string): LexResult {
  const tokens: Token[] = [];
  const indents: number[] = [0];
  let version: number | null = null;
  let i = 0;
  let line = 1;
  let col = 1;
  let parenDepth = 0;
  let continuation = false;
  let atLineStart = true;

  const fail = (message: string, fLine: number, fCol: number, start: number, end: number): never => {
    throw new PineSyntaxError(message, { line: fLine, col: fCol, start, end });
  };

  const push = (type: TokenType, value: string, tLine: number, tCol: number, start: number, end: number): void => {
    tokens.push({ type, value, line: tLine, col: tCol, start, end });
  };

  const last = (): Token | undefined => tokens[tokens.length - 1];

  while (i < source.length) {
    if (atLineStart) {
      let indent = 0;
      while (i < source.length && (source[i] === " " || source[i] === "\t")) {
        indent += source[i] === "\t" ? TAB_WIDTH : 1;
        i++;
        col++;
      }
      atLineStart = false;
      const next = source[i];
      if (next === undefined || next === "\n" || next === "\r") continue; // línea en blanco
      if (next === "/" && source[i + 1] === "/") continue; // línea solo-comentario: no afecta la indentación
      if (!continuation && parenDepth === 0) {
        const top = indents[indents.length - 1];
        if (indent > top) {
          indents.push(indent);
          push("indent", "", line, col, i, i);
        } else {
          while (indent < indents[indents.length - 1]) {
            indents.pop();
            push("dedent", "", line, col, i, i);
          }
          if (indent !== indents[indents.length - 1]) {
            fail("Indentación inconsistente", line, col, i, i);
          }
        }
      }
      continuation = false;
      continue;
    }

    const ch = source[i];

    if (ch === "\r") {
      i++;
      continue;
    }

    if (ch === "\n") {
      if (parenDepth === 0) {
        const prev = last();
        if (prev && prev.type !== "newline" && prev.type !== "indent" && prev.type !== "dedent") {
          const isCont =
            (prev.type === "op" && CONT_OPS.has(prev.value)) ||
            (prev.type === "keyword" && CONT_KEYWORDS.has(prev.value));
          if (isCont) continuation = true;
          else push("newline", "\n", line, col, i, i + 1);
        }
      }
      i++;
      line++;
      col = 1;
      atLineStart = true;
      continue;
    }

    if (ch === " " || ch === "\t") {
      i++;
      col++;
      continue;
    }

    if (ch === "/" && source[i + 1] === "/") {
      const start = i;
      while (i < source.length && source[i] !== "\n") {
        i++;
        col++;
      }
      const text = source.slice(start, i);
      const m = VERSION_RE.exec(text);
      if (m) version = parseInt(m[1], 10);
      continue;
    }

    if (isDigit(ch) || (ch === "." && isDigit(source[i + 1]))) {
      const start = i;
      const sLine = line;
      const sCol = col;
      while (isDigit(source[i])) { i++; col++; }
      // cubre también ".5": el punto inicial garantizó un dígito después
      if (source[i] === "." && isDigit(source[i + 1])) {
        i++; col++;
        while (isDigit(source[i])) { i++; col++; }
      }
      if (source[i] === "e" || source[i] === "E") {
        const sign = source[i + 1] === "+" || source[i + 1] === "-" ? 1 : 0;
        if (isDigit(source[i + 1 + sign])) {
          i += 1 + sign;
          col += 1 + sign;
          while (isDigit(source[i])) { i++; col++; }
        }
      }
      push("number", source.slice(start, i), sLine, sCol, start, i);
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      const start = i;
      const sLine = line;
      const sCol = col;
      i++;
      col++;
      let value = "";
      while (i < source.length && source[i] !== quote && source[i] !== "\n") {
        if (source[i] === "\\") {
          const esc = source[i + 1];
          value += esc === "n" ? "\n" : esc === "t" ? "\t" : esc ?? "";
          i += 2;
          col += 2;
        } else {
          value += source[i];
          i++;
          col++;
        }
      }
      if (source[i] !== quote) fail("Cadena sin cerrar", sLine, sCol, start, i);
      i++;
      col++;
      push("string", value, sLine, sCol, start, i);
      continue;
    }

    if (ch === "#") {
      const start = i;
      const sLine = line;
      const sCol = col;
      i++;
      col++;
      let hex = "";
      while (isHexDigit(source[i]) && hex.length < 8) {
        hex += source[i];
        i++;
        col++;
      }
      if (hex.length !== 6 && hex.length !== 8) {
        fail("Color inválido: se esperaba #rrggbb o #rrggbbaa", sLine, sCol, start, i);
      }
      push("color", "#" + hex, sLine, sCol, start, i);
      continue;
    }

    if (isIdentStart(ch)) {
      const start = i;
      const sLine = line;
      const sCol = col;
      while (isIdentPart(source[i])) { i++; col++; }
      const value = source.slice(start, i);
      push(KEYWORDS.has(value) ? "keyword" : "ident", value, sLine, sCol, start, i);
      continue;
    }

    const two = source.slice(i, i + 2);
    if (TWO_CHAR_OPS.has(two)) {
      push("op", two, line, col, i, i + 2);
      i += 2;
      col += 2;
      continue;
    }
    if (ONE_CHAR_OPS.has(ch)) {
      if (ch === "(" || ch === "[") parenDepth++;
      else if (ch === ")" || ch === "]") parenDepth = Math.max(0, parenDepth - 1);
      push("op", ch, line, col, i, i + 1);
      i++;
      col++;
      continue;
    }

    fail(`Carácter inesperado '${ch}'`, line, col, i, i + 1);
  }

  const prev = last();
  if (prev && prev.type !== "newline" && prev.type !== "indent" && prev.type !== "dedent") {
    push("newline", "\n", line, col, source.length, source.length);
  }
  while (indents.length > 1) {
    indents.pop();
    push("dedent", "", line, col, source.length, source.length);
  }
  push("eof", "", line, col, source.length, source.length);

  return { tokens, version };
}
