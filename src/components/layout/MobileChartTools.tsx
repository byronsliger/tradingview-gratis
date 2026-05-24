"use client";

import { useState, useEffect } from "react";
import {
  Pencil,
  X,
  MousePointer2,
  Minus,
  Slash,
  RectangleHorizontal,
  Moon,
  Sun,
  Plus,
  MoreHorizontal,
  Search,
} from "lucide-react";
import { useChartStore, type DrawingTool } from "@/lib/store/chart-store";
import type { Timeframe } from "@/lib/binance/types";
import { IndicatorMenu, ENTRIES } from "@/components/chart/IndicatorMenu";
import { Watchlist } from "@/components/watchlist/Watchlist";
import { Check, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d", "1w", "1M"];

const DRAWING_TOOLS: { key: DrawingTool; icon: any; label: string }[] = [
  { key: "cursor", icon: MousePointer2, label: "Cursor" },
  { key: "hline", icon: Minus, label: "Horizontal" },
  { key: "trendline", icon: Slash, label: "Tendencia" },
  { key: "rectangle", icon: RectangleHorizontal, label: "Rectángulo" },
];

type SheetType = "timeframe" | "drawings" | "more" | "watchlist" | "indicators" | null;

export function MobileChartTools() {
  const [activeSheet, setActiveSheet] = useState<SheetType>(null);
  const [renderedSheet, setRenderedSheet] = useState<SheetType>(null);

  useEffect(() => {
    if (activeSheet) setRenderedSheet(activeSheet);
  }, [activeSheet]);

  const mobileTab = useChartStore((s) => s.mobileTab);
  const tf = useChartStore((s) => s.timeframe);
  const setTf = useChartStore((s) => s.setTimeframe);
  const tool = useChartStore((s) => s.tool);
  const setTool = useChartStore((s) => s.setTool);
  const theme = useChartStore((s) => s.theme);
  const setTheme = useChartStore((s) => s.setTheme);

  const symbol = useChartStore((s) => s.symbol);
  const setSymbolDialogOpen = useChartStore((s) => s.setSymbolDialogOpen);
  const indicators = useChartStore((s) => s.indicators);
  const config = useChartStore((s) => s.config);
  const toggleIndicator = useChartStore((s) => s.toggleIndicator);

  // Close sheet when symbol changes
  const [prevSymbol, setPrevSymbol] = useState(symbol);
  useEffect(() => {
    if (symbol !== prevSymbol) {
      setPrevSymbol(symbol);
      if (activeSheet === "watchlist") {
        setActiveSheet(null);
      }
    }
  }, [symbol, prevSymbol, activeSheet]);

  const closeSheet = () => setActiveSheet(null);

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
          activeSheet ? "translate-y-0" : "translate-y-full"
        )}
      >
        {renderedSheet !== "watchlist" && (
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

        <div className={cn("p-3 pb-safe", renderedSheet === "watchlist" && "p-0")}>
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
            </div>
          )}

          {renderedSheet === "watchlist" && (
            <div className="h-[80vh] flex flex-col overflow-hidden bg-tv-panel">
              <Watchlist onClose={closeSheet} />
            </div>
          )}

          {renderedSheet === "indicators" && (
            <div className="flex flex-col gap-4">
              {Object.entries(
                ENTRIES.reduce<Record<string, typeof ENTRIES[0][]>>((acc, i) => {
                  (acc[i.group] ||= []).push(i);
                  return acc;
                }, {})
              ).map(([group, items], idx) => (
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
            onClick={() => setActiveSheet("watchlist")}
            className="flex h-8 items-center rounded-md px-2 text-xs font-bold text-tv-text hover:bg-tv-panel-hover"
          >
            {symbol.replace("USDT", "")}
          </button>
          <button
            onClick={() => setActiveSheet("timeframe")}
            className="flex h-8 min-w-[3rem] items-center justify-center rounded-md text-xs font-bold uppercase text-tv-text hover:bg-tv-panel-hover"
          >
            {tf}
          </button>
        </div>

        <div className="h-5 w-px bg-tv-border" />

        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveSheet("indicators")}
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
            onClick={() => setActiveSheet("drawings")}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
              tool !== "cursor" ? "text-tv-blue" : "text-tv-text hover:bg-tv-panel-hover"
            )}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => setSymbolDialogOpen(true, "search")}
            className="flex h-8 w-8 items-center justify-center rounded-md text-tv-text hover:bg-tv-panel-hover"
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            onClick={() => setActiveSheet("more")}
            className="flex h-8 w-8 items-center justify-center rounded-md text-tv-text hover:bg-tv-panel-hover"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}
