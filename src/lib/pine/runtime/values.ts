import type { PineValue } from "../types";
import type { PineArray } from "./arrays";
import type { PineObject } from "./objects";
import type { ChartPoint, PineBox, PineLabel, PineLine } from "./drawings";

/**
 * Valor de tupla devuelto por una función que retorna varios valores
 * (p. ej. `ta.macd`, `ta.bb`, o una función de usuario `f() => [a, b]`).
 * Sus elementos pueden ser escalares u objetos (UDT).
 */
export class TupleValue {
  constructor(readonly values: EvalValue[]) {}
}

/**
 * Resultado interno de evaluación: escalar, tupla, objeto (instancia de UDT), array
 * o un handle de dibujo (label/line/box) o chart.point. `na` de cualquier tipo
 * (incluido objeto/array/dibujo) se representa con `null` en PineValue.
 */
export type EvalValue =
  | PineValue
  | TupleValue
  | PineObject
  | PineArray
  | PineLabel
  | PineLine
  | PineBox
  | ChartPoint;
