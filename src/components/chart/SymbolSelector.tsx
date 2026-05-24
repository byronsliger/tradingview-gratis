"use client";

import { useEffect, useState, useMemo } from "react";
import { Search, ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchExchangeSymbols } from "@/lib/binance/rest";
import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";
import type { SymbolInfo } from "@/lib/binance/types";

export function SymbolSelector() {
  const symbol = useChartStore((s) => s.symbol);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const addToWatchlist = useChartStore((s) => s.addToWatchlist);
  const open = useChartStore((s) => s.symbolDialogOpen);
  const setOpen = useChartStore((s) => s.setSymbolDialogOpen);
  const mode = useChartStore((s) => s.symbolDialogMode);

  const [query, setQuery] = useState("");
  const [allSymbols, setAllSymbols] = useState<SymbolInfo[]>([]);

  useEffect(() => {
    if (open) {
      setQuery("");
      if (allSymbols.length === 0) {
        fetchExchangeSymbols().then(setAllSymbols).catch(console.error);
      }
    }
  }, [open, allSymbols.length]);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return allSymbols.slice(0, 100);
    return allSymbols
      .filter(
        (s) =>
          s.symbol.includes(q) ||
          s.baseAsset.includes(q) ||
          s.quoteAsset.includes(q),
      )
      .slice(0, 100);
  }, [query, allSymbols]);

  return (
    <>
      <button
        onClick={() => setOpen(true, "search")}
        className="group flex items-center gap-2 rounded px-3 py-1.5 text-sm font-semibold hover:bg-tv-panel-hover"
      >
        <Search className="h-3.5 w-3.5 text-tv-text-muted group-hover:text-tv-text" />
        <span className="tabular-nums">{symbol}</span>
        <ChevronDown className="h-3.5 w-3.5 text-tv-text-muted" />
      </button>
      <Dialog open={open} onOpenChange={(v) => setOpen(v)}>
        <DialogContent
          centered={mode === "add"}
          className={cn(
            "gap-0 bg-tv-panel p-0 sm:p-0 overflow-hidden flex flex-col",
            mode === "add" ? "max-w-md w-[95vw] h-[90vh]" : "max-w-md w-full"
          )}
        >
          <DialogHeader className="border-b border-tv-border px-4 py-3">
            <DialogTitle className="text-sm font-medium">
              {mode === "add" ? "Agregar a Watchlist" : "Buscar símbolo"}
            </DialogTitle>
          </DialogHeader>
          <div className="border-b border-tv-border p-3">
            <Input
              autoFocus
              placeholder="BTC, ETH, SOL…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="bg-tv-bg"
            />
          </div>
          <ScrollArea className={mode === "add" ? "flex-1 min-h-0" : "h-[400px]"}>
            <div className="flex flex-col">
              {filtered.length === 0 && (
                <div className="p-4 text-center text-xs text-tv-text-muted">
                  Sin resultados
                </div>
              )}
              {filtered.map((s) => (
                <button
                  key={s.symbol}
                  onClick={() => {
                    setSymbol(s.symbol);
                    if (mode === "add") {
                      addToWatchlist(s.symbol);
                    }
                    setOpen(false);
                  }}
                  className={cn(
                    "flex cursor-pointer items-center justify-between px-3 py-1.5 text-left text-xs transition-colors hover:bg-tv-panel-hover",
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
        </DialogContent>
      </Dialog>
    </>
  );
}
