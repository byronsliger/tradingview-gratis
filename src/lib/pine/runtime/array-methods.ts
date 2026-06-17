import type { SourcePos } from "../errors";
import { PineRuntimeError } from "../errors";
import { PineArray } from "./arrays";
import { PineObject } from "./objects";
import { TupleValue, type EvalValue } from "./values";

/**
 * Librería de métodos de `array.*` de Pine. Cada método se invoca tanto en forma de
 * método (`arr.push(x)`) como funcional (`array.push(arr, x)`); en ambos casos llega
 * aquí con el PineArray como receptor (`arr`) y el resto de argumentos en `args`.
 *
 * Notas de semántica:
 * - `slice(from, to)` devuelve un PineArray NUEVO (copia). En Pine real slice es una
 *   VISTA mutable del original; aquí una copia es más segura y suficiente para el SMC.
 * - `max/min/sum/avg` operan solo sobre elementos numéricos (ignoran na/no-numéricos).
 * - `indexof/includes/remove/pop/shift` devuelven el elemento/índice; errores de
 *   índice fuera de rango → PineRuntimeError posicionado.
 * - `na` de array = null; un array de UDTs es un PineArray de PineObject.
 */

/** Constructor por nombre: `array.new<T>()` (llega como "new") y `array.new_float()` etc. */
export function arrayNewFromGeneric(
  property: string,
  args: EvalValue[],
  pos: SourcePos,
): PineArray {
  // Tipo por defecto del valor inicial: depende del sufijo (_float/_int/_bool/_string).
  let defaultInitial: EvalValue = null;
  if (property === "new_float" || property === "new_int") defaultInitial = null;
  else if (property === "new_bool") defaultInitial = false;
  else if (property === "new_string") defaultInitial = "";
  else if (property === "new") defaultInitial = null;
  else {
    throw new PineRuntimeError(`'array.${property}()' no está soportado`, pos);
  }

  if (args.length === 0) return new PineArray([]);

  const size = numericArg(args[0], pos, "size");
  if (size < 0) throw new PineRuntimeError("El tamaño de un array no puede ser negativo", pos);
  const n = Math.floor(size);
  const initial: EvalValue = args.length >= 2 ? args[1] : defaultInitial;
  const items: EvalValue[] = new Array(n).fill(initial);
  return new PineArray(items);
}

/** Despacha un método de array por nombre. */
export function callArrayMethod(
  arr: PineArray,
  method: string,
  args: EvalValue[],
  pos: SourcePos,
): EvalValue {
  const items = arr.items;
  switch (method) {
    case "push": {
      items.push(arg(args, 0, pos, method));
      return null;
    }
    case "unshift": {
      items.unshift(arg(args, 0, pos, method));
      return null;
    }
    case "pop": {
      if (items.length === 0) throw new PineRuntimeError("array.pop() sobre un array vacío", pos);
      return items.pop() ?? null;
    }
    case "shift": {
      if (items.length === 0) throw new PineRuntimeError("array.shift() sobre un array vacío", pos);
      return items.shift() ?? null;
    }
    case "get": {
      const i = indexArg(args, 0, items.length, pos, method);
      return items[i] ?? null;
    }
    case "set": {
      const i = indexArg(args, 0, items.length, pos, method);
      items[i] = arg(args, 1, pos, method);
      return null;
    }
    case "size":
      return items.length;
    case "first": {
      if (items.length === 0) throw new PineRuntimeError("array.first() sobre un array vacío", pos);
      return items[0] ?? null;
    }
    case "last": {
      if (items.length === 0) throw new PineRuntimeError("array.last() sobre un array vacío", pos);
      return items[items.length - 1] ?? null;
    }
    case "remove": {
      // Tolerante a índice fuera de rango: durante un for-in que muta el array
      // (deleteOrderBlocks/deleteFairValueGaps), los índices pueden desalinearse
      // al encoger. Devolver na en vez de lanzar evita tumbar el indicador.
      const ri = Math.floor(numericArg(args[0], pos, "index"));
      if (ri < 0 || ri >= items.length) return null;
      return items.splice(ri, 1)[0] ?? null;
    }
    case "insert": {
      const i = Math.floor(numericArg(args[0], pos, "index"));
      if (i < 0 || i > items.length) {
        throw new PineRuntimeError(`Índice ${i} fuera de rango en array.insert()`, pos);
      }
      items.splice(i, 0, arg(args, 1, pos, method));
      return null;
    }
    case "clear":
      items.length = 0;
      return null;
    case "slice": {
      const from = args.length >= 1 ? Math.floor(numericArg(args[0], pos, "from")) : 0;
      const to = args.length >= 2 ? Math.floor(numericArg(args[1], pos, "to")) : items.length;
      // Copia (no vista). Pine clampa los índices; replicamos con slice de JS.
      return new PineArray(items.slice(from, to));
    }
    case "copy":
      return new PineArray(items.slice());
    case "concat": {
      const other = args[0];
      if (!(other instanceof PineArray)) {
        throw new PineRuntimeError("array.concat() requiere otro array", pos);
      }
      // concat de Pine MUTA y devuelve el array receptor (id1).
      for (const v of other.items) items.push(v);
      return arr;
    }
    case "indexof":
    case "indexOf": {
      const target = arg(args, 0, pos, method);
      for (let i = 0; i < items.length; i++) {
        if (valuesEqual(items[i] ?? null, target)) return i;
      }
      return -1;
    }
    case "includes": {
      const target = arg(args, 0, pos, method);
      for (const v of items) if (valuesEqual(v ?? null, target)) return true;
      return false;
    }
    case "max":
      return reduceNumbers(items, pos, "max", (a, b) => Math.max(a, b));
    case "min":
      return reduceNumbers(items, pos, "min", (a, b) => Math.min(a, b));
    case "sum": {
      let s = 0;
      for (const v of items) if (typeof v === "number" && Number.isFinite(v)) s += v;
      return s;
    }
    case "avg": {
      let s = 0;
      let n = 0;
      for (const v of items) {
        if (typeof v === "number" && Number.isFinite(v)) {
          s += v;
          n++;
        }
      }
      return n === 0 ? null : s / n;
    }
    case "join": {
      const sep = args.length >= 1 && typeof args[0] === "string" ? args[0] : ",";
      return items.map((v) => stringify(v)).join(sep);
    }
    case "reverse":
      items.reverse();
      return null;
    case "fill": {
      const value = arg(args, 0, pos, method);
      const from = args.length >= 2 ? Math.floor(numericArg(args[1], pos, "from")) : 0;
      const to = args.length >= 3 ? Math.floor(numericArg(args[2], pos, "to")) : items.length;
      for (let i = Math.max(0, from); i < Math.min(items.length, to); i++) items[i] = value;
      return null;
    }
    case "sort": {
      // order: 'descending'? por defecto ascendente. Solo numéricos.
      const desc = typeof args[0] === "string" && args[0].toLowerCase().startsWith("desc");
      items.sort((a, b) => {
        const na = typeof a === "number" ? a : 0;
        const nb = typeof b === "number" ? b : 0;
        return desc ? nb - na : na - nb;
      });
      return null;
    }
    case "binary_search":
    case "binary_search_leftmost":
    case "binary_search_rightmost": {
      // Buscar con na no debe tumbar el script (Pine es tolerante): devuelve -1.
      const v = args[0];
      if (typeof v !== "number" || !Number.isFinite(v)) return -1;
      return binarySearch(items, v, method);
    }
    default:
      throw new PineRuntimeError(`'array.${method}()' no está soportado`, pos);
  }
}

function arg(args: EvalValue[], i: number, pos: SourcePos, method: string): EvalValue {
  if (i >= args.length) {
    throw new PineRuntimeError(`Faltan argumentos en array.${method}()`, pos);
  }
  return args[i];
}

function numericArg(v: EvalValue | undefined, pos: SourcePos, what: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new PineRuntimeError(`'${what}' debe ser un número`, pos);
  }
  return v;
}

function indexArg(
  args: EvalValue[],
  i: number,
  length: number,
  pos: SourcePos,
  method: string,
): number {
  const idx = Math.floor(numericArg(args[i], pos, "index"));
  if (idx < 0 || idx >= length) {
    throw new PineRuntimeError(
      `Índice ${idx} fuera de rango en array.${method}() (tamaño ${length})`,
      pos,
    );
  }
  return idx;
}

function reduceNumbers(
  items: EvalValue[],
  pos: SourcePos,
  name: string,
  f: (a: number, b: number) => number,
): EvalValue {
  let acc: number | null = null;
  for (const v of items) {
    if (typeof v === "number" && Number.isFinite(v)) {
      acc = acc === null ? v : f(acc, v);
    }
  }
  if (acc === null) {
    // Pine devuelve na si no hay elementos numéricos.
    return null;
  }
  void name;
  return acc;
}

/** Búsqueda binaria sobre un array numérico ordenado ascendente. */
function binarySearch(items: EvalValue[], value: number, mode: string): number {
  let lo = 0;
  let hi = items.length - 1;
  let exact = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = items[mid];
    const n = typeof v === "number" ? v : NaN;
    if (n === value) {
      exact = mid;
      if (mode === "binary_search_leftmost") hi = mid - 1;
      else if (mode === "binary_search_rightmost") lo = mid + 1;
      else return mid;
    } else if (n < value) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (mode === "binary_search") return -1;
  if (exact !== -1) {
    if (mode === "binary_search_leftmost") return lo; // lo apunta al primer == tras converger
    return hi; // rightmost: hi apunta al último ==
  }
  // Sin coincidencia exacta: leftmost = primer índice >= value (lo); rightmost = lo - 1.
  return mode === "binary_search_leftmost" ? lo : lo - 1;
}

/** Igualdad para indexof/includes: na nunca matchea; objetos/arrays por referencia. */
function valuesEqual(a: EvalValue, b: EvalValue): boolean {
  if (a === null || b === null) return false;
  if (a instanceof PineObject || b instanceof PineObject) return a === b;
  if (a instanceof PineArray || b instanceof PineArray) return a === b;
  if (a instanceof TupleValue || b instanceof TupleValue) return a === b;
  return a === b;
}

function stringify(v: EvalValue): string {
  if (v === null) return "NaN";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "[object]";
}
