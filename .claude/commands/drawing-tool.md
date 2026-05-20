Actúa como un experto en la arquitectura del proyecto TradingView Gratis. Tu tarea es implementar una nueva **drawing tool** siguiendo el patrón exacto establecido por la herramienta de línea de tendencia (`trendline`).

El usuario te indicará qué herramienta crear (ej: "rectángulo", "fibonacci", "canal horizontal", etc.). Antes de escribir código, confirma el nombre de la herramienta y sus propiedades visuales.

---

## Arquitectura del proyecto

**Stack:** Next.js 16, React 19, lightweight-charts v5, Zustand v5, TypeScript estricto.

**Paths clave:**
- Store: `src/lib/store/chart-store.ts`
- Tipos de drawings: `src/lib/drawings/types.ts`
- Primitivas de canvas: `src/lib/drawings/primitives/`
- Hooks del chart: `src/hooks/chart/`
- Componentes overlay: `src/components/chart/overlay/`
- Componente principal: `src/components/chart/PriceChart.tsx`
- Diálogo de settings: `src/components/chart/DrawingSettingsDialog.tsx`

---

## Patrón completo — 10 pasos obligatorios

### PASO 1 — Tipos (`src/lib/drawings/types.ts`)
Agrega la nueva interfaz al union type `Drawing`:
```typescript
interface NuevaHerramientaDrawing {
  id: string;
  symbol: string;
  type: "nueva_herramienta";   // literal único
  a: TrendLinePoint;            // primer punto { time: number (unix s), price: number }
  b: TrendLinePoint;            // segundo punto
  // propiedades visuales específicas de la herramienta:
  color: string;
  lineWidth: 1 | 2 | 3 | 4;
  lineStyle: number;            // 0=solid,1=dotted,2=dashed,3=large-dashed
  // ... otras propiedades según la herramienta
}
type Drawing = TrendLineDrawing | NuevaHerramientaDrawing;
```

### PASO 2 — Store (`src/lib/store/chart-store.ts`)
El store ya tiene `drawings`, `addDrawing`, `removeDrawing`, `updateDrawing`, `clearDrawings`, `drawingEditTarget`, `selectedDrawingId`, `setTool`.
Solo agrega el nuevo valor al union type `DrawingTool`:
```typescript
type DrawingTool = "cursor" | "trendline" | "nueva_herramienta";
```
Si la herramienta necesita estado temporal propio (poco común), agrégalo al store con su setter.

> **`clearDrawings` ya maneja todos los tipos del union `Drawing`** — como el lifecycle hook filtra por `d.type === "nueva_herramienta"` y detach las primitivas cuando el drawing desaparece del store, no se necesita código extra para que el botón "Borrar todos los dibujos" funcione con la nueva herramienta. Solo asegúrate de que el tipo esté en el union `Drawing`.

### PASO 3 — Primitiva de canvas (`src/lib/drawings/primitives/NuevaHerramientaPrimitive.ts`)
Implementa la interfaz `ISeriesPrimitive` de lightweight-charts:
```typescript
export class NuevaHerramientaPrimitive implements ISeriesPrimitive<Time> {
  private _drawing: NuevaHerramientaDrawing;
  private _selected: boolean;
  private _series: ISeriesApi<"Candlestick"> | null = null;
  private _chart: IChartApiBase<Time> | null = null;
  private _candlesRef?: RefObject<Candle[]>;
  private _paneViews: [NuevaHerramientaPaneView];

  constructor(drawing, selected, candlesRef?)
  attached(params): void    // guarda _series y _chart
  detached(): void
  paneViews()
  update(drawing, selected): void  // llama _requestUpdate()

  // Hit testing — distancia en px al cuerpo de la figura
  testHit(px, py, containerWidth): boolean
  // Hit testing de endpoints — retorna "a" | "b" | null
  testEndpoint(px, py): "a" | "b" | null
  // Coordenadas CSS de endpoints para drag
  getEndpointPixels(): { ax, ay, bx, by } | null
}
```

**Patrón getCoordinateForTime (crítico para puntos fuera del rango visible):**
```typescript
private _getCoordinateForTime(time: number): number | null {
  const coord = this._chart!.timeScale().timeToCoordinate(time as Time);
  if (coord !== null) return coord;
  // fallback: extrapolación por logical index
  const candles = this._candlesRef?.current;
  if (!candles?.length) return null;
  const logical = candles.findIndex(c => c.time >= time);
  // ... calcular usando barSpacing y scrollPosition
}
```

### PASO 4 — Lifecycle hook (`src/hooks/chart/useNuevaHerramientaPrimitives.ts`)
Sincroniza el store con las primitivas adjuntas a la serie:
```typescript
export function useNuevaHerramientaPrimitives({ chartRef, candleSeriesRef, candlesRef }) {
  const drawings = useChartStore(s => s.drawings);
  const selectedDrawingId = useChartStore(s => s.selectedDrawingId);
  const symbol = useChartStore(s => s.symbol);
  const primitivesRef = useRef<Map<string, NuevaHerramientaPrimitive>>(new Map());

  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    const relevant = drawings.filter(d => d.symbol === symbol && d.type === "nueva_herramienta");
    // 1. Detach removed
    // 2. Attach new: series.attachPrimitive(new NuevaHerramientaPrimitive(...))
    // 3. Update existing: prim.update(d, isSelected)
  }, [drawings, selectedDrawingId, symbol]);

  return { primitivesRef };
}
```

### PASO 5 — Hook de creación (`src/hooks/chart/useNuevaHerramientaTool.ts`)
Máquina de estados para capturar puntos del usuario:
```typescript
type Phase = "idle" | "placing_b"; // o más fases si la herramienta lo requiere

export function useNuevaHerramientaTool({ containerRef, chartRef, candleSeriesRef, candlesRef, chartReady }) {
  const tool = useChartStore(s => s.tool);
  const symbol = useChartStore(s => s.symbol);
  const addDrawing = useChartStore(s => s.addDrawing);
  const setTool = useChartStore(s => s.setTool);
  const phaseRef = useRef<Phase>("idle");
  const [inProgress, setInProgress] = useState<{ a: TrendLinePoint; b: TrendLinePoint } | null>(null);

  // getPoint: convierte coordenadas de pantalla a datos del chart
  // usa series.coordinateToPrice(y) y chart.timeScale().coordinateToTime(x)
  // fallback: coordinateToLogical() + extrapolación para zona rightOffset

  useEffect(() => {
    if (!chartReady || !containerRef.current) return;
    const el = containerRef.current;
    // pointerdown (capture): captura puntos A y B
    // pointermove: actualiza inProgress.b en tiempo real
    // keydown Escape: cancela y vuelve a "cursor"
    // SIEMPRE usar { capture: true } en addEventListener
    return () => { /* cleanup listeners */ };
  }, [tool, chartReady, symbol]);

  return { inProgress };
}
```

### PASO 6 — Hook de interacción (`src/hooks/chart/useNuevaHerramientaInteraction.ts`)
Selección, drag y doble-clic:
```typescript
// Drag state machine
type DragState =
  | { type: "none" }
  | { type: "line"; id, startPx, startPy, ax, ay, bx, by }
  | { type: "handle"; id, endpoint: "a" | "b" };

export function useNuevaHerramientaInteraction({ containerRef, chartRef, candleSeriesRef, candlesRef, primitivesRef, chartReady }) {
  // pointerdown: findHit() → seleccionar / preparar drag
  // pointermove: si drag activo → updateDrawing() en tiempo real (umbral 4px)
  // pointerup: limpiar drag
  // dblclick / doble pointerdown en 400ms: setDrawingEditTarget()
  // keydown Delete/Backspace: removeDrawing(selectedDrawingId)
  // keydown Escape: setSelectedDrawingId(null)
  // SIEMPRE { capture: true } + stopImmediatePropagation() al detectar hit
}
```

### PASO 7 — Preview SVG (`src/components/chart/overlay/NuevaHerramientaLayer.tsx`)
SVG overlay durante la fase de dibujo:
```typescript
// Suscribir a chart.timeScale().subscribeVisibleLogicalRangeChange()
// para forzar re-render en pan/zoom mientras se dibuja
// Convertir inProgress.a y inProgress.b a coordenadas px
// Renderizar la figura como SVG (línea, rect, etc.)
```

### PASO 8 — Diálogo de settings (`src/components/chart/DrawingSettingsDialog.tsx`)
Agrega el nuevo tipo al switch/renderizador del diálogo existente. Si la herramienta tiene props únicas, agregar controles en la pestaña "Estilo".

### PASO 9 — Toolbar
Agrega el botón en el componente de toolbar del chart con el icono de Lucide apropiado y `setTool("nueva_herramienta")` al hacer click.

### PASO 10 — Integración en `PriceChart.tsx`
```typescript
// Llamar hooks en ESTE orden (crítico por capture phase y stopImmediatePropagation):
const { inProgress } = useNuevaHerramientaTool(...)
const { primitivesRef } = useNuevaHerramientaPrimitives(...)
useNuevaHerramientaInteraction({ ..., primitivesRef })
// usePriceLineDrag SIEMPRE al final

// En el JSX:
<NuevaHerramientaLayer inProgress={inProgress} chartRef={chartRef} ... />
```

---

## Reglas invariables

1. **Todos los event listeners usan `{ capture: true }`** — permite interceptar antes que lightweight-charts.
2. **`stopImmediatePropagation()`** al detectar hit — evita que otros hooks deseleccionen la figura.
3. **Persistencia automática** — Zustand persiste `drawings` en localStorage con la key `tv-gratis-chart-state`. No se necesita código extra.
4. **Un hook = una responsabilidad** — creación, lifecycle, interacción son hooks separados.
5. **`getCoordinateForTime` con fallback** — siempre implementar el fallback por extrapolación para zonas fuera del rango visible (rightOffset).
6. **Cursor crosshair** — durante la creación, el cursor debe ser `crosshair`. Agregar el caso en `useChartInteraction.ts`.
7. **Auto-switch a cursor** — al completar el dibujo, llamar `setTool("cursor")`.
8. **Hit radius estándar**: 12px para cuerpo, 14px para endpoints.
9. **Umbral de drag**: 4px antes de activar el drag real.
10. **Doble-click en 400ms** para abrir settings dialog.
11. **"Borrar todos los dibujos" automático** — el botón Trash en `LeftSidebar` llama `clearDrawings(symbol)` que elimina del store todo `Drawing` con ese símbolo. El lifecycle hook (`useNuevaHerramientaPrimitives`) detecta que desaparecieron y hace `detachPrimitive` automáticamente. **No se requiere ningún código extra** siempre que: (a) el tipo esté en el union `Drawing`, y (b) el lifecycle hook filtre correctamente por `d.type === "nueva_herramienta"`.

---

## Checklist de entrega

- [ ] Tipo nuevo en `types.ts` y union `Drawing` actualizado
- [ ] `DrawingTool` union actualizado en el store
- [ ] Primitiva implementa `testHit`, `testEndpoint`, `getEndpointPixels`, `getCoordinateForTime` con fallback
- [ ] Hook de lifecycle adjunta/detach correctamente
- [ ] Hook de creación limpia event listeners en cleanup
- [ ] Hook de interacción usa capture + stopImmediatePropagation
- [ ] Preview SVG se re-renderiza en pan/zoom
- [ ] Settings dialog actualizado
- [ ] Toolbar tiene botón
- [ ] `PriceChart.tsx` llama hooks en orden correcto
- [ ] `useChartInteraction.ts` maneja cursor crosshair para la nueva herramienta
- [ ] El tipo está en el union `Drawing` (garantiza que `clearDrawings` lo borra correctamente)
- [ ] El lifecycle hook filtra por `d.type === "nueva_herramienta"` (garantiza detach al borrar todo)
- [ ] Sin `console.log` en código final
- [ ] Sin placeholders ni TODO pendientes
