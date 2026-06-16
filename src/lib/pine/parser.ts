import type {
  BinaryOp,
  CallArg,
  Expr,
  Identifier,
  IfBranch,
  MemberExpr,
  Program,
  Stmt,
  SwitchCase,
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

/**
 * ¿El statement consume su propio terminador (un bloque indentado cerrado por
 * DEDENT)? En ese caso parseProgram/parseBlock no deben exigir un statement-end
 * extra. Cubre if/for/funcDecl y las asignaciones cuyo RHS es un if/switch-expr.
 */
function isBlockStmt(stmt: Stmt): boolean {
  if (stmt.kind === "ifStmt" || stmt.kind === "forStmt" || stmt.kind === "funcDecl") {
    return true;
  }
  if (stmt.kind === "varDecl") return endsInBlock(stmt.init);
  if (stmt.kind === "tupleDecl") return endsInBlock(stmt.init);
  if (stmt.kind === "exprStmt") return endsInBlock(stmt.expr);
  return false;
}

function endsInBlock(e: Expr): boolean {
  return e.kind === "ifExpr" || e.kind === "switchExpr";
}

/** Calificadores de tipo opcionales en declaraciones (`float x = …`). */
const TYPE_QUALIFIERS = new Set(["int", "float", "bool", "string", "color", "series", "simple"]);

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
        throw this.fail(this.peek(), "Indentación inesperada");
      }
      const stmt = this.parseStatement();
      statements.push(stmt);
      if (!isBlockStmt(stmt)) this.expectStatementEnd();
    }
    return { statements };
  }

  /** Salta newlines y dedents sobrantes entre statements de un mismo bloque. */
  private skipBlankLines(): void {
    while (this.check("newline")) this.advance();
  }

  /**
   * Bloque indentado: tras un NEWLINE se espera INDENT, luego N statements y un
   * DEDENT de cierre. Se usa por if/else/for/switch y cuerpos de función.
   */
  private parseBlock(): Stmt[] {
    this.skipBlankLines();
    if (!this.check("indent")) {
      throw this.fail(this.peek(), "Se esperaba un bloque indentado");
    }
    this.advance();
    const statements: Stmt[] = [];
    while (!this.check("dedent") && !this.check("eof")) {
      if (this.check("newline")) {
        this.advance();
        continue;
      }
      const stmt = this.parseStatement();
      statements.push(stmt);
      if (!isBlockStmt(stmt)) this.expectStatementEnd();
    }
    if (this.check("dedent")) this.advance();
    if (statements.length === 0) {
      throw this.fail(this.peek(), "El bloque no puede estar vacío");
    }
    return statements;
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

    if (t.type === "keyword") {
      if (t.value === "if") return this.parseIfStmt();
      if (t.value === "for") return this.parseForStmt();
      if (t.value === "var" || t.value === "varip") return this.parseVarDecl(t);
    }

    // break / continue (identifiers, no reservados en Pine).
    if (t.type === "ident" && (t.value === "break" || t.value === "continue")) {
      // Solo si no es el comienzo de una asignación/llamada (siguen otra cosa).
      const next = this.peek(1);
      const isStandalone =
        next.type === "newline" || next.type === "dedent" || next.type === "eof";
      if (isStandalone) {
        this.advance();
        return t.value === "break"
          ? { kind: "break", ...posOf(t) }
          : { kind: "continue", ...posOf(t) };
      }
    }

    // Destructuring de tupla: `[a, b] = expr` (solo si tras el `]` hay un `=`).
    // Si no, `[a, b]` es un literal de tupla como expresión — p. ej. el valor de
    // retorno de una función: `dirmov(len) => ... \n [plus, minus]`.
    if (t.type === "op" && t.value === "[" && this.tupleDeclAhead()) {
      return this.parseTupleDecl(t, false);
    }

    // Función de usuario: `f(args) => ...`. Lookahead hasta el `=>` tras el ')'.
    if (t.type === "ident" && this.peek(1).type === "op" && this.peek(1).value === "(") {
      const arrow = this.findArrowAfterParen(1);
      if (arrow) return this.parseFuncDecl(t);
    }

    // Declaración tipada sin var: `float x = …`, `int n = …`.
    if (
      t.type === "ident" &&
      TYPE_QUALIFIERS.has(t.value) &&
      this.peek(1).type === "ident" &&
      this.peek(2).type === "op" &&
      this.peek(2).value === "="
    ) {
      this.advance(); // tipo
      const name = this.advance(); // nombre
      this.advance(); // '='
      const init = this.parseExpr();
      return { kind: "varDecl", isVar: false, name: name.value, init, ...span(t, init) };
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

  private parseVarDecl(t: Token): Stmt {
    this.advance();
    this.skipTypeQualifier();
    if (this.check("op", "[")) {
      const open = this.peek();
      return this.parseTupleDecl(open, true, t);
    }
    const name = this.expectIdent();
    this.expectOp("=");
    const init = this.parseExpr();
    return { kind: "varDecl", isVar: true, name: name.value, init, ...span(t, init) };
  }

  /** Consume un calificador de tipo opcional (`float`, `int`, …) en declaraciones. */
  private skipTypeQualifier(): void {
    const t = this.peek();
    if (
      t.type === "ident" &&
      TYPE_QUALIFIERS.has(t.value) &&
      this.peek(1).type === "ident"
    ) {
      this.advance();
    }
  }

  /**
   * Lookahead: ¿el `[` actual abre una desestructuración `[a, b] = …`?
   * Escanea hasta el `]` que cierra y comprueba si le sigue un `=`. Si no,
   * es un literal de tupla en posición de expresión (valor de retorno).
   */
  private tupleDeclAhead(): boolean {
    let depth = 0;
    for (let i = 0; ; i++) {
      const tk = this.peek(i);
      if (tk.type === "eof") return false;
      if (tk.type === "op" && tk.value === "[") {
        depth++;
      } else if (tk.type === "op" && tk.value === "]") {
        depth--;
        if (depth === 0) {
          const next = this.peek(i + 1);
          return next.type === "op" && next.value === "=";
        }
      }
    }
  }

  private parseTupleDecl(open: Token, isVar: boolean, varTok?: Token): Stmt {
    this.expectOp("[");
    const names: string[] = [];
    for (;;) {
      names.push(this.expectIdent().value);
      if (this.check("op", ",")) {
        this.advance();
        continue;
      }
      break;
    }
    this.expectOp("]", "Se esperaba ']' en el destructuring de tupla");
    this.expectOp("=", "Se esperaba '=' tras [a, b]");
    const init = this.parseExpr();
    return {
      kind: "tupleDecl",
      isVar,
      names,
      init,
      ...span(varTok ?? open, init),
    };
  }

  /** ¿Hay un `=>` justo tras el grupo de paréntesis que abre en `peek(open)`? */
  private findArrowAfterParen(open: number): boolean {
    let depth = 0;
    let i = open;
    for (;;) {
      const tk = this.peek(i);
      if (tk.type === "eof" || tk.type === "newline") return false;
      if (tk.type === "op" && tk.value === "(") depth++;
      else if (tk.type === "op" && tk.value === ")") {
        depth--;
        if (depth === 0) {
          const after = this.peek(i + 1);
          return after.type === "op" && after.value === "=>";
        }
      }
      i++;
    }
  }

  private parseFuncDecl(nameTok: Token): Stmt {
    this.advance(); // nombre
    this.expectOp("(");
    const params: string[] = [];
    if (!this.check("op", ")")) {
      for (;;) {
        params.push(this.expectIdent().value);
        if (this.check("op", ",")) {
          this.advance();
          continue;
        }
        break;
      }
    }
    this.expectOp(")", "Se esperaba ')' en la lista de parámetros");
    this.expectOp("=>", "Se esperaba '=>' en la definición de función");
    let body: Stmt[];
    if (this.check("newline")) {
      this.advance();
      body = this.parseBlock();
    } else {
      const expr = this.parseExpr();
      body = [{ kind: "exprStmt", expr, ...posOf(expr) }];
    }
    const last = body[body.length - 1];
    return {
      kind: "funcDecl",
      name: nameTok.value,
      params,
      body,
      ...span(nameTok, last),
    };
  }

  private parseIfStmt(): Stmt {
    const t = this.peek(); // 'if'
    this.advance();
    const cond = this.parseExpr();
    this.expectStatementEnd();
    const then = this.parseBlock();
    let elseBranch: Stmt[] | null = null;
    this.skipBlankLines();
    if (this.check("keyword", "else")) {
      this.advance();
      if (this.check("keyword", "if")) {
        elseBranch = [this.parseIfStmt()];
      } else {
        if (this.check("newline")) this.advance();
        elseBranch = this.parseBlock();
      }
    }
    const lastStmt = (elseBranch ?? then)[(elseBranch ?? then).length - 1];
    return { kind: "ifStmt", cond, then, elseBranch, ...span(t, lastStmt) };
  }

  private parseForStmt(): Stmt {
    const t = this.peek(); // 'for'
    this.advance();
    const name = this.expectIdent();
    this.expectOp("=", "Se esperaba '=' en el bucle for");
    const from = this.parseExpr();
    if (!this.check("keyword", "to")) {
      throw this.fail(this.peek(), "Se esperaba 'to' en el bucle for");
    }
    this.advance();
    const to = this.parseExpr();
    let step: Expr | null = null;
    if (this.check("keyword", "by")) {
      this.advance();
      step = this.parseExpr();
    }
    this.expectStatementEnd();
    const body = this.parseBlock();
    return {
      kind: "forStmt",
      varName: name.value,
      from,
      to,
      step,
      body,
      ...span(t, body[body.length - 1]),
    };
  }

  // Ternario: la precedencia más baja, asociativo a la derecha.
  private parseExpr(): Expr {
    if (this.check("keyword", "if")) return this.parseIfExpr();
    if (this.check("keyword", "switch")) return this.parseSwitchExpr();
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

  /** `if cond \n <block> [else if ...] [else \n <block>]` como expresión. */
  private parseIfExpr(): Expr {
    const t = this.peek(); // 'if'
    this.advance();
    const branches: IfBranch[] = [];
    const cond = this.parseExpr();
    this.expectStatementEnd();
    branches.push({ cond, body: this.parseBlock() });
    let lastPos: SourcePos = branches[0].body[branches[0].body.length - 1];
    for (;;) {
      this.skipBlankLines();
      if (!this.check("keyword", "else")) break;
      this.advance();
      if (this.check("keyword", "if")) {
        this.advance();
        const c = this.parseExpr();
        this.expectStatementEnd();
        const body = this.parseBlock();
        branches.push({ cond: c, body });
        lastPos = body[body.length - 1];
      } else {
        if (this.check("newline")) this.advance();
        const body = this.parseBlock();
        branches.push({ cond: null, body });
        lastPos = body[body.length - 1];
        break;
      }
    }
    return { kind: "ifExpr", branches, ...span(t, lastPos) };
  }

  /** `switch [subject] \n match => body \n => body` como expresión. */
  private parseSwitchExpr(): Expr {
    const t = this.peek(); // 'switch'
    this.advance();
    let subject: Expr | null = null;
    if (!this.check("newline")) {
      subject = this.parseExpr();
    }
    this.expectStatementEnd();
    this.skipBlankLines();
    if (!this.check("indent")) {
      throw this.fail(this.peek(), "Se esperaba un bloque indentado en switch");
    }
    this.advance();
    const cases: SwitchCase[] = [];
    let lastPos: SourcePos = t;
    while (!this.check("dedent") && !this.check("eof")) {
      if (this.check("newline")) {
        this.advance();
        continue;
      }
      let match: Expr | null = null;
      if (this.check("op", "=>")) {
        this.advance();
      } else {
        match = this.parseExpr();
        this.expectOp("=>", "Se esperaba '=>' en la rama del switch");
      }
      let body: Stmt[];
      if (this.check("newline")) {
        this.advance();
        body = this.parseBlock();
      } else {
        const expr = this.parseExpr();
        body = [{ kind: "exprStmt", expr, ...posOf(expr) }];
        this.expectStatementEnd();
      }
      cases.push({ match, body });
      lastPos = body[body.length - 1];
    }
    if (this.check("dedent")) this.advance();
    if (cases.length === 0) {
      throw this.fail(this.peek(), "El switch no tiene ramas");
    }
    return { kind: "switchExpr", subject, cases, ...span(t, lastPos) };
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
