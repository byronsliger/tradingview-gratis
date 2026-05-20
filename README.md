# TradingView Gratis 📈

> **Una alternativa open-source y 100% gratis a TradingView Pro, pensada para LATAM.**
> Velas en vivo, indicadores propios, watchlist, multi-timeframe — sin pagar USD, sin login, sin ads.

Plataforma de charts crypto construida sobre los datos públicos de **Binance** (WebSocket) y la misma librería de render que usa TradingView ([`lightweight-charts`](https://github.com/tradingview/lightweight-charts)).

---

## ✨ Features

- 📊 **Velas en vivo** vía WebSocket de Binance (sin API key)
- 🔍 **Búsqueda de símbolo** sobre todos los pares USDT del exchange
- ⏱️ **Multi-timeframe**: 1m / 5m / 15m / 1h / 4h / 1d / 1w
- 📐 **Indicadores client-side**: EMA 20/50/200, RSI 14, MACD 12/26/9, ADX/DMI, Squeeze Momentum, VRVP, Volumen
- 🎯 **Estrategia TradingLatino**: todos los indicadores usados en la metodología de [@TradingLatino](https://www.youtube.com/@TradingLatino) están incluidos (EMA 10/55, MACD, Squeeze Momentum, ADX)
- 👁️ **Watchlist** con precios y cambio 24h actualizándose en tiempo real
- 🎨 **Visual idéntica a TradingView** (paleta, fuentes, layout)
- 💾 **Persistencia** en localStorage (símbolo, timeframe, indicadores)
- 🔌 **Reconexión robusta** del WebSocket con backoff exponencial
- 🌐 100% client-side — deploy estático en Vercel/Cloudflare

## 🚀 Empezar

```bash
npm install
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000).

## 🛠️ Stack

| Capa | Tech |
|---|---|
| Framework | Next.js 16 (App Router) |
| Lenguaje | TypeScript |
| Estilos | Tailwind CSS 4 + shadcn/ui |
| Charts | [lightweight-charts](https://github.com/tradingview/lightweight-charts) v5 |
| Estado | Zustand (con persistencia) |
| Iconos | lucide-react |
| Datos | Binance Public REST + WebSocket |

## 📐 Arquitectura

```
src/
├── app/
│   ├── layout.tsx          # Root, fuente Inter, TooltipProvider, dark
│   ├── page.tsx            # Dashboard armando el layout
│   └── globals.css         # Paleta TradingView
├── components/
│   ├── chart/
│   │   ├── PriceChart.tsx     # Chart core (lightweight-charts + panes)
│   │   ├── SymbolSelector.tsx # Búsqueda de pares USDT
│   │   ├── TimeframeSelector.tsx
│   │   └── IndicatorMenu.tsx  # Toggle EMA/RSI/MACD/Volume
│   ├── layout/
│   │   ├── Header.tsx
│   │   ├── LeftSidebar.tsx    # Iconos drawing tools (visual)
│   │   ├── RightSidebar.tsx
│   │   └── BottomPanel.tsx    # Stats 24h
│   ├── watchlist/
│   │   └── Watchlist.tsx      # Precios live multi-símbolo
│   └── ui/                    # shadcn primitives
└── lib/
    ├── binance/
    │   ├── rest.ts            # klines / ticker / exchangeInfo
    │   ├── ws.ts              # WS multiplex + auto-reconnect
    │   └── types.ts
    ├── indicators/
    │   └── index.ts           # SMA, EMA, RSI (Wilder), MACD
    ├── store/
    │   └── chart-store.ts     # Zustand global state
    └── format.ts              # formatPrice / formatPct / formatVolume
```

## 🌐 Deploy a Vercel

```bash
npm i -g vercel
vercel
```

O conectá el repo en [vercel.com/new](https://vercel.com/new) y deploy automático. No hay variables de entorno — todo es cliente.

## 🧠 Cómo funciona

### Datos históricos
Al abrir un símbolo se hace un `GET /api/v3/klines` (REST) que trae las últimas **1000 velas** del par + timeframe activo. Se renderizan instantáneamente.

### Datos en vivo
Una única conexión WebSocket multiplexada (`stream.binance.com`) recibe:
- `<symbol>@kline_<interval>` → updates de la vela actual + cierre de velas
- `<symbol>@miniTicker` → tickers del watchlist

Al reconectarse (Binance corta el WS cada 24h) se vuelven a suscribir todos los streams activos con backoff exponencial.

### Indicadores
Se calculan **client-side** sobre el array de velas en cada update. Implementaciones puras de TypeScript:

| Indicador | Descripción |
|---|---|
| `EMA 10/50` | Media móvil exponencial — base de la estrategia TradingLatino |
| `MACD 12/26/9` | Divergencia de medias, histograma y señal |
| `RSI 14` | Wilder (suavizado exponencial sobre ganancias/pérdidas) |
| `ADX / DMI` | Fuerza de tendencia + líneas +DI / −DI |
| `Squeeze Momentum` | Identifica compresión de volatilidad (TTM Squeeze) |
| `VRVP` | Volume Range Visible Profile — perfil de volumen por rango visible |
| `Volumen` | Histograma de volumen con colores alcista/bajista |

#### Estrategia TradingLatino
La plataforma incluye todos los indicadores del sistema enseñado por TradingLatino:
- **EMA 10, 55** para tendencia y soportes dinámicos
- **MACD** para momentum y divergencias
- **Squeeze Momentum** para entradas en baja volatilidad
- **ADX** para confirmar la fuerza de la tendencia antes de entrar

Para 1000 velas y panes múltiples el costo computacional es despreciable.

## ⚠️ Qué NO incluye (todavía)

- ❌ Pine Script (propietario de TradingView, no se puede clonar)
- ❌ Drawing tools persistentes (Fibo, trend lines arrastrables)
- ❌ Replay bar-by-bar
- ❌ Alertas server-side (siguiente video de la serie)
- ❌ Trading real (bot con API privada — video 4)

## 📺 Serie de videos

Este repo es la base de la serie **"TradingView Gratis"**:

1. ✅ **Video 1 — Base**: lo que ves acá
2. 🔜 **Video 2 — Alertas**: Supabase + Telegram bot
3. 🔜 **Video 3 — Indicadores AI**: SuperTrend, Ichimoku, custom con Claude
4. 🔜 **Video 4 — Bot que opera**: API privada Binance + ejecución

## 📄 Licencia

MIT — usalo, forkealo, monetizalo, lo que quieras.

`lightweight-charts` es Apache 2.0 con atribución a TradingView — la atribución vive en el footer/UI por requerimiento de la licencia.
