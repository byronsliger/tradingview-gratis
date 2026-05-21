Actúa como un experto en la arquitectura del proyecto TradingView Gratis. Tu tarea es implementar un nuevo **indicador técnico** siguiendo el patrón exacto establecido por los indicadores existentes (RSI, MACD, ADX, Squeeze Momentum).

El usuario te indicará qué indicador crear (ej: "Stochastic", "Williams %R", "CCI", "Bollinger Bands", etc.). Antes de escribir código, confirma el nombre del indicador, sus parámetros y si va en sub-pane o en el pane principal.

---

## Arquitectura del proyecto

**Stack:** Next.js 16, React 19, lightweight-charts v5, Zustand v5, TypeScript estricto.

**Paths clave:**
- Cálculos: `src/lib/indicators/` (funciones puras)
- Tipos de indicadores: `src/lib/indicators/types.ts`
- Barrel de exports: `src/lib/indicators/index.ts`
- Hooks del chart: `src/hooks/chart/`
- Store global: `src/lib/store/chart-store.ts`
- Componente principal: `src/components/chart/PriceChart.tsx`
- Menú de indicadores: `src/components/chart/IndicatorMenu.tsx`
- Diálogo de settings: `src/components/chart/IndicatorSettingsDialog.tsx`
- Settings individuales: `src/components/chart/indicator-settings/`
- Hook de datos: `src/hooks/chart/useKlineData.ts`

---

## Tipos base disponibles en `src/lib/indicators/types.ts`

```typescript
interface IndicatorPoint { time: number; value: number; }
interface MACDPoint { time: number; macd: number; signal: number; histogram: number; }
interface SqueezeMomPoint { time: number; val: number; sqzOn: boolean; sqzOff: boolean; noSqz: boolean; }
interface ADXPoint { time: number; adx: number; plusDI: number; minusDI: number; }
```

Si el nuevo indicador tiene múltiples líneas (ej: Stochastic con %K y %D), agrega una nueva interfaz al archivo `types.ts`.

---

## Candle type disponible

```typescript
// src/lib/binance/types.ts
interface Candle {
  time: number;  // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
```

---

## PASO 1 — Función de cálculo (`src/lib/indicators/<nombre>.ts`)

Crear función pura, sin efectos secundarios ni dependencias de React:

```typescript
import type { Candle } from "@/lib/binance/types";
import type { IndicatorPoint } from "./types";  // o tipo propio si tiene múltiples valores

export function myIndicator(
  candles: Candle[],
  period = 14,
  // ...otros parámetros con defaults
): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < period) return out;

  for (let i = period - 1; i < candles.length; i++) {
    // cálculo aquí
    out.push({ time: candles[i].time, value });
  }
  return out;
}
```

**Reglas de la función de cálculo:**
- Siempre verificar `candles.length < minRequired` y retornar `[]` si no hay suficientes datos
- Usar `candles[i].close`, `.high`, `.low`, `.open`, `.volume` según corresponda
- `time` siempre de `candles[i].time` (ya viene en segundos unix)
- Helpers internos comunes disponibles en archivos existentes (ver `ema.ts` para EMA seed, `adx.ts` para función `rma()`)

---

## PASO 2 — Exportar desde barrel (`src/lib/indicators/index.ts`)

Agregar al final:
```typescript
export { myIndicator } from "./my-indicator";
```

---

## PASO 3 — Store (`src/lib/store/chart-store.ts`)

### 3a. Agregar key al tipo `IndicatorKey`
```typescript
export type IndicatorKey =
  | "ema20" | "ema50" | "ema200"
  | "volume" | "rsi" | "macd" | "sqzmom" | "adx" | "vrvp"
  | "myindicator";  // ← agregar aquí
```

### 3b. Agregar parámetros al `IndicatorConfig`
```typescript
export interface IndicatorConfig {
  // ... existentes ...
  myIndicatorPeriod: number;
  myIndicatorColor: string;
  myIndicatorWidth: 1 | 2 | 3 | 4;
  myIndicatorStyle: number; // 0=solid, 1=dotted, 2=dashed, 3=large dashed
}
```

**Convención de nombres para parámetros:**
- Períodos numéricos: `myIndicatorPeriod`, `myIndicatorFastPeriod`, etc.
- Colores: `myIndicatorColor`, `myIndicatorColorRising`, `myIndicatorColorFalling`
- Ancho de línea: `myIndicatorWidth` (tipo `1 | 2 | 3 | 4`)
- Estilo de línea: `myIndicatorStyle` (0=solid, 1=dotted, 2=dashed, 3=large dashed)
- Niveles de referencia: `myIndicatorOverbought`, `myIndicatorOversold`
- Booleanos: `myIndicatorShowSignal`, `myIndicatorUseTrueRange`
- Multiplicadores: `myIndicatorMult` (float)

### 3c. Agregar valores default en `DEFAULT_CONFIG`
```typescript
export const DEFAULT_CONFIG: IndicatorConfig = {
  // ... existentes ...
  myIndicatorPeriod: 14,
  myIndicatorColor: "#2962ff",
  myIndicatorWidth: 2,
  myIndicatorStyle: 0,
};
```

### 3d. Agregar al `INDICATOR_COLORS`
```typescript
export const INDICATOR_COLORS: Record<IndicatorKey, string> = {
  // ... existentes ...
  myindicator: "#2962ff",
};
```

### 3e. Agregar flags en el estado inicial (buscar `indicators:` y `hidden:` en el store)
```typescript
indicators: {
  // ... existentes ...
  myindicator: false,
},
hidden: {
  // ... existentes ...
  myindicator: false,
},
```

---

## PASO 4 — Hook (`src/hooks/chart/useMyIndicatorPane.ts`)

### Patrón completo para indicador de sub-pane con LineSeries:

```typescript
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { LineSeries, type ISeriesApi, type UTCTimestamp, type IChartApi } from "lightweight-charts";
import { myIndicator } from "@/lib/indicators";
import { TV_COLORS } from "@/lib/chart/chart-colors";
import type { Candle } from "@/lib/binance/types";
import type { IndicatorConfig, IndicatorKey } from "@/lib/store/chart-store";

export function useMyIndicatorPane(
  chartRef: RefObject<IChartApi | null>,
  candlesRef: RefObject<Candle[]>,
  indicators: Record<IndicatorKey, boolean>,
  hidden: Record<IndicatorKey, boolean>,
  config: IndicatorConfig,
  recomputePaneOffsets: () => void,
) {
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const configRef = useRef(config);
  configRef.current = config;  // siempre fresco, sin re-crear callbacks
  const [lastMyIndicator, setLastMyIndicator] = useState<number | undefined>(undefined);

  const updateMyIndicator = useCallback(() => {
    const c = candlesRef.current;
    if (c.length === 0 || !seriesRef.current) return;
    const cfg = configRef.current;
    const data = myIndicator(c, cfg.myIndicatorPeriod).map((p) => ({
      time: p.time as UTCTimestamp,
      value: p.value,
    }));
    seriesRef.current.setData(data);
    setLastMyIndicator(data.at(-1)?.value);
  }, [candlesRef]);

  // ADD / REMOVE — reacciona a indicators.myindicator
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = chartRef.current;

    if (indicators.myindicator && !seriesRef.current) {
      // Calcular pane index dinámicamente (suma 1 por cada indicador de sub-pane activo antes)
      const paneIndex =
        (indicators.rsi ? 1 : 0) +
        (indicators.macd ? 1 : 0) +
        (indicators.sqzmom ? 1 : 0) +
        1;

      const s = chart.addSeries(
        LineSeries,
        {
          color: config.myIndicatorColor,
          lineWidth: config.myIndicatorWidth,
          lineStyle: config.myIndicatorStyle,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      seriesRef.current = s;
      s.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
      // Stretch factors: main pane 3x, sub-panes 1x
      chart.panes()[0]?.setStretchFactor(3);
      chart.panes()[paneIndex]?.setStretchFactor(1);
      updateMyIndicator();
    } else if (!indicators.myindicator && seriesRef.current) {
      chart.removeSeries(seriesRef.current);
      seriesRef.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.myindicator]);

  // Reacciona a cambios en otros sub-panes (pueden desplazar el pane index)
  useEffect(() => {
    if (!seriesRef.current || !indicators.myindicator) return;
    // Si se agregó/quitó RSI o MACD mientras este indicador estaba activo:
    // lightweight-charts gestiona el orden de panes automáticamente al reordenar.
    // Solo necesitamos re-renderizar el pane si cambia el índice.
    // En la mayoría de casos no es necesario hacer nada — los datos ya están seteados.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.rsi, indicators.macd, indicators.sqzmom]);

  // HIDE / SHOW
  useEffect(() => {
    seriesRef.current?.applyOptions({
      visible: indicators.myindicator && !hidden.myindicator,
    });
  }, [indicators.myindicator, hidden.myindicator]);

  // Recalcular cuando cambian parámetros de cálculo
  useEffect(() => {
    updateMyIndicator();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.myIndicatorPeriod]);

  // Actualizar estilo visual sin recalcular
  useEffect(() => {
    seriesRef.current?.applyOptions({
      color: config.myIndicatorColor,
      lineWidth: config.myIndicatorWidth,
      lineStyle: config.myIndicatorStyle,
    });
  }, [config.myIndicatorColor, config.myIndicatorWidth, config.myIndicatorStyle]);

  return { updateMyIndicator, lastMyIndicator };
}
```

---

## Variantes de series según el tipo de indicador

### HistogramSeries (para osciladores con barras)
```typescript
import { HistogramSeries, type ISeriesApi } from "lightweight-charts";

const s = chart.addSeries(HistogramSeries, {
  priceLineVisible: false,
  lastValueVisible: false,
}, paneIndex);

// Data con color por barra
s.setData(data.map(p => ({
  time: p.time as UTCTimestamp,
  value: p.value,
  color: p.value >= 0 ? `${TV_COLORS.green}80` : `${TV_COLORS.red}80`,
})));
```

### Múltiples series en el mismo pane (ej: MACD = línea + señal + histograma)
```typescript
// Todas con el mismo paneIndex → van al mismo pane
const macdLine = chart.addSeries(LineSeries, { color: TV_COLORS.blue }, paneIndex);
const signalLine = chart.addSeries(LineSeries, { color: TV_COLORS.yellow }, paneIndex);
const histogram = chart.addSeries(HistogramSeries, {}, paneIndex);
```

### Líneas de referencia (ej: RSI 30/70, ADX niveles)
```typescript
// Opción A: LineSeries separada con solo 2 puntos (primera y última vela)
const ref30 = chart.addSeries(LineSeries, {
  color: "#787b86",
  lineWidth: 1,
  lineStyle: 2, // dashed
  priceLineVisible: false,
  lastValueVisible: false,
}, paneIndex);
const times = candlesRef.current;
ref30.setData([
  { time: times[0].time as UTCTimestamp, value: 30 },
  { time: times.at(-1)!.time as UTCTimestamp, value: 30 },
]);

// Opción B: createPriceLine en la serie principal (para niveles configurables)
const priceLine = series.createPriceLine({
  price: config.myIndicatorLevel,
  color: config.myIndicatorLevelColor,
  lineWidth: 1,
  lineStyle: 2,
  axisLabelVisible: false,
  title: "Level",
});
// Para actualizar: series.removePriceLine(priceLine); y crear nuevo
```

### LineSeries con solo puntos (sin línea) — para dots de Squeeze
```typescript
const dots = chart.addSeries(LineSeries, {
  lineWidth: 4,
  pointMarkersVisible: true,
  pointMarkersRadius: 2,
  lineVisible: false,
  priceLineVisible: false,
  lastValueVisible: false,
}, paneIndex);
```

### CustomSeries (para renderers canvas avanzados como VRVP)
```typescript
import { CustomSeries } from "lightweight-charts";
const s = chart.addCustomSeries(new MyCustomPaneView(), {
  priceLineVisible: false,
  lastValueVisible: false,
}, paneIndex);
```

---

## Cálculo del pane index

Regla general: cada indicador de sub-pane consume un pane. El orden de aparición determina el índice:

```
Pane 0: Candles + EMAs + Volume + VRVP
Pane 1: RSI (si activo)
Pane 2: MACD (si activo)  
Pane 3: SQZ / ADX (comparten pane? No — cada uno toma el siguiente disponible)
```

Fórmula para un nuevo indicador que va DESPUÉS de RSI, MACD y SQZ:
```typescript
const paneIndex =
  (indicators.rsi    ? 1 : 0) +
  (indicators.macd   ? 1 : 0) +
  (indicators.sqzmom ? 1 : 0) +
  (indicators.adx    ? 1 : 0) +
  1;
```

**IMPORTANTE:** Si el indicador nuevo comparte pane con otro existente (raro), ambos usan el MISMO paneIndex. Si va en el pane principal (pane 0), usar `paneIndex = 0` o simplemente no pasar el tercer argumento a `addSeries`.

---

## PASO 5 — Conectar en `PriceChart.tsx`

### 5a. Importar el hook
```typescript
import { useMyIndicatorPane } from "@/hooks/chart/useMyIndicatorPane";
```

### 5b. Instanciar el hook (después de useADXPane, antes de useVRVPSeries)
```typescript
const { updateMyIndicator, lastMyIndicator } = useMyIndicatorPane(
  chartRef,
  candlesRef,
  indicators,
  hidden,
  config,
  recomputePaneOffsets,
);
```

### 5c. Pasar updateMyIndicator a useKlineData
En el objeto de callbacks que recibe `useKlineData`, agregar:
```typescript
const { lastPrice, isLoadingHistory } = useKlineData(
  symbol,
  timeframe,
  chartRef,
  candlesRef,
  {
    candleSeriesRef,
    volumeSeriesRef,
    updateEMAs,
    updateRSI,
    updateMACD,
    updateSQZ,
    updateADX,
    updateMyIndicator,  // ← agregar aquí
    updateVRVP,
    recomputePaneOffsets,
  },
);
```

**IMPORTANTE:** También verificar el tipo del objeto de callbacks en `useKlineData.ts` y agregar `updateMyIndicator?: () => void` si usa tipado estricto.

### 5d. Pasar lastMyIndicator al legend (SubPaneLegend o ChartLegend)
Buscar dónde se pasan los `lastValues` o props de legends y agregar el nuevo valor.

### 5e. Registrar el pill en ChartLegend (solo para indicadores overlay/pane 0)

Si el indicador va en el pane principal (overlay), editar `src/components/chart/overlay/ChartLegend.tsx`:

```typescript
// 1. Incrementar mainCount para que el botón de colapso lo cuente
const mainCount = [..., indicators.myindicator].filter(Boolean).length;

// 2. Agregar el pill dentro del bloque !collapsed
{indicators.myindicator && (
  <IndicatorPill
    name="MyIndicator"
    value={undefined}
    color={INDICATOR_COLORS.myindicator}
    hidden={hidden.myindicator}
    onToggleHide={() => toggleHidden("myindicator")}
    onSettings={() => setSettingsTarget("myindicator")}
    onRemove={() => removeIndicator("myindicator")}
  />
)}
```

Para sub-panes (RSI, MACD, ADX, etc.) el pill ya se gestiona en `SubPaneLegend.tsx`.

---

## PASO 6 — Settings dialog

### 6a. Crear componente de settings (`src/components/chart/indicator-settings/MyIndicatorSettings.tsx`)

```typescript
"use client";
import type { IndicatorConfig } from "@/lib/store/chart-store";

interface Props {
  config: IndicatorConfig;
  onSave: (patch: Partial<IndicatorConfig>) => void;
  onReset: () => void;
}

export function MyIndicatorSettings({ config, onSave, onReset }: Props) {
  return (
    <div className="space-y-4">
      {/* Inputs numéricos */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-muted-foreground w-24">Period</label>
        <input
          type="number"
          min={1}
          max={200}
          value={config.myIndicatorPeriod}
          onChange={(e) => onSave({ myIndicatorPeriod: parseInt(e.target.value) || 14 })}
          className="w-20 rounded border bg-background px-2 py-1 text-sm"
        />
      </div>

      {/* Color picker */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-muted-foreground w-24">Color</label>
        <input
          type="color"
          value={config.myIndicatorColor}
          onChange={(e) => onSave({ myIndicatorColor: e.target.value })}
          className="h-7 w-12 cursor-pointer rounded border"
        />
      </div>

      {/* Botón reset */}
      <button
        onClick={onReset}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        Reset defaults
      </button>
    </div>
  );
}
```

### 6b. Registrar en `IndicatorSettingsDialog.tsx`
```typescript
import { MyIndicatorSettings } from "./indicator-settings/MyIndicatorSettings";

// Dentro del render del dialog, agregar caso:
{target === "myindicator" && (
  <MyIndicatorSettings config={config} onSave={handleSave} onReset={handleReset} />
)}
```

---

## PASO 7 — Menú de indicadores (`IndicatorMenu.tsx`)

Agregar entrada al array `ENTRIES`:
```typescript
const ENTRIES: Entry[] = [
  // ... existentes ...
  {
    key: "myindicator",
    group: "Osciladores",      // o "Tendencia", "Volatilidad", "Volumen"
    label: (c) => `My Indicator (${c.myIndicatorPeriod})`,
  },
];
```

**Grupos disponibles:**
- `"Medias móviles"` — EMA, SMA, WMA
- `"Osciladores"` — RSI, MACD, Stochastic, CCI, Williams %R
- `"Volatilidad"` — Bollinger Bands, ATR, Squeeze
- `"Tendencia"` — ADX, PSAR, Ichimoku
- `"Volumen"` — Volume, VRVP, OBV

---

## PASO 8 — Verificación final

Checklist antes de considerar el indicador completo:

- [ ] `src/lib/indicators/my-indicator.ts` — función pura sin efectos
- [ ] `src/lib/indicators/index.ts` — exportado
- [ ] `src/lib/indicators/types.ts` — tipo propio si tiene múltiples valores
- [ ] `src/lib/store/chart-store.ts` — IndicatorKey, IndicatorConfig, DEFAULT_CONFIG, INDICATOR_COLORS, flags iniciales
- [ ] `src/hooks/chart/useMyIndicatorPane.ts` — hook completo con add/remove/hide/update
- [ ] `src/components/chart/PriceChart.tsx` — hook instanciado, updateFn pasada a useKlineData
- [ ] `src/hooks/chart/useKlineData.ts` — tipo de callback actualizado si es tipado
- [ ] `src/components/chart/indicator-settings/MyIndicatorSettings.tsx` — formulario de settings
- [ ] `src/components/chart/IndicatorSettingsDialog.tsx` — caso registrado
- [ ] `src/components/chart/IndicatorMenu.tsx` — entrada en ENTRIES
- [ ] `src/components/chart/overlay/ChartLegend.tsx` — pill en la leyenda del pane principal (overlay) **o** `SubPaneLegend.tsx` para sub-panes

**Nota:** Los indicadores overlay (pane 0) deben registrarse en `ChartLegend.tsx`, incrementar `mainCount` y agregar su `<IndicatorPill>`. Los sub-pane se registran en `SubPaneLegend.tsx`.

---

## Patrones de stale closure — OBLIGATORIO leer

Los hooks de indicadores usan `configRef` para evitar stale closures:

```typescript
// ✅ CORRECTO: configRef siempre tiene el valor actual
const configRef = useRef(config);
configRef.current = config;  // actualizar en cada render, NO en useEffect

const updateMyIndicator = useCallback(() => {
  const cfg = configRef.current;  // leer desde ref, no desde closure
  const data = myIndicator(c, cfg.myIndicatorPeriod);
  // ...
}, [candlesRef]);  // NO incluir config en dependencies

// ❌ INCORRECTO: captura el valor de config del primer render
const updateMyIndicator = useCallback(() => {
  const data = myIndicator(c, config.myIndicatorPeriod);  // stale!
}, []);
```

Los efectos de larga vida (add/remove series) también usan refs:
```typescript
const indicatorsRef = useRef(indicators);
indicatorsRef.current = indicators;
```

---

## Colores disponibles (`TV_COLORS` desde `src/lib/chart/chart-colors.ts`)

```typescript
TV_COLORS.green      // #26a69a (verde alcista)
TV_COLORS.red        // #ef5350 (rojo bajista)  
TV_COLORS.blue       // #2962ff (azul primario)
TV_COLORS.yellow     // #ffb74d (amarillo señal)
TV_COLORS.text       // #d1d4dc (texto gris claro)
TV_COLORS.grid       // color de grilla
```

Para transparencia: `${TV_COLORS.green}80` (50% opacidad en hex).

---

## Ejemplos de referencia

| Indicador | Hook | Tipo series | Complejidad |
|-----------|------|-------------|-------------|
| RSI | `useRSIPane.ts` | 3x LineSeries | Simple |
| Volume | `useVolumeSeries.ts` | HistogramSeries | Simple |
| MACD | `useMACDPane.ts` | Line + Line + Histogram | Media |
| ADX | `useADXPane.ts` | LineSeries + PriceLines | Media |
| Squeeze | `useSQZPane.ts` | Histogram + Dots (LineSeries) | Alta |
| VRVP | `useVRVPSeries.ts` | CustomSeries | Muy alta |

Leer el hook más similar al indicador nuevo antes de implementar.
