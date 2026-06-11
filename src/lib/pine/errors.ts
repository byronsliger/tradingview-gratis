import type { Diagnostic } from "./types";

/** Posición de un token/nodo en el código fuente (línea y columna 1-based). */
export interface SourcePos {
  line: number;
  col: number;
  start: number;
  end: number;
}

class PinePositionedError extends Error implements SourcePos {
  readonly line: number;
  readonly col: number;
  readonly start: number;
  readonly end: number;

  constructor(message: string, pos: SourcePos) {
    super(message);
    this.line = pos.line;
    this.col = pos.col;
    this.start = pos.start;
    this.end = pos.end;
  }
}

export class PineSyntaxError extends PinePositionedError {
  constructor(message: string, pos: SourcePos) {
    super(message, pos);
    this.name = "PineSyntaxError";
  }
}

export class PineRuntimeError extends PinePositionedError {
  constructor(message: string, pos: SourcePos) {
    super(message, pos);
    this.name = "PineRuntimeError";
  }
}

export function toDiagnostic(
  err: PineSyntaxError | PineRuntimeError,
  severity: Diagnostic["severity"] = "error",
): Diagnostic {
  return {
    severity,
    message: err.message,
    line: err.line,
    col: err.col,
    start: err.start,
    end: err.end,
  };
}
