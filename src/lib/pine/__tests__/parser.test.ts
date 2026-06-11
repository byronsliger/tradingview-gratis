import { describe, expect, it } from "vitest";
import type { BinaryExpr, CallExpr, Expr, HistAccess, Program, TernaryExpr, UnaryExpr } from "@/lib/pine/ast";
import { PineSyntaxError } from "@/lib/pine/errors";
import { lex } from "@/lib/pine/lexer";
import { parse } from "@/lib/pine/parser";

function parseSrc(src: string): Program {
  return parse(lex(src).tokens);
}

function firstExpr(src: string): Expr {
  const stmt = parseSrc(src).statements[0];
  if (stmt.kind !== "exprStmt") throw new Error(`se esperaba exprStmt, llegó ${stmt.kind}`);
  return stmt.expr;
}

function asBinary(e: Expr): BinaryExpr {
  expect(e.kind).toBe("binary");
  return e as BinaryExpr;
}

describe("parser: precedencia", () => {
  it("* liga más fuerte que +", () => {
    const e = asBinary(firstExpr("1 + 2 * 3"));
    expect(e.op).toBe("+");
    expect(asBinary(e.right).op).toBe("*");
  });

  it("los paréntesis fuerzan agrupación", () => {
    const e = asBinary(firstExpr("(1 + 2) * 3"));
    expect(e.op).toBe("*");
    expect(asBinary(e.left).op).toBe("+");
  });

  it("and liga más fuerte que or", () => {
    const e = asBinary(firstExpr("a or b and c"));
    expect(e.op).toBe("or");
    expect(asBinary(e.right).op).toBe("and");
  });

  it("comparación liga más fuerte que and y más débil que +", () => {
    const e = asBinary(firstExpr("a + b > c and d"));
    expect(e.op).toBe("and");
    const cmp = asBinary(e.left);
    expect(cmp.op).toBe(">");
    expect(asBinary(cmp.left).op).toBe("+");
  });

  it("unario - liga más fuerte que el binario", () => {
    const e = asBinary(firstExpr("-2 + 3"));
    expect(e.op).toBe("+");
    expect(e.left.kind).toBe("unary");
    expect((e.left as UnaryExpr).op).toBe("-");
  });

  it("not liga más fuerte que and", () => {
    const e = asBinary(firstExpr("not a and b"));
    expect(e.op).toBe("and");
    expect((e.left as UnaryExpr).op).toBe("not");
  });
});

describe("parser: ternario", () => {
  it("es la precedencia más baja y asociativo a la derecha", () => {
    const e = firstExpr("a > 1 ? b : c ? d : e") as TernaryExpr;
    expect(e.kind).toBe("ternary");
    expect(e.cond.kind).toBe("binary");
    expect(e.whenFalse.kind).toBe("ternary");
    const inner = e.whenFalse as TernaryExpr;
    expect(inner.whenTrue.kind).toBe("ident");
  });
});

describe("parser: acceso histórico x[n]", () => {
  it("parsea close[1]", () => {
    const e = firstExpr("close[1]") as HistAccess;
    expect(e.kind).toBe("hist");
    expect(e.base.kind).toBe("ident");
    expect(e.offset).toMatchObject({ kind: "number", value: 1 });
    expect(e.nodeId).toBeGreaterThan(0);
  });

  it("acepta expresiones como offset y bases compuestas", () => {
    const e = firstExpr("(close + open)[n + 1]") as HistAccess;
    expect(e.kind).toBe("hist");
    expect(e.base.kind).toBe("binary");
    expect(e.offset.kind).toBe("binary");
  });
});

describe("parser: llamadas", () => {
  it("acepta args posicionales y nombrados, con callSiteId estable", () => {
    const e = firstExpr('plot(close, title="diff", color=color.red)') as CallExpr;
    expect(e.kind).toBe("call");
    expect(e.callee).toMatchObject({ kind: "ident", name: "plot" });
    expect(e.args.map((a) => a.name)).toEqual([null, "title", "color"]);
    expect(e.args[2].value).toMatchObject({ kind: "member", object: "color", property: "red" });
    expect(e.callSiteId).toBeGreaterThan(0);
  });

  it("parsea llamadas de namespace ta.sma(close, 14)", () => {
    const e = firstExpr("ta.sma(close, 14)") as CallExpr;
    expect(e.callee).toMatchObject({ kind: "member", object: "ta", property: "sma" });
    expect(e.args).toHaveLength(2);
  });

  it("asigna callSiteId distintos a llamadas distintas", () => {
    const program = parseSrc("a = ta.sma(close, 9)\nb = ta.sma(close, 9)");
    const ids = program.statements.map((s) => {
      if (s.kind !== "varDecl") throw new Error("varDecl esperado");
      return (s.init as CallExpr).callSiteId;
    });
    expect(ids[0]).not.toBe(ids[1]);
  });
});

describe("parser: declaraciones", () => {
  it("distingue x = expr, var x = expr y x := expr", () => {
    const program = parseSrc("x = 1\nvar y = 2\nx := 3");
    expect(program.statements[0]).toMatchObject({ kind: "varDecl", isVar: false, name: "x" });
    expect(program.statements[1]).toMatchObject({ kind: "varDecl", isVar: true, name: "y" });
    expect(program.statements[2]).toMatchObject({ kind: "assign", name: "x" });
  });
});

describe("parser: errores posicionados", () => {
  it("reporta la coma faltante en plot(ta.sma(close 14)) en la posición exacta", () => {
    const src = "plot(ta.sma(close 14))";
    let caught: PineSyntaxError | null = null;
    try {
      parseSrc(src);
    } catch (err) {
      if (err instanceof PineSyntaxError) caught = err;
      else throw err;
    }
    expect(caught).not.toBeNull();
    expect(caught!.message).toContain("','");
    expect(caught!.line).toBe(1);
    expect(caught!.col).toBe(19); // apunta al '14'
  });

  it("reporta expresión faltante tras '='", () => {
    expect(() => parseSrc("x = ")).toThrow(PineSyntaxError);
  });

  it("rechaza indentación inesperada (los bloques llegan en Fase 5)", () => {
    expect(() => parseSrc("a = 1\n    b = 2")).toThrow(/Indentación inesperada/);
  });

  it("rechaza paréntesis sin cerrar", () => {
    expect(() => parseSrc("plot(close")).toThrow(PineSyntaxError);
  });
});
