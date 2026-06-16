import type { PineValue } from "../types";

/**
 * Valor de tupla devuelto por una función que retorna varios valores
 * (p. ej. `ta.macd`, `ta.bb`, o una función de usuario `f() => [a, b]`).
 */
export class TupleValue {
  constructor(readonly values: PineValue[]) {}
}

/** Resultado interno de evaluación: escalar o tupla. */
export type EvalValue = PineValue | TupleValue;
