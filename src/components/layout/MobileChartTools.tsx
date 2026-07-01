"use client";

import { useState, useEffect, useMemo, type ElementType } from "react";
import {
  Pencil,
  X,
  MousePointer2,
  Minus,
  Slash,
  RectangleHorizontal,
  MoreHorizontal,
  Search,
  Trash2,
  Ruler,
  Eye,
  EyeOff,
} from "lucide-react";
import { useChartStore, type DrawingTool } from "@/lib/store/chart-store";
import type { Timeframe, SymbolInfo } from "@/lib/binance/types";
import { fetchExchangeSymbols } from "@/lib/binance/rest";
import { ENTRIES } from "@/components/chart/IndicatorMenu";
import { SyncSheetSection } from "@/components/layout/SyncMenu";
import { Watchlist } from "@/components/watchlist/Watchlist";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d", "1w", "1M"];

const DRAWING_TOOLS: { key: DrawingTool; icon: ElementType; label: string }[] = [
  { key: "cursor", icon: MousePointer2, label: "Cursor" },
  { key: "hline", icon: Minus, label: "Horizontal" },
  { key: "trendline", icon: Slash, label: "Tendencia" },
  { key: "rectangle", icon: RectangleHorizontal, label: "Rectángulo" },
  { key: "measure", icon: Ruler, label: "Regla" },
];

type SheetType = "timeframe" | "drawings" | "more" | "watchlist" | "indicators" | "search" | null;

export function MobileChartTools() {
  const [activeSheet, setActiveSheet] = useState<SheetType>(null);
  // Keep the last-rendered sheet mounted during the slide-out animation.
  // Updated only from event handlers — never from effects.
  const [renderedSheet, setRenderedSheet] = useState<SheetType>(null);

  const tf = useChartStore((s) => s.timeframe);
  const setTf = useChartStore((s) => s.setTimeframe);
  const tool = useChartStore((s) => s.tool);
  const setTool = useChartStore((s) => s.setTool);
  const theme = useChartStore((s) => s.theme);
  const setTheme = useChartStore((s) => s.setTheme);

  const symbol = useChartStore((s) => s.symbol);
  const setSymbol = useChartStore((s) => s.setSymbol);

  const [allSymbols, setAllSymbols] = useState<SymbolInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const indicators = useChartStore((s) => s.indicators);
  const config = useChartStore((s) => s.config);
  const toggleIndicator = useChartStore((s) => s.toggleIndicator);
  const clearDrawings = useChartStore((s) => s.clearDrawings);
  const clearPriceLines = useChartStore((s) => s.clearPriceLines);
  const drawingsHidden = useChartStore((s) => s.drawingsHidden);
  const toggleDrawingsHidden = useChartStore((s) => s.toggleDrawingsHidden);
  const indicatorsHidden = useChartStore((s) => s.indicatorsHidden);
  const toggleIndicatorsHidden = useChartStore((s) => s.toggleIndicatorsHidden);

  useEffect(() => {
    if (activeSheet === "search" && allSymbols.length === 0) {
      fetchExchangeSymbols().then(setAllSymbols).catch(console.error);
    }
  }, [activeSheet, allSymbols.length]);

  const filteredSymbols = useMemo(() => {
    const q = searchQuery.trim().toUpperCase();
    if (!q) return allSymbols.slice(0, 100);
    return allSymbols
      .filter((s) => s.symbol.includes(q) || s.baseAsset.includes(q) || s.quoteAsset.includes(q))
      .slice(0, 100);
  }, [searchQuery, allSymbols]);

  // Open a sheet: set rendered content first, then open.
  // Resetting searchQuery here (not in an effect) avoids set-state-in-effect.
  const openSheet = (sheet: SheetType) => {
    if (sheet !== "search") setSearchQuery("");
    setRenderedSheet(sheet);
    setActiveSheet(sheet);
  };
  // Close: slide the container away; renderedSheet keeps its value so
  // the content remains mounted during the CSS transition.
  const closeSheet = () => {
    setSearchQuery("");
    setActiveSheet(null);
  };

  return (
    <>
      {/* Dimmed Background Overlay */}
      {activeSheet && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden transition-opacity"
          onClick={closeSheet}
        />
      )}

      {/* Bottom Sheet */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border-t border-tv-border bg-tv-panel shadow-2xl transition-transform duration-300 ease-out md:hidden",
          activeSheet ? "translate-y-0" : "translate-y-full",
          (renderedSheet === "watchlist" || renderedSheet === "search") && "h-[80vh]"
        )}
      >
        {renderedSheet !== "watchlist" && renderedSheet !== "search" && (
          <div className="flex items-center justify-between border-b border-tv-border px-3 py-2.5">
            <h3 className="text-sm font-semibold text-tv-text">
              {renderedSheet === "timeframe" && "Temporalidad"}
              {renderedSheet === "drawings" && "Herramientas de dibujo"}
              {renderedSheet === "more" && "Más opciones"}
              {renderedSheet === "indicators" && "Indicadores"}
            </h3>
            <button
              onClick={closeSheet}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-tv-bg text-tv-text-muted hover:text-tv-text"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className={cn("p-3 pb-safe", (renderedSheet === "watchlist" || renderedSheet === "search") && "p-0 flex-1 min-h-0 flex flex-col")}>
          {renderedSheet === "timeframe" && (
            <div className="grid grid-cols-4 gap-2">
              {TIMEFRAMES.map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setTf(t);
                    closeSheet();
                  }}
                  className={cn(
                    "rounded-lg py-2 text-sm font-medium uppercase transition-colors",
                    tf === t
                      ? "bg-tv-blue text-white"
                      : "bg-tv-bg text-tv-text-muted hover:text-tv-text"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {renderedSheet === "drawings" && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-4 gap-2">
                {DRAWING_TOOLS.map((t) => {
                  const Icon = t.icon;
                  const active = tool === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => {
                        setTool(t.key);
                        closeSheet();
                      }}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1.5 rounded-lg py-2 px-1 text-[10px] font-medium transition-colors text-center",
                        active
                          ? "bg-tv-blue text-white"
                          : "bg-tv-bg text-tv-text-muted hover:text-tv-text"
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="leading-tight break-words">{t.label}</span>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => {
                  toggleDrawingsHidden();
                  closeSheet();
                }}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors",
                  drawingsHidden
                    ? "bg-tv-blue/10 text-tv-blue hover:bg-tv-blue/20"
                    : "bg-tv-bg text-tv-text-muted hover:text-tv-text"
                )}
              >
                {drawingsHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                {drawingsHidden ? "Mostrar dibujos" : "Ocultar todos los dibujos"}
              </button>
              <button
                onClick={() => {
                  clearPriceLines(symbol);
                  clearDrawings(symbol);
                  closeSheet();
                }}
                className="flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium text-tv-red bg-tv-red/10 transition-colors hover:bg-tv-red/20"
              >
                <Trash2 className="h-4 w-4" />
                Borrar todos los dibujos
              </button>
            </div>
          )}

          {renderedSheet === "more" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between rounded-xl bg-tv-bg px-3 py-2">
                <span className="text-sm font-medium text-tv-text">Tema oscuro</span>
                <button
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                    theme === "dark" ? "bg-tv-blue" : "bg-tv-border"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      theme === "dark" ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>
              <SyncSheetSection />
            </div>
          )}

          {renderedSheet === "search" && (
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden rounded-t-2xl">
              <div className="flex items-center justify-between border-b border-tv-border px-3 py-2.5 shrink-0">
                <h3 className="text-sm font-semibold text-tv-text">Buscar símbolo</h3>
                <button
                  onClick={closeSheet}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-tv-bg text-tv-text-muted hover:text-tv-text"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="border-b border-tv-border p-3 shrink-0">
                <Input
                  autoFocus
                  placeholder="BTC, ETH, SOL…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-tv-bg"
                />
              </div>
              <ScrollArea className="flex-1 min-h-0">
                <div className="flex flex-col pb-safe">
                  {filteredSymbols.length === 0 && (
                    <div className="p-4 text-center text-xs text-tv-text-muted">Sin resultados</div>
                  )}
                  {filteredSymbols.map((s) => (
                    <button
                      key={s.symbol}
                      onClick={() => { setSymbol(s.symbol); closeSheet(); }}
                      className={cn(
                        "flex cursor-pointer items-center justify-between px-3 py-2 text-left text-xs transition-colors hover:bg-tv-panel-hover",
                        s.symbol === symbol && "bg-tv-panel-hover",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-tv-text">{s.baseAsset}</span>
                        <span className="text-[10px] text-tv-text-dim">{s.quoteAsset}</span>
                      </div>
                      <span className="text-tv-text-muted">{s.symbol}</span>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {renderedSheet === "watchlist" && (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-tv-panel">
              <Watchlist onClose={closeSheet} />
            </div>
          )}

          {renderedSheet === "indicators" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between rounded-xl bg-tv-bg px-3 py-2">
                <span className="text-sm font-medium text-tv-text">Ocultar todos los indicadores</span>
                <button
                  onClick={toggleIndicatorsHidden}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                    indicatorsHidden ? "bg-tv-blue" : "bg-tv-border"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      indicatorsHidden ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>
              {Object.entries(
                ENTRIES.reduce<Record<string, typeof ENTRIES[0][]>>((acc, i) => {
                  (acc[i.group] ||= []).push(i);
                  return acc;
                }, {})
              ).map(([group, items]) => (
                <div key={group} className="flex flex-col gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-tv-text-muted px-2">
                    {group}
                  </span>
                  <div className="flex flex-col rounded-xl bg-tv-bg">
                    {items.map((i, itemIdx) => (
                      <button
                        key={i.key}
                        onClick={() => toggleIndicator(i.key)}
                        className={cn(
                          "flex items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-tv-panel-hover",
                          itemIdx === 0 ? "rounded-t-xl" : "",
                          itemIdx === items.length - 1 ? "rounded-b-xl" : "",
                          itemIdx !== items.length - 1 ? "border-b border-tv-border" : ""
                        )}
                      >
                        <span className="text-tv-text">{i.label(config)}</span>
                        {indicators[i.key] && <Check className="h-4 w-4 text-tv-blue" />}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Horizontal Toolbar */}
      <div className="fixed bottom-0 inset-x-0 z-30 flex h-10 items-center justify-between border-t border-tv-border bg-tv-panel px-2 pb-safe md:hidden">
        <div className="flex items-center gap-1">
          <button
            onClick={() => openSheet("watchlist")}
            className="flex h-8 items-center rounded-md px-2 text-xs font-bold text-tv-text hover:bg-tv-panel-hover"
          >
            {symbol.replace("USDT", "")}
          </button>
          <button
            onClick={() => openSheet("timeframe")}
            className="flex h-8 min-w-[3rem] items-center justify-center rounded-md text-xs font-bold uppercase text-tv-text hover:bg-tv-panel-hover"
          >
            {tf}
          </button>
        </div>

        <div className="h-5 w-px bg-tv-border" />

        <div className="flex items-center gap-1">
          <button
            onClick={() => openSheet("indicators")}
            className="flex h-8 w-8 items-center justify-center rounded-md text-tv-text hover:bg-tv-panel-hover relative"
          >
            <Activity className="h-4 w-4" />
            {Object.values(indicators).filter(Boolean).length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-tv-blue text-[8px] font-bold text-white">
                {Object.values(indicators).filter(Boolean).length}
              </span>
            )}
          </button>
          <button
            onClick={() => openSheet("drawings")}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
              tool !== "cursor" ? "text-tv-blue" : "text-tv-text hover:bg-tv-panel-hover"
            )}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => openSheet("search")}
            className="flex h-8 w-8 items-center justify-center rounded-md text-tv-text hover:bg-tv-panel-hover"
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            onClick={() => openSheet("more")}
            className="flex h-8 w-8 items-center justify-center rounded-md text-tv-text hover:bg-tv-panel-hover"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}
