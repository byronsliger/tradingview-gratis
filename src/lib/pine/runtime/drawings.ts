// Modelo puro de los objetos de dibujo de Pine (label / line / box) + chart.point.
// El runtime construye/muta este grafo; la capa de render (hook posterior) lo pinta.
// Todos son referencias mutables (semántica Pine): mutar un handle afecta a todas
// las variables que lo apunten, y una `var line l` persiste la misma referencia
// entre barras. `na` de un dibujo = null (como el resto de EvalValue).

/**
 * Punto de chart (`chart.point.new`). En Pine un chart.point tiene `time`, `index`
 * (bar_index) y `price`. Según el `xloc` del objeto que lo consume se usa time o index
 * como coordenada X. `na` de cualquier coordenada se representa con null.
 */
export class ChartPoint {
  constructor(
    public time: number | null,
    public index: number | null,
    public price: number | null,
  ) {}
}

/** Etiqueta (`label.new`). */
export class PineLabel {
  deleted = false;
  constructor(
    public readonly id: number,
    /** Coordenada X: tiempo (xloc.bar_time) o índice (xloc.bar_index). */
    public x: number | null,
    public y: number | null,
    public text: string,
    public color: string | null,
    public textcolor: string | null,
    public style: string,
    public size: string,
    /** "bar_time" | "bar_index" */
    public xloc: string,
  ) {}
}

/** Línea (`line.new`). */
export class PineLine {
  deleted = false;
  constructor(
    public readonly id: number,
    public p1: ChartPoint,
    public p2: ChartPoint,
    public color: string | null,
    public style: string,
    public width: number,
    /** "bar_time" | "bar_index" */
    public xloc: string,
    /** "none" | "left" | "right" | "both" */
    public extend: string,
  ) {}
}

/** Caja (`box.new`). */
export class PineBox {
  deleted = false;
  constructor(
    public readonly id: number,
    public topLeft: ChartPoint,
    public bottomRight: ChartPoint,
    public bgcolor: string | null,
    public borderColor: string | null,
    public borderWidth: number,
    /** "bar_time" | "bar_index" */
    public xloc: string,
    /** "none" | "left" | "right" | "both" */
    public extend: string,
  ) {}
}

export type PineDrawing = PineLabel | PineLine | PineBox;

/**
 * Almacén de los objetos de dibujo vivos durante un run. Cada tipo lleva su propio
 * contador de id autoincremental, su lista en orden de creación, y un límite
 * (`max_*_count`) que descarta los MÁS VIEJOS no borrados cuando se excede (como Pine).
 */
export class DrawingStore {
  readonly labels: PineLabel[] = [];
  readonly lines: PineLine[] = [];
  readonly boxes: PineBox[] = [];

  private nextLabelId = 0;
  private nextLineId = 0;
  private nextBoxId = 0;

  constructor(
    public maxLabels = 50,
    public maxLines = 50,
    public maxBoxes = 50,
  ) {}

  newLabel(
    x: number | null,
    y: number | null,
    text: string,
    color: string | null,
    textcolor: string | null,
    style: string,
    size: string,
    xloc: string,
  ): PineLabel {
    const label = new PineLabel(this.nextLabelId++, x, y, text, color, textcolor, style, size, xloc);
    this.labels.push(label);
    enforceLimit(this.labels, this.maxLabels);
    return label;
  }

  newLine(
    p1: ChartPoint,
    p2: ChartPoint,
    color: string | null,
    style: string,
    width: number,
    xloc: string,
    extend: string,
  ): PineLine {
    const line = new PineLine(this.nextLineId++, p1, p2, color, style, width, xloc, extend);
    this.lines.push(line);
    enforceLimit(this.lines, this.maxLines);
    return line;
  }

  newBox(
    topLeft: ChartPoint,
    bottomRight: ChartPoint,
    bgcolor: string | null,
    borderColor: string | null,
    borderWidth: number,
    xloc: string,
    extend: string,
  ): PineBox {
    const box = new PineBox(this.nextBoxId++, topLeft, bottomRight, bgcolor, borderColor, borderWidth, xloc, extend);
    this.boxes.push(box);
    enforceLimit(this.boxes, this.maxBoxes);
    return box;
  }
}

/**
 * Aplica el límite `max` descartando los objetos más viejos NO borrados cuando el
 * número de vivos lo excede. Los marcados como `deleted` no cuentan ni se descartan
 * aquí (el render ya los ignora; se filtran del resultado final). Como Pine, al
 * exceder el límite el objeto más antiguo se elimina permanentemente.
 */
function enforceLimit<T extends { deleted: boolean }>(list: T[], max: number): void {
  let alive = 0;
  for (const item of list) if (!item.deleted) alive++;
  let excess = alive - max;
  if (excess <= 0) return;
  for (let i = 0; i < list.length && excess > 0; i++) {
    if (!list[i].deleted) {
      list[i].deleted = true;
      excess--;
    }
  }
}
