import type { SourcePos } from "./errors";

export interface Program {
  statements: Stmt[];
}

export type Stmt = VarDeclStmt | AssignStmt | ExprStmt;

/** `x = expr` (declaración) o `var x = expr` (persistente entre barras). */
export interface VarDeclStmt extends SourcePos {
  kind: "varDecl";
  isVar: boolean;
  name: string;
  init: Expr;
}

/** `x := expr` — reasignación de una variable ya declarada. */
export interface AssignStmt extends SourcePos {
  kind: "assign";
  name: string;
  value: Expr;
}

export interface ExprStmt extends SourcePos {
  kind: "exprStmt";
  expr: Expr;
}

export type UnaryOp = "-" | "+" | "not";
export type BinaryOp =
  | "+" | "-" | "*" | "/" | "%"
  | "==" | "!=" | "<" | "<=" | ">" | ">="
  | "and" | "or";

export type Expr =
  | NumberLit
  | StringLit
  | BoolLit
  | ColorLit
  | ArrayLit
  | Identifier
  | MemberExpr
  | CallExpr
  | UnaryExpr
  | BinaryExpr
  | TernaryExpr
  | HistAccess;

export interface NumberLit extends SourcePos {
  kind: "number";
  value: number;
}

export interface StringLit extends SourcePos {
  kind: "string";
  value: string;
}

export interface BoolLit extends SourcePos {
  kind: "bool";
  value: boolean;
}

export interface ColorLit extends SourcePos {
  kind: "color";
  value: string;
}

/** Array literal `[a, b, c]` — solo soportado como `options=` de input.* (Fase 4). */
export interface ArrayLit extends SourcePos {
  kind: "array";
  elements: Expr[];
}

export interface Identifier extends SourcePos {
  kind: "ident";
  name: string;
}

/** Acceso a namespace plano: `ta.sma`, `color.blue`. `nodeId` da estado a `ta.tr` sin llamada. */
export interface MemberExpr extends SourcePos {
  kind: "member";
  object: string;
  property: string;
  nodeId: number;
}

export interface CallArg {
  name: string | null;
  value: Expr;
}

/** `callSiteId` es único y estable por compilación: clave del estado de los builtins ta.*. */
export interface CallExpr extends SourcePos {
  kind: "call";
  callee: Identifier | MemberExpr;
  args: CallArg[];
  callSiteId: number;
}

export interface UnaryExpr extends SourcePos {
  kind: "unary";
  op: UnaryOp;
  operand: Expr;
}

export interface BinaryExpr extends SourcePos {
  kind: "binary";
  op: BinaryOp;
  left: Expr;
  right: Expr;
}

export interface TernaryExpr extends SourcePos {
  kind: "ternary";
  cond: Expr;
  whenTrue: Expr;
  whenFalse: Expr;
}

/** `x[n]` — lectura histórica. `nodeId` indexa la serie oculta cuando la base no es un identificador. */
export interface HistAccess extends SourcePos {
  kind: "hist";
  base: Expr;
  offset: Expr;
  nodeId: number;
}
