import type { PineValue } from "../types";
import type { PineObject } from "./objects";

/**
 * Valor de tupla devuelto por una función que retorna varios valores
 * (p. ej. `ta.macd`, `ta.bb`, o una función de usuario `f() => [a, b]`).
 * Sus elementos pueden ser escalares u objetos (UDT).
 */
export class TupleValue {
  constructor(readonly values: EvalValue[]) {}
}

/**
 * Resultado interno de evaluación: escalar, tupla u objeto (instancia de UDT).
 * `na` de cualquier tipo (incluido objeto) se representa con `null` en PineValue.
 */
export type EvalValue = PineValue | TupleValue | PineObject;
