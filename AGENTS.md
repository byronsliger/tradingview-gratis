<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AI Agent Instructions (AGENTS.md)

Welcome! This file provides comprehensive instructions, context, rules, and commands to help AI agents work effectively in the **TradingView Gratis** repository.

---

## 📋 Project Overview
**TradingView Gratis** is a highly premium, real-time financial charting platform inspired by TradingView. It connects to the Binance REST and WebSocket APIs to stream live crypto market data and integrates a custom indicator engine.

---

## 🛠️ Technology Stack
- **Framework**: Next.js 16.2.6 & React 19.2.4 (App Router)
- **Styling & Components**: 
  - Tailwind CSS v4 (`@tailwindcss/postcss`)
  - `@base-ui/react` (for robust accessible primitives)
  - `class-variance-authority`, `clsx`, `tailwind-merge`
  - Lucide icons (`lucide-react`)
- **Charting Engine**: TradingView's `lightweight-charts` (v5.2.0)
- **State Management**: `zustand` (v5.0.13)
- **API & Streaming**: Binance REST & WebSockets

---

## 🗂️ Core Repository Structure
- **`src/app/`**: Next.js App Router (Layouts, pages, styles)
  - `globals.css`: Base styles, Tailwind configuration, color variables
- **`src/components/`**: React Components
  - `chart/`: Charting components (`PriceChart.tsx`, `SymbolSelector.tsx`, `IndicatorSettingsDialog.tsx`, etc.)
  - `watchlist/`: Watchlist UI (`Watchlist.tsx`)
  - `layout/`: Shared layouts
  - `ui/`: Reusable primitive components (shadcn-inspired)
- **`src/lib/`**: Custom core logic
  - `binance/`: Binance API client (`rest.ts`, `ws.ts`)
  - `indicators/`: Custom technical indicators (SMA, EMA, MACD, RSI, ADX, Squeeze Momentum)
  - `store/`: Zustand global store (`chart-store.ts`)

---

## 💻 Crucial Commands
Run these commands from the workspace root (ensure Node 24+):

- **Development Server**: `npm run dev`
- **Build Production Bundle**: `npm run build`
- **Code Linting**: `npm run lint`

---

## 🎨 Design & Style Guidelines
- **Premium Aesthetics**: Maintain a beautiful, sleek dark mode matching TradingView's professional UI. Use polished gradients, micro-interactions, clean glassmorphism, and unified HSL colors.
- **Tailwind CSS v4**: Utilize native CSS variables and modern Tailwind v4 configurations. Avoid redundant class declarations.
- **Component Design**: Build modular, reusable, and accessible components using `@base-ui/react` primitives.

---

## ⚙️ Coding Patterns & Rules

### 1. React & TypeScript
- Use strict TypeScript definitions. Define props and state interfaces explicitly.
- Separate **Client Components** (`"use client"`) from Server Components strictly. All interactive charting, Binance connections, and Zustand integration belong in Client Components.

### 2. State & Data Flow
- All global configurations (e.g., active symbol, timeframe, active indicators, indicators parameters) must reside in the Zustand store (`src/lib/store/chart-store.ts`).
- Avoid duplicate state. Sync components to the store instead of passing deep nested callbacks.

### 3. Charting (`lightweight-charts`)
- Maintain logic modularity inside `src/components/chart/PriceChart.tsx`.
- Safely initialize, update, and remove chart series and markers.
- Implement robust cleanup (`chart.remove()`) when components unmount to prevent canvas leaks or multiple instances.

### 4. Technical Indicators
- All technical indicators are calculated on custom data arrays.
- Keep calculations in `src/lib/indicators/` clean and separated from the UI.
- Adhere to the shapes in `src/lib/indicators/types.ts`.

### 5. WebSockets & Subscriptions
- WebSocket subscriptions (`ws.ts`) must handle reconnection and gracefully clean up event listeners to avoid memory leaks.

---

## ⚠️ Guardrails (Read Before Coding!)
1. **WebSocket & Canvas Leakage**: Always ensure `useEffect` returns proper cleanup functions for charts and WebSockets.
2. **Next.js 16/React 19**: Do NOT use deprecated APIs. Always check `node_modules/next/dist/docs/` or verify syntax if a React API throws a warning.
3. **No Placeholders**: Never implement dummy code. All logic should hook into actual state/API configurations.
