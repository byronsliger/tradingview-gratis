export type TokenType =
  | "number"
  | "string"
  | "color"
  | "ident"
  | "keyword"
  | "op"
  | "newline"
  | "indent"
  | "dedent"
  | "eof";

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
  start: number;
  end: number;
}

/** Palabras reservadas. Las de control de flujo se reservan ya, aunque lleguen en Fase 5. */
export const KEYWORDS = new Set([
  "var",
  "varip",
  "and",
  "or",
  "not",
  "true",
  "false",
  "if",
  "else",
  "for",
  "to",
  "by",
  "while",
  "switch",
  "type",
]);
