import type { Candle } from "@/lib/binance/types";
import type { FuncDeclStmt } from "../ast";
import { PineRuntimeError, type SourcePos } from "../errors";
import type { InputDef, RunContext, RunOptions } from "../types";
import type { TypeDescriptor } from "./objects";
import { DrawingStore } from "./drawings";
import { Series } from "./series";

/** Punto OHLC de un plotcandle() por barra (na en open → cuerpo omitido). */
export interface CandlePoint {
  barIndex: number;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  color?: string;
  wickColor?: string;
  borderColor?: string;
}

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

/** Límites de objetos de dibujo (de indicator(max_*_count); default 50 como Pine). */
export interface DrawingLimits {
  maxLabels?: number;
  maxLines?: number;
  maxBoxes?: number;
}

/** Estado de una ejecución completa del script (se crea uno nuevo por run). */
export class ExecutionContext {
  readonly candles: Candle[];
  readonly inputs: Record<string, number | string | boolean>;
  barIndex = 0;

  /** Símbolo actual del chart (syminfo.tickerid/.ticker). "" si no se proveyó. */
  readonly symbol: string;
  /** Timeframe del chart (timeframe.period). "" si no se proveyó. */
  readonly timeframe: string;
  /** Velas HTF por timeframe-string (request.security las usa para alinear). */
  readonly htf: Record<string, Candle[]>;
  /** Timeframes ya advertidos como ausentes en htf (warning una sola vez). */
  private readonly warnedHtf = new Set<string>();

  /** Pila de scopes léxicos: índice 0 = global. */
  readonly scopes: Map<string, VarSlot>[] = [new Map()];

  /** Scope global (donde viven `var`/`:=` de nivel superior y las funciones). */
  get vars(): Map<string, VarSlot> {
    return this.scopes[0];
  }

  /** Definiciones de funciones de usuario por nombre. */
  readonly functions = new Map<string, FuncDef>();

  /** Descriptores de tipos definidos por el usuario (UDTs), por nombre. */
  readonly types = new Map<string, TypeDescriptor>();

  /** Grafo de objetos de dibujo (label/line/box) creados durante el run. */
  readonly drawings: DrawingStore;

  /** Puntos OHLC de cada plotcandle() por callSiteId, en orden de barra. */
  readonly candlePoints = new Map<number, CandlePoint[]>();

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
    limits?: DrawingLimits,
    runCtx?: RunContext,
  ) {
    this.candles = candles;
    this.inputs = inputs;
    this.symbol = runCtx?.symbol ?? "";
    this.timeframe = runCtx?.timeframe ?? "";
    this.htf = runCtx?.htf ?? {};
    this.maxFuelPerBar = options?.maxFuelPerBar ?? DEFAULT_FUEL_PER_BAR;
    this.maxFuelTotal = options?.maxFuelTotal ?? DEFAULT_FUEL_TOTAL;
    this.drawings = new DrawingStore(
      limits?.maxLabels ?? 50,
      limits?.maxLines ?? 50,
      limits?.maxBoxes ?? 50,
    );
    for (const def of inputDefs) this.inputDefsByCallSite.set(def.callSiteId, def);
  }

  /** Advierte (una sola vez por tf) que no hay velas HTF para un timeframe pedido. */
  warnMissingHtf(tf: string): void {
    if (this.warnedHtf.has(tf)) return;
    this.warnedHtf.add(tf);
    console.warn(
      `request.security: no hay velas para el timeframe '${tf}' (se devuelve na). La app debe proveerlas vía runCtx.htf.`,
    );
  }

  /** Registra el OHLC + colores de un plotcandle() en la barra actual. */
  recordCandle(callSiteId: number, point: Omit<CandlePoint, "barIndex">): void {
    let arr = this.candlePoints.get(callSiteId);
    if (!arr) {
      arr = [];
      this.candlePoints.set(callSiteId, arr);
    }
    arr.push({ barIndex: this.barIndex, ...point });
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
