import type { EvalValue } from "./values";

/**
 * Serie de valores paralela al array de velas. `get(barIndex, offset)` devuelve
 * na (null) si el índice queda fuera de rango — la semántica de `x[n]` en Pine.
 * Los valores son `EvalValue`: además de escalares, una variable puede guardar un
 * objeto (instancia de UDT) — por eso una `var obj` persiste la misma referencia.
 */
export class Series {
  private readonly values: EvalValue[] = [];

  set(barIndex: number, value: EvalValue): void {
    this.values[barIndex] = value;
  }

  get(barIndex: number, offset = 0): EvalValue {
    const i = barIndex - offset;
    if (i < 0 || i >= this.values.length) return null;
    const v = this.values[i];
    return v === undefined ? null : v;
  }
}
