import { describe, expect, it } from "vitest";
import { PineSyntaxError } from "@/lib/pine/errors";
import { lex } from "@/lib/pine/lexer";

const compact = (src: string): string[] =>
  lex(src).tokens.map((t) => (t.value === "" || t.value === "\n" ? t.type : `${t.type}:${t.value}`));

describe("lexer: tokens básicos", () => {
  it("tokeniza identificadores, operadores y números", () => {
    expect(compact("x = close + 1")).toEqual([
      "ident:x",
      "op:=",
      "ident:close",
      "op:+",
      "number:1",
      "newline",
      "eof",
    ]);
  });

  it("distingue keywords de identificadores", () => {
    const tokens = lex("var x = not true and false or y").tokens;
    const kinds = tokens.map((t) => `${t.type}:${t.value}`);
    expect(kinds).toContain("keyword:var");
    expect(kinds).toContain("keyword:not");
    expect(kinds).toContain("keyword:and");
    expect(kinds).toContain("keyword:or");
    expect(kinds).toContain("keyword:true");
    expect(kinds).toContain("keyword:false");
    expect(kinds).toContain("ident:x");
    expect(kinds).toContain("ident:y");
  });

  it("tokeniza operadores de dos caracteres", () => {
    expect(compact("a := b == c != d <= e >= f")).toEqual([
      "ident:a",
      "op::=",
      "ident:b",
      "op:==",
      "ident:c",
      "op:!=",
      "ident:d",
      "op:<=",
      "ident:e",
      "op:>=",
      "ident:f",
      "newline",
      "eof",
    ]);
  });
});

describe("lexer: números", () => {
  it("acepta enteros, decimales, .5 y notación científica", () => {
    const tokens = lex("10 1.5 .5 2e3 1.2e-4").tokens.filter((t) => t.type === "number");
    expect(tokens.map((t) => t.value)).toEqual(["10", "1.5", ".5", "2e3", "1.2e-4"]);
  });
});

describe("lexer: strings", () => {
  it("acepta comillas dobles y simples con escapes", () => {
    const tokens = lex(`a = "ho\\"la"\nb = 'x\\ny'`).tokens.filter((t) => t.type === "string");
    expect(tokens[0].value).toBe('ho"la');
    expect(tokens[1].value).toBe("x\ny");
  });

  it("lanza error posicionado con cadena sin cerrar", () => {
    expect(() => lex('a = "abierta')).toThrow(PineSyntaxError);
  });
});

describe("lexer: colores", () => {
  it("acepta #rrggbb y #rrggbbaa", () => {
    const tokens = lex("c = #ff0000\nd = #00FF00aa").tokens.filter((t) => t.type === "color");
    expect(tokens.map((t) => t.value)).toEqual(["#ff0000", "#00FF00aa"]);
  });

  it("rechaza colores con longitud inválida", () => {
    expect(() => lex("c = #ff00")).toThrow(PineSyntaxError);
  });
});

describe("lexer: comentarios y versión", () => {
  it("ignora comentarios // y no genera tokens para ellos", () => {
    expect(compact("x = 1 // hola mundo")).toEqual([
      "ident:x",
      "op:=",
      "number:1",
      "newline",
      "eof",
    ]);
  });

  it("extrae //@version=N", () => {
    expect(lex("//@version=5\nplot(close)").version).toBe(5);
    expect(lex("plot(close)").version).toBeNull();
  });
});

describe("lexer: INDENT/DEDENT", () => {
  it("emite indent al subir y dedent al bajar de nivel", () => {
    const src = "a = 1\nif b\n    c = 2\nd = 4";
    expect(compact(src)).toEqual([
      "ident:a",
      "op:=",
      "number:1",
      "newline",
      "keyword:if",
      "ident:b",
      "newline",
      "indent",
      "ident:c",
      "op:=",
      "number:2",
      "newline",
      "dedent",
      "ident:d",
      "op:=",
      "number:4",
      "newline",
      "eof",
    ]);
  });

  it("cierra todos los niveles abiertos al final del archivo", () => {
    const src = "if a\n    if b\n        c = 1";
    const types = lex(src).tokens.map((t) => t.type);
    expect(types.filter((t) => t === "indent")).toHaveLength(2);
    expect(types.filter((t) => t === "dedent")).toHaveLength(2);
  });

  it("las líneas en blanco y solo-comentario no afectan la indentación", () => {
    const src = "if b\n    c = 2\n\n// comentario al margen\n    e = 3";
    const types = lex(src).tokens.map((t) => t.type);
    expect(types.filter((t) => t === "indent")).toHaveLength(1);
    // un único dedent: el de cierre al final del archivo
    expect(types.filter((t) => t === "dedent")).toHaveLength(1);
  });

  it("no emite indent en líneas de continuación", () => {
    const src = "x = 1 +\n  2";
    expect(compact(src)).toEqual([
      "ident:x",
      "op:=",
      "number:1",
      "op:+",
      "number:2",
      "newline",
      "eof",
    ]);
  });

  it("lanza error con indentación inconsistente", () => {
    expect(() => lex("if a\n    b = 1\n  c = 2")).toThrow(PineSyntaxError);
  });
});

describe("lexer: posiciones", () => {
  it("asigna línea y columna 1-based a cada token", () => {
    const tokens = lex("a = 1\nbb = 22").tokens;
    const tok22 = tokens.find((t) => t.value === "22");
    expect(tok22).toMatchObject({ type: "number", line: 2, col: 6, start: 11, end: 13 });
    const tokA = tokens[0];
    expect(tokA).toMatchObject({ type: "ident", value: "a", line: 1, col: 1, start: 0, end: 1 });
  });
});
