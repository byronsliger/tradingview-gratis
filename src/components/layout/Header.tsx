"use client";

import { Code2, Moon, Sun, Zap } from "lucide-react";
import { SymbolSelector } from "@/components/chart/SymbolSelector";
import { TimeframeSelector } from "@/components/chart/TimeframeSelector";
import { IndicatorMenu } from "@/components/chart/IndicatorMenu";
import { Separator } from "@/components/ui/separator";
import { useChartStore } from "@/lib/store/chart-store";

export function Header() {
  const theme = useChartStore((s) => s.theme);
  const setTheme = useChartStore((s) => s.setTheme);

  return (
    <header className="hidden h-12 items-center justify-between border-b border-tv-border bg-tv-panel px-3 md:flex">
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-2 pr-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-tv-blue/20">
            <Zap className="h-4 w-4 text-tv-blue" />
          </div>
          <span className="hidden text-sm font-semibold text-tv-text sm:inline">
            TradingView <span className="text-tv-text-muted">Gratis</span>
          </span>
        </div>
        <Separator orientation="vertical" className="h-6 bg-tv-border" />
        <SymbolSelector />
        <Separator orientation="vertical" className="hidden h-6 bg-tv-border md:block" />
        <div className="hidden md:block">
          <TimeframeSelector />
        </div>
        <Separator orientation="vertical" className="mx-1 h-6 bg-tv-border" />
        <IndicatorMenu />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="flex h-7 w-7 items-center justify-center rounded text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>
        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden items-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text sm:flex"
        >
          <Code2 className="h-3.5 w-3.5" />
          <span>Source</span>
        </a>
      </div>
    </header>
  );
}
