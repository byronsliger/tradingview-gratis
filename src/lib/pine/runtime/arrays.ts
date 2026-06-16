import type { EvalValue } from "./values";

/**
 * Array de Pine en runtime. Envuelve un `EvalValue[]` mutable (referencia, semántica
 * de Pine): mutar el array afecta a todas las variables que apunten a él, y una
 * `var array` persiste la misma referencia entre barras. `na` de array = `null`.
 * Sus elementos pueden ser escalares u objetos (UDT) — un `array<pivot>` es solo un
 * PineArray cuyos elementos son PineObject.
 */
export class PineArray {
  readonly items: EvalValue[];

  constructor(items: EvalValue[] = []) {
    this.items = items;
  }
}
