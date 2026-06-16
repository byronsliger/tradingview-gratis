import type { Candle } from "@/lib/binance/types";
import type { FuncDeclStmt } from "../ast";
import { PineRuntimeError, type SourcePos } from "../errors";
import type { InputDef, RunOptions } from "../types";
import { Series } from "./series";

export const DEFAULT_FUEL_PER_BAR = 50_000;
export const DEFAULT_FUEL_TOTAL = 5_000_000;

export interface VarSlot {
  series: Series;
  isVar: boolean;
}

/** Función de usuario registrada (cuerpo + parámetros). */
export interface FuncDef {
  params: string[];
  decl: FuncDeclStmt;
}

/** Estado de una ejecución completa del script (se crea uno nuevo por run). */
export class ExecutionContext {
  readonly candles: Candle[];
  readonly inputs: Record<string, number | string | boolean>;
  barIndex = 0;

  /** Pila de scopes léxicos: índice 0 = global. */
  readonly scopes: Map<string, VarSlot>[] = [new Map()];

  /** Scope global (donde viven `var`/`:=` de nivel superior y las funciones). */
  get vars(): Map<string, VarSlot> {
    return this.scopes[0];
  }

  /** Definiciones de funciones de usuario por nombre. */
  readonly functions = new Map<string, FuncDef>();

  /**
   * Prefijo del estado por call-site, derivado de la pila de llamadas a funciones
   * de usuario. Garantiza que cada sitio de invocación tenga su propio estado ta.*.
   */
  private callStackKey = "";
  private readonly callKeyStack: string[] = [];
  /** Resultado de plot() por callSiteId; sparse cuando hay na. */
  readonly plotValues = new Map<number, (number | null)[]>();
  /** Color dinámico por barra de cada plot(); solo se puebla si llega un color. */
  readonly plotColors = new Map<number, (string | undefined)[]>();
  /**
   * Barras disparadas de cada plotshape/plotchar (por callSiteId).
   * Valor: color dinámico (string) o null (usar el color del spec).
   * Las barras no disparadas quedan como huecos (undefined).
   */
  readonly shapeMarks = new Map<number, (string | null | undefined)[]>();

  private readonly callSiteStates = new Map<string, unknown>();
  private readonly hiddenSeries = new Map<string, Series>();
  private readonly inputDefsByCallSite = new Map<number, InputDef>();
  private fuelBar = 0;
  private fuelTotal = 0;
  private readonly maxFuelPerBar: number;
  private readonly maxFuelTotal: number;

  constructor(
    candles: Candle[],
    inputs: Record<string, number | string | boolean>,
    options?: RunOptions,
    inputDefs: InputDef[] = [],
  ) {
    this.candles = candles;
    this.inputs = inputs;
    this.maxFuelPerBar = options?.maxFuelPerBar ?? DEFAULT_FUEL_PER_BAR;
    this.maxFuelTotal = options?.maxFuelTotal ?? DEFAULT_FUEL_TOTAL;
    for (const def of inputDefs) this.inputDefsByCallSite.set(def.callSiteId, def);
  }

  /** InputDef del input.*() en ese call-site (extraído por analyze). */
  inputDef(callSiteId: number): InputDef | undefined {
    return this.inputDefsByCallSite.get(callSiteId);
  }

  startBar(barIndex: number): void {
    this.barIndex = barIndex;
    this.fuelBar = 0;
  }

  consumeFuel(pos: SourcePos): void {
    this.fuelBar += 1;
    this.fuelTotal += 1;
    if (this.fuelBar > this.maxFuelPerBar) {
      throw new PineRuntimeError(
        `Límite de ejecución por barra alcanzado (${this.maxFuelPerBar} pasos)`,
        pos,
      );
    }
    if (this.fuelTotal > this.maxFuelTotal) {
      throw new PineRuntimeError(
        `Límite de ejecución total alcanzado (${this.maxFuelTotal} pasos)`,
        pos,
      );
    }
  }

  /**
   * Estado por call-site de los builtins ta.* — vive solo durante el run actual.
   * La clave combina la pila de llamadas a funciones de usuario con el callSiteId
   * del AST, de modo que un mismo ta.* dentro de una función tenga estado propio
   * por cada sitio de invocación del llamador.
   */
  getState<T>(callSiteId: number, init: () => T): T {
    const key = this.callStackKey + "#" + callSiteId;
    const existing = this.callSiteStates.get(key);
    if (existing !== undefined) return existing as T;
    const created = init();
    this.callSiteStates.set(key, created);
    return created;
  }

  /** Empuja un scope local (con un prefijo de call-stack único por call-site). */
  pushScope(invocationKey: string): Map<string, VarSlot> {
    const scope = new Map<string, VarSlot>();
    this.scopes.push(scope);
    this.callKeyStack.push(this.callStackKey);
    this.callStackKey = this.callStackKey + "/" + invocationKey;
    return scope;
  }

  popScope(): void {
    this.scopes.pop();
    this.callStackKey = this.callKeyStack.pop() ?? "";
  }

  /** Busca una variable en el scope actual y luego en el global. */
  lookupVar(name: string): VarSlot | undefined {
    const local = this.scopes[this.scopes.length - 1];
    const hit = local.get(name);
    if (hit) return hit;
    if (local !== this.scopes[0]) return this.scopes[0].get(name);
    return undefined;
  }

  /** Scope activo (para declarar variables locales). */
  currentScope(): Map<string, VarSlot> {
    return this.scopes[this.scopes.length - 1];
  }

  /**
   * Slot persistente entre barras para una variable o parámetro local de función,
   * keyed por la pila de llamadas + nombre. Así, dentro de una función, tanto los
   * `var` como los locales planos y los parámetros son series con historial
   * (`x[1]` lee la barra anterior), igual que en Pine — por sitio de invocación.
   */
  persistentVarSlot(name: string, isVar = true): { slot: VarSlot; existed: boolean } {
    const key = this.callStackKey + "::" + name;
    const existing = this.localVarSlots.get(key);
    if (existing) return { slot: existing, existed: true };
    const slot: VarSlot = { series: new Series(), isVar };
    this.localVarSlots.set(key, slot);
    return { slot, existed: false };
  }

  private readonly localVarSlots = new Map<string, VarSlot>();

  /** Serie oculta para `expr[n]` cuando la base no es un identificador. */
  getHiddenSeries(nodeId: number): Series {
    const key = this.callStackKey + "#" + nodeId;
    let s = this.hiddenSeries.get(key);
    if (!s) {
      s = new Series();
      this.hiddenSeries.set(key, s);
    }
    return s;
  }

  recordPlot(callSiteId: number, value: number | null, color: string | null = null): void {
    let arr = this.plotValues.get(callSiteId);
    if (!arr) {
      arr = [];
      this.plotValues.set(callSiteId, arr);
    }
    arr[this.barIndex] = value;
    if (color !== null) {
      let colors = this.plotColors.get(callSiteId);
      if (!colors) {
        colors = [];
        this.plotColors.set(callSiteId, colors);
      }
      colors[this.barIndex] = color;
    }
  }

  /** Marca (o no) la barra actual de un plotshape/plotchar. */
  recordShape(callSiteId: number, triggered: boolean, color: string | null): void {
    let arr = this.shapeMarks.get(callSiteId);
    if (!arr) {
      arr = [];
      this.shapeMarks.set(callSiteId, arr);
    }
    if (triggered) arr[this.barIndex] = color;
  }
}
