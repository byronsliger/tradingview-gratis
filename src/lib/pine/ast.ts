import type { SourcePos } from "./errors";

export interface Program {
  statements: Stmt[];
}

export type Stmt =
  | VarDeclStmt
  | TupleDeclStmt
  | AssignStmt
  | ExprStmt
  | IfStmt
  | ForStmt
  | BreakStmt
  | ContinueStmt
  | FuncDeclStmt;

/** `x = expr` (declaración) o `var x = expr` (persistente entre barras). */
export interface VarDeclStmt extends SourcePos {
  kind: "varDecl";
  isVar: boolean;
  name: string;
  init: Expr;
}

/** `[a, b] = f()` — destructuring de tuplas devueltas por una función. */
export interface TupleDeclStmt extends SourcePos {
  kind: "tupleDecl";
  isVar: boolean;
  names: string[];
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

/** `if cond \n <block> [else if cond \n <block>] [else \n <block>]` como statement. */
export interface IfStmt extends SourcePos {
  kind: "ifStmt";
  cond: Expr;
  then: Stmt[];
  /** else-if encadenados o else final (un único IfStmt anidado o un bloque). */
  elseBranch: Stmt[] | null;
}

/** `for i = inicio to fin [by paso] \n <block>`. */
export interface ForStmt extends SourcePos {
  kind: "forStmt";
  varName: string;
  from: Expr;
  to: Expr;
  step: Expr | null;
  body: Stmt[];
}

export interface BreakStmt extends SourcePos {
  kind: "break";
}

export interface ContinueStmt extends SourcePos {
  kind: "continue";
}

/** Función de usuario `f(a, b) => expr` o multilínea con cuerpo indentado. */
export interface FuncDeclStmt extends SourcePos {
  kind: "funcDecl";
  name: string;
  params: string[];
  body: Stmt[];
  /** Última expresión del cuerpo = valor de retorno (single-line: el único stmt). */
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
  | HistAccess
  | IfExpr
  | SwitchExpr;

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

/** Rama de un if-expresión/statement: `cond` (null en el `else` final) + cuerpo. */
export interface IfBranch {
  cond: Expr | null;
  body: Stmt[];
}

/** `if cond \n ... else ...` usado como expresión (devuelve la última expr de la rama). */
export interface IfExpr extends SourcePos {
  kind: "ifExpr";
  branches: IfBranch[];
}

/** Caso de un switch: `match` (null en el `=> default`) + cuerpo. */
export interface SwitchCase {
  match: Expr | null;
  body: Stmt[];
}

/** `switch [subject] \n caseExpr => body ...` como expresión. */
export interface SwitchExpr extends SourcePos {
  kind: "switchExpr";
  subject: Expr | null;
  cases: SwitchCase[];
}
