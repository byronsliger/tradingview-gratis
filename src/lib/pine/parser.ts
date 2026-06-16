import type {
  BinaryOp,
  CallArg,
  Expr,
  Identifier,
  MemberExpr,
  Program,
  Stmt,
  UnaryOp,
} from "./ast";
import { PineSyntaxError, type SourcePos } from "./errors";
import type { Token } from "./tokens";

// Precedencias de Pine (mayor = más fuerte). El ternario va aparte, por debajo de todas.
const BIN_PREC: Record<string, number> = {
  or: 1,
  and: 2,
  "==": 3,
  "!=": 3,
  "<": 4,
  "<=": 4,
  ">": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6,
};

function posOf(t: SourcePos): SourcePos {
  return { line: t.line, col: t.col, start: t.start, end: t.end };
}

function span(a: SourcePos, b: SourcePos): SourcePos {
  return { line: a.line, col: a.col, start: a.start, end: b.end };
}

class Parser {
  private pos = 0;
  private nextNodeId = 1;

  constructor(private readonly tokens: Token[]) {}

  parseProgram(): Program {
    const statements: Stmt[] = [];
    while (!this.check("eof")) {
      if (this.check("newline") || this.check("dedent")) {
        this.advance();
        continue;
      }
      if (this.check("indent")) {
        throw this.fail(this.peek(), "Indentación inesperada (los bloques llegan en Fase 5)");
      }
      statements.push(this.parseStatement());
      this.expectStatementEnd();
    }
    return { statements };
  }

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  private advance(): Token {
    const t = this.tokens[this.pos];
    if (t.type !== "eof") this.pos++;
    return t;
  }

  private check(type: Token["type"], value?: string): boolean {
    const t = this.peek();
    return t.type === type && (value === undefined || t.value === value);
  }

  private fail(token: Token, expected: string): PineSyntaxError {
    const found =
      token.type === "newline" ? "salto de línea"
        : token.type === "eof" ? "fin del archivo"
          : token.type === "indent" ? "indentación"
            : token.type === "dedent" ? "fin de indentación"
              : `'${token.value}'`;
    return new PineSyntaxError(`${expected}, pero se encontró ${found}`, posOf(token));
  }

  private expectOp(value: string, what = `Se esperaba '${value}'`): Token {
    if (this.check("op", value)) return this.advance();
    throw this.fail(this.peek(), what);
  }

  private expectIdent(): Token {
    if (this.check("ident")) return this.advance();
    throw this.fail(this.peek(), "Se esperaba un identificador");
  }

  private expectStatementEnd(): void {
    if (this.check("newline")) {
      this.advance();
      return;
    }
    if (this.check("eof") || this.check("dedent")) return;
    throw this.fail(this.peek(), "Se esperaba el final de la instrucción");
  }

  private parseStatement(): Stmt {
    const t = this.peek();
    if (t.type === "keyword" && (t.value === "var" || t.value === "varip")) {
      this.advance();
      const name = this.expectIdent();
      this.expectOp("=");
      const init = this.parseExpr();
      return { kind: "varDecl", isVar: true, name: name.value, init, ...span(t, init) };
    }
    if (t.type === "ident" && this.peek(1).type === "op" && this.peek(1).value === "=") {
      this.advance();
      this.advance();
      const init = this.parseExpr();
      return { kind: "varDecl", isVar: false, name: t.value, init, ...span(t, init) };
    }
    if (t.type === "ident" && this.peek(1).type === "op" && this.peek(1).value === ":=") {
      this.advance();
      this.advance();
      const value = this.parseExpr();
      return { kind: "assign", name: t.value, value, ...span(t, value) };
    }
    const expr = this.parseExpr();
    return { kind: "exprStmt", expr, ...posOf(expr) };
  }

  // Ternario: la precedencia más baja, asociativo a la derecha.
  private parseExpr(): Expr {
    const cond = this.parseBinary(1);
    if (this.check("op", "?")) {
      this.advance();
      const whenTrue = this.parseExpr();
      this.expectOp(":", "Se esperaba ':' del operador ternario");
      const whenFalse = this.parseExpr();
      return { kind: "ternary", cond, whenTrue, whenFalse, ...span(cond, whenFalse) };
    }
    return cond;
  }

  private parseBinary(minPrec: number): Expr {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      const opValue = t.type === "op" || t.type === "keyword" ? t.value : "";
      const prec = BIN_PREC[opValue];
      if (prec === undefined || prec < minPrec) break;
      this.advance();
      const right = this.parseBinary(prec + 1);
      left = { kind: "binary", op: opValue as BinaryOp, left, right, ...span(left, right) };
    }
    return left;
  }

  private parseUnary(): Expr {
    const t = this.peek();
    const isUnary =
      (t.type === "op" && (t.value === "-" || t.value === "+")) ||
      (t.type === "keyword" && t.value === "not");
    if (isUnary) {
      this.advance();
      const operand = this.parseUnary();
      return { kind: "unary", op: t.value as UnaryOp, operand, ...span(t, operand) };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expr {
    let expr = this.parsePrimary();
    for (;;) {
      if (this.check("op", ".")) {
        if (expr.kind !== "ident") {
          throw this.fail(this.peek(), "El acceso con '.' solo se admite sobre un namespace (ta, math, color)");
        }
        this.advance();
        const prop = this.expectIdent();
        expr = {
          kind: "member",
          object: expr.name,
          property: prop.value,
          nodeId: this.nextNodeId++,
          ...span(expr, prop),
        } satisfies MemberExpr;
      } else if (this.check("op", "(")) {
        if (expr.kind !== "ident" && expr.kind !== "member") {
          throw this.fail(this.peek(), "Esta expresión no es invocable");
        }
        this.advance();
        const { args, closeTok } = this.parseCallArgs();
        expr = {
          kind: "call",
          callee: expr as Identifier | MemberExpr,
          args,
          callSiteId: this.nextNodeId++,
          ...span(expr, closeTok),
        };
      } else if (this.check("op", "[")) {
        this.advance();
        const offset = this.parseExpr();
        const closeTok = this.expectOp("]", "Se esperaba ']'");
        expr = { kind: "hist", base: expr, offset, nodeId: this.nextNodeId++, ...span(expr, closeTok) };
      } else {
        break;
      }
    }
    return expr;
  }

  private parseCallArgs(): { args: CallArg[]; closeTok: Token } {
    const args: CallArg[] = [];
    if (this.check("op", ")")) {
      return { args, closeTok: this.advance() };
    }
    for (;;) {
      let name: string | null = null;
      if (this.check("ident") && this.peek(1).type === "op" && this.peek(1).value === "=") {
        name = this.advance().value;
        this.advance();
      }
      const value = this.parseExpr();
      args.push({ name, value });
      if (this.check("op", ",")) {
        this.advance();
        continue;
      }
      const closeTok = this.expectOp(")", "Se esperaba ',' o ')'");
      return { args, closeTok };
    }
  }

  private parsePrimary(): Expr {
    const t = this.peek();
    switch (t.type) {
      case "number":
        this.advance();
        return { kind: "number", value: parseFloat(t.value), ...posOf(t) };
      case "string":
        this.advance();
        return { kind: "string", value: t.value, ...posOf(t) };
      case "color":
        this.advance();
        return { kind: "color", value: t.value, ...posOf(t) };
      case "ident":
        this.advance();
        return { kind: "ident", name: t.value, ...posOf(t) };
      case "keyword":
        if (t.value === "true" || t.value === "false") {
          this.advance();
          return { kind: "bool", value: t.value === "true", ...posOf(t) };
        }
        throw this.fail(t, `'${t.value}' aún no está soportado en esta fase`);
      case "op":
        if (t.value === "(") {
          this.advance();
          const inner = this.parseExpr();
          this.expectOp(")", "Se esperaba ')'");
          return inner;
        }
        if (t.value === "[") {
          // Array literal: solo tiene sentido como `options=[...]` de input.*
          this.advance();
          const elements: Expr[] = [];
          if (!this.check("op", "]")) {
            for (;;) {
              elements.push(this.parseExpr());
              if (this.check("op", ",")) {
                this.advance();
                continue;
              }
              break;
            }
          }
          const closeTok = this.expectOp("]", "Se esperaba ']' del array");
          return { kind: "array", elements, ...span(t, closeTok) };
        }
        break;
      default:
        break;
    }
    throw this.fail(t, "Se esperaba una expresión");
  }
}

export function parse(tokens: Token[]): Program {
  return new Parser(tokens).parseProgram();
}
