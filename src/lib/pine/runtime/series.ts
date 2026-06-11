import type { PineValue } from "../types";

/**
 * Serie de valores paralela al array de velas. `get(barIndex, offset)` devuelve
 * na (null) si el índice queda fuera de rango — la semántica de `x[n]` en Pine.
 */
export class Series {
  private readonly values: PineValue[] = [];

  set(barIndex: number, value: PineValue): void {
    this.values[barIndex] = value;
  }

  get(barIndex: number, offset = 0): PineValue {
    const i = barIndex - offset;
    if (i < 0 || i >= this.values.length) return null;
    const v = this.values[i];
    return v === undefined ? null : v;
  }
}
