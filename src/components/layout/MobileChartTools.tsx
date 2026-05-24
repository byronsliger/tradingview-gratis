"use client";

import { useState } from "react";
import {
  Pencil,
  X,
  MousePointer2,
  Minus,
  Slash,
  RectangleHorizontal,
  Clock,
  Moon,
  Sun,
} from "lucide-react";
import { useChartStore, type DrawingTool } from "@/lib/store/chart-store";
import type { Timeframe } from "@/lib/binance/types";
import { IndicatorMenu } from "@/components/chart/IndicatorMenu";
import { cn } from "@/lib/utils";

const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d", "1w", "1M"];

const DRAWING_TOOLS: { key: DrawingTool; icon: any; label: string }[] = [
  { key: "cursor", icon: MousePointer2, label: "Cursor" },
  { key: "hline", icon: Minus, label: "Línea horizontal" },
  { key: "trendline", icon: Slash, label: "Línea de tendencia" },
  { key: "rectangle", icon: RectangleHorizontal, label: "Rectángulo" },
];

export function MobileChartTools() {
  const [open, setOpen] = useState(false);

  const mobileTab = useChartStore((s) => s.mobileTab);
  const tf = useChartStore((s) => s.timeframe);
  const setTf = useChartStore((s) => s.setTimeframe);
  const tool = useChartStore((s) => s.tool);
  const setTool = useChartStore((s) => s.setTool);
  const theme = useChartStore((s) => s.theme);
  const setTheme = useChartStore((s) => s.setTheme);

  // Only show on chart tab
  if (mobileTab !== "chart") return null;

  return (
    <>
      {/* Dimmed Background Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Floating Menu */}
      <div className="fixed bottom-20 right-4 z-50 flex flex-col items-end gap-3 md:hidden">
        {open && (
          <div className="flex flex-col gap-4 rounded-xl border border-tv-border bg-tv-panel p-4 shadow-xl mb-2 w-64 origin-bottom-right animate-in fade-in zoom-in-95">
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-tv-text-muted">
                <Clock className="h-3.5 w-3.5" />
                <span>Temporalidad</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {TIMEFRAMES.map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setTf(t);
                      setOpen(false);
                    }}
                    className={cn(
                      "rounded py-1.5 text-xs font-medium uppercase transition-colors",
                      tf === t
                        ? "bg-tv-blue text-white"
                        : "bg-tv-bg text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-tv-border" />

            <div>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-tv-text-muted">
                <Pencil className="h-3.5 w-3.5" />
                <span>Herramientas de dibujo</span>
              </div>
              <div className="flex flex-col gap-1">
                {DRAWING_TOOLS.map((t) => {
                  const Icon = t.icon;
                  const active = tool === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => {
                        setTool(t.key);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex items-center gap-3 rounded px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-tv-blue/15 text-tv-blue"
                          : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="h-px bg-tv-border" />

            <div className="flex items-center justify-between">
              <IndicatorMenu />
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="flex h-8 w-8 items-center justify-center rounded text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
                title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            </div>
          </div>
        )}

        {/* FAB */}
        <button
          onClick={() => setOpen(!open)}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-tv-blue text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
          title="Herramientas"
        >
          {open ? <X className="h-5 w-5" /> : <Pencil className="h-5 w-5" />}
        </button>
      </div>
    </>
  );
}
