"use client";

import React from "react";
import type { Timeframe } from "@/lib/binance/types";
import { formatPrice, formatVolume } from "@/lib/format";
import type { HoverInfo } from "@/hooks/chart/useChartInteraction";

interface Props {
  symbol: string;
  timeframe: Timeframe;
  hover: HoverInfo | null;
  lastPrice: { value: number; pct: number } | null;
  top: number;
  left: number;
}

function greenOrRed(n: number) {
  return n >= 0 ? "text-tv-green" : "text-tv-red";
}

export const SymbolHeader = React.memo(function SymbolHeader({ symbol, timeframe, hover, lastPrice, top, left }: Props) {
  return (
    <div
      style={{ top, left }}
      className="pointer-events-none absolute z-10 flex flex-col gap-1 text-xs tabular-nums"
    >
      {/* Row 1: symbol info + OHLC stats inline on hover */}
      <div className="flex h-5 flex-nowrap items-center gap-x-3 overflow-hidden whitespace-nowrap">
        <div className="flex shrink-0 items-center gap-2 text-[13px] font-semibold">
          <span className="text-tv-text">{symbol}</span>
          <span className="text-tv-text-muted">·</span>
          <span className="uppercase text-tv-text-muted">{timeframe}</span>
          <span className="text-tv-text-muted">·</span>
          <span className="text-tv-text-muted">Binance</span>
        </div>
        {hover && (
          <div className="flex items-center gap-x-3 text-[11px]">
            <span className="text-tv-text-muted">
              O <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.o)}</span>
            </span>
            <span className="text-tv-text-muted">
              H <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.h)}</span>
            </span>
            <span className="text-tv-text-muted">
              L <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.l)}</span>
            </span>
            <span className="text-tv-text-muted">
              C <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.c)}</span>
            </span>
            <span className={greenOrRed(hover.pct)}>
              {hover.pct >= 0 ? "+" : ""}
              {hover.pct.toFixed(2)}%
            </span>
            <span className="text-tv-text-muted">
              Vol <span className="text-tv-text">{formatVolume(hover.v)}</span>
            </span>
          </div>
        )}
      </div>

      {/* Row 2: big live price */}
      <div className="flex h-7 items-center gap-2">
        {lastPrice ? (
          <>
            <span className={`text-lg font-semibold tabular-nums ${greenOrRed(lastPrice.pct)}`}>
              {formatPrice(lastPrice.value)}
            </span>
            <span className={`text-xs ${greenOrRed(lastPrice.pct)}`}>
              {lastPrice.pct >= 0 ? "+" : ""}
              {lastPrice.pct.toFixed(2)}%
            </span>
          </>
        ) : (
          <span className="text-xs text-tv-text-muted">Cargando…</span>
        )}
      </div>
    </div>
  );
});
