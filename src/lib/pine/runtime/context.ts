import type { Candle } from "@/lib/binance/types";
import { PineRuntimeError, type SourcePos } from "../errors";
import type { InputDef, RunOptions } from "../types";
import { Series } from "./series";

export const DEFAULT_FUEL_PER_BAR = 50_000;
export const DEFAULT_FUEL_TOTAL = 5_000_000;

export interface VarSlot {
  series: Series;
  isVar: boolean;
}

/** Estado de una ejecución completa del script (se crea uno nuevo por run). */
export class ExecutionContext {
  readonly candles: Candle[];
  readonly inputs: Record<string, number | string | boolean>;
  barIndex = 0;

  readonly vars = new Map<string, VarSlot>();
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

  private readonly callSiteStates = new Map<number, unknown>();
  private readonly hiddenSeries = new Map<number, Series>();
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

  /** Estado por call-site de los builtins ta.* — vive solo durante el run actual. */
  getState<T>(callSiteId: number, init: () => T): T {
    const existing = this.callSiteStates.get(callSiteId);
    if (existing !== undefined) return existing as T;
    const created = init();
    this.callSiteStates.set(callSiteId, created);
    return created;
  }

  /** Serie oculta para `expr[n]` cuando la base no es un identificador. */
  getHiddenSeries(nodeId: number): Series {
    let s = this.hiddenSeries.get(nodeId);
    if (!s) {
      s = new Series();
      this.hiddenSeries.set(nodeId, s);
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
