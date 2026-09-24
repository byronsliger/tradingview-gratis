"use client";

import { useEffect, useRef, useState } from "react";
import { DragDropProvider, useDroppable } from "@dnd-kit/react";
import { KeyboardSensor, PointerActivationConstraints, PointerSensor } from "@dnd-kit/dom";
import { useSortable } from "@dnd-kit/react/sortable";
import { Plus, X, PanelRightClose } from "lucide-react";
import { fetchTickers24h } from "@/lib/binance/rest";
import { getBinanceWS } from "@/lib/binance/ws";
import { useChartStore } from "@/lib/store/chart-store";
import { DEFAULT_SECTION_ID, type WatchlistSection } from "@/lib/store/watchlist-sections";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatPrice, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Row { symbol: string; price: number; pct: number }

const pointerSensor = PointerSensor.configure({
  activationConstraints: (event) => event.pointerType === "touch"
    ? [new PointerActivationConstraints.Delay({ value: 250, tolerance: 6 })]
    : [new PointerActivationConstraints.Distance({ value: 6 })],
  preventActivation: (event) => {
    if (!(event.target instanceof Element)) return true;
    return event.target.closest("button, input, textarea, select, a, [contenteditable]") !== null;
  },
});

const keyboardSensor = KeyboardSensor.configure({
  keyboardCodes: {
    start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter", "Tab"],
    up: ["ArrowUp"], down: ["ArrowDown"], left: ["ArrowLeft"], right: ["ArrowRight"],
  },
});

function Asset({ symbol, index, sectionId, row, flash, active, onSelect, onRemove, suppressClick, isDragInteraction }: {
  symbol: string; index: number; sectionId: string; row?: Row;
  flash?: "up" | "down" | null; active: boolean; onSelect: () => void; onRemove: () => void;
  suppressClick: (id: string, event: React.MouseEvent) => void;
  isDragInteraction: (id: string) => boolean;
}) {
  const { ref, isDragging, isDropTarget } = useSortable({
    id: `asset:${symbol}`, index, group: sectionId, type: "asset", accept: "asset",
  });
  return (
    <div ref={ref} role="button" tabIndex={0} aria-label={`Select ${symbol}. Press Space to move.`}
      onClickCapture={(event) => suppressClick(`asset:${symbol}`, event)}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && event.key === "Enter" && !isDragInteraction(`asset:${symbol}`)) onSelect();
      }}
      className={cn(
        "group grid cursor-grab grid-cols-[1fr_auto_auto] items-center gap-1 px-3 py-1.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 active:cursor-grabbing",
        active ? "bg-tv-blue/15 hover:bg-tv-blue/20" : "hover:bg-tv-panel-hover",
        isDragging && "opacity-40", isDropTarget && "ring-1 ring-inset ring-blue-500",
      )}>
      <span className="flex min-w-0 items-center gap-2 text-left">
        <span className="truncate font-medium text-tv-text">{symbol.replace("USDT", "")}</span>
        <span className="text-[10px] text-tv-text-dim">USDT</span>
      </span>
      <span className={cn("text-right tabular-nums transition-colors",
        flash === "up" && "text-tv-green", flash === "down" && "text-tv-red", !flash && "text-tv-text")}>{row ? formatPrice(row.price) : "—"}</span>
      <div className="flex items-center justify-end gap-1">
        <span className={cn("tabular-nums", row ? row.pct >= 0 ? "text-tv-green" : "text-tv-red" : "text-tv-text-muted")}>{row ? formatPct(row.pct) : "—"}</span>
        <button type="button" onClick={(event) => { event.stopPropagation(); onRemove(); }}
          className="rounded p-0.5 text-tv-text-muted hover:bg-tv-bg hover:text-tv-red focus-visible:outline-2 focus-visible:outline-blue-500 md:invisible md:group-hover:visible md:focus-visible:visible"
          aria-label={`Remove ${symbol} from watchlist`}><X className="h-3 w-3" /></button>
      </div>
    </div>
  );
}

function Section({ section, index, startEditing, onEditDone, rows, flash, activeSymbol, onSelect, suppressClick, isDragInteraction }: {
  section: WatchlistSection; index: number; startEditing: boolean; onEditDone: () => void;
  rows: Record<string, Row>; flash: Record<string, "up" | "down" | null>;
  activeSymbol: string; onSelect: (symbol: string) => void;
  suppressClick: (id: string, event: React.MouseEvent) => void;
  isDragInteraction: (id: string) => boolean;
}) {
  const rename = useChartStore((s) => s.renameWatchlistSection);
  const removeSection = useChartStore((s) => s.removeWatchlistSection);
  const removeAsset = useChartStore((s) => s.removeFromWatchlist);
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState(section.name);
  const cancelEdit = useRef(false);
  const { ref: sectionRef, handleRef, isDragging, isDropTarget: isSectionDropTarget } = useSortable({
    id: `section:${section.id}`, index, group: "watchlist-sections", type: "section", accept: "section",
  });
  const { ref: assetDropRef, isDropTarget: isAssetDropTarget } = useDroppable({
    id: `section-assets:${section.id}`, accept: "asset", collisionPriority: -1,
  });

  const finish = (save: boolean) => {
    if (save) rename(section.id, draft);
    else setDraft(section.name);
    setEditing(false);
    onEditDone();
  };

  return (
    <div ref={sectionRef} className={cn("border-b border-tv-border/60", isDragging && "opacity-40", isSectionDropTarget && "ring-1 ring-inset ring-blue-500")}>
      <div ref={handleRef} role="button" tabIndex={editing ? -1 : 0}
        aria-label={`Rename ${section.name} section. Press Space to move.`}
        onClickCapture={(event) => suppressClick(`section:${section.id}`, event)}
        onClick={() => { if (!editing) { cancelEdit.current = false; setDraft(section.name); setEditing(true); } }}
        onKeyDown={(event) => {
          if (event.target === event.currentTarget && event.key === "Enter" && !editing && !isDragInteraction(`section:${section.id}`)) {
            cancelEdit.current = false; setDraft(section.name); setEditing(true);
          }
        }}
        className="flex cursor-grab items-center gap-1 px-3 py-1.5 focus-visible:outline-2 focus-visible:outline-blue-500 active:cursor-grabbing">
        {editing ? (
          <input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onBlur={() => { finish(!cancelEdit.current); cancelEdit.current = false; }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") { cancelEdit.current = true; event.currentTarget.blur(); }
            }}
            aria-label={`Rename ${section.name} section`}
            className="min-w-0 flex-1 rounded border border-blue-500 bg-tv-bg px-1 py-0.5 text-xs font-semibold text-tv-text outline-none" />
        ) : (
          <span className="min-w-0 flex-1 truncate text-left text-xs font-semibold text-tv-text-muted hover:text-tv-text">{section.name}</span>
        )}
        {section.id !== DEFAULT_SECTION_ID && (
          <button type="button" onClick={(event) => { event.stopPropagation(); removeSection(section.id); }} aria-label={`Remove ${section.name} section; its assets move to the default section`}
            title="Remove section (assets move to the default section)" className="rounded p-0.5 text-tv-text-dim hover:text-tv-red focus-visible:outline-2 focus-visible:outline-blue-500">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      <div ref={assetDropRef} className={cn("min-h-9 pb-1", isAssetDropTarget && "bg-blue-500/10")}
        aria-label={`Drop assets in ${section.name}`}>
        {section.symbols.map((asset, index) => (
          <Asset key={asset} symbol={asset} index={index} sectionId={section.id}
            row={rows[asset]} flash={flash[asset]} active={asset === activeSymbol}
            onSelect={() => onSelect(asset)} onRemove={() => removeAsset(asset)}
            suppressClick={suppressClick} isDragInteraction={isDragInteraction} />
        ))}
        {section.symbols.length === 0 && <div className="px-3 py-2 text-xs text-tv-text-dim">Drop assets here</div>}
      </div>
    </div>
  );
}

export function Watchlist({ onClose }: { onClose?: () => void } = {}) {
  const watchlist = useChartStore((s) => s.watchlist);
  const sections = useChartStore((s) => s.watchlistSections);
  const symbol = useChartStore((s) => s.symbol);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const addSection = useChartStore((s) => s.addWatchlistSection);
  const moveSymbol = useChartStore((s) => s.moveWatchlistSymbol);
  const moveSection = useChartStore((s) => s.moveWatchlistSection);
  const openSymbolDialog = useChartStore((s) => s.setSymbolDialogOpen);
  const toggleWatchlistCollapsed = useChartStore((s) => s.toggleWatchlistCollapsed);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [flash, setFlash] = useState<Record<string, "up" | "down" | null>>({});
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const draggedId = useRef<string | null>(null);
  const clearDragTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = (id: string, event: React.MouseEvent) => {
    if (draggedId.current !== id) return;
    event.preventDefault();
    event.stopPropagation();
  };
  const isDragInteraction = (id: string) => draggedId.current === id;
  // Prices depend on membership, not visual order. Reordering should not reopen the WebSocket.
  const subscriptionKey = [...watchlist].sort().join(",");

  useEffect(() => {
    if (!subscriptionKey) return;
    const symbols = subscriptionKey.split(",");
    let cancelled = false;
    fetchTickers24h(symbols).then((tickers) => {
      if (cancelled) return;
      const map: Record<string, Row> = {};
      tickers.forEach((t) => { map[t.symbol] = { symbol: t.symbol, price: t.lastPrice, pct: t.priceChangePercent }; });
      setRows(map);
    }).catch(console.error);
    const unsub = getBinanceWS().subscribeMiniTickers(symbols, (tick) => {
      setRows((prev) => {
        const previous = prev[tick.symbol];
        if (previous && tick.close !== previous.price) {
          setFlash((f) => ({ ...f, [tick.symbol]: tick.close > previous.price ? "up" : "down" }));
          setTimeout(() => setFlash((f) => ({ ...f, [tick.symbol]: null })), 300);
        }
        return { ...prev, [tick.symbol]: { symbol: tick.symbol, price: tick.close, pct: tick.pct } };
      });
    });
    return () => { cancelled = true; unsub(); };
  }, [subscriptionKey]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-tv-border px-3 py-2.5">
        <h2 className="text-sm font-semibold text-tv-text">Watchlist</h2>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setEditingSectionId(addSection())}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-tv-bg text-tv-text-muted transition-colors hover:text-tv-text"
            title="Sección" aria-label="Add watchlist section">
            <span aria-hidden="true" className="flex flex-col items-center -space-y-1.5">
              <Plus className="h-3 w-3" /><Plus className="h-3 w-3" />
            </span>
          </button>
          <button type="button" onClick={() => openSymbolDialog(true, "add")}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-tv-bg text-tv-text-muted transition-colors hover:text-tv-text"
            title="Add symbol" aria-label="Add symbol to watchlist"><Plus className="h-4 w-4" /></button>
          {onClose && <button type="button" onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-tv-bg text-tv-text-muted transition-colors hover:text-tv-text md:hidden"
            title="Close watchlist" aria-label="Close watchlist"><X className="h-4 w-4" /></button>}
          <button type="button" onClick={toggleWatchlistCollapsed}
            className="hidden h-8 w-8 items-center justify-center rounded-full bg-tv-bg text-tv-text-muted transition-colors hover:text-tv-text md:flex"
            title="Hide watchlist" aria-label="Hide watchlist"><PanelRightClose className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-b border-tv-border px-3 py-1.5 text-[10px] uppercase tracking-wider text-tv-text-dim">
        <span>Symbol</span><span className="text-right">Price</span><span className="text-right">24h</span>
      </div>
      <ScrollArea className="flex-1">
        <DragDropProvider sensors={(defaults) => [
          ...defaults.filter((sensor) => sensor !== PointerSensor && sensor !== KeyboardSensor),
          pointerSensor, keyboardSensor,
        ]}
          onDragStart={(event) => { draggedId.current = String(event.operation.source?.id ?? ""); }}
          onDragEnd={(event) => {
            if (clearDragTimer.current !== null) clearTimeout(clearDragTimer.current);
            clearDragTimer.current = setTimeout(() => { draggedId.current = null; clearDragTimer.current = null; }, 0);
            if (event.canceled) return;
            const sourceId = String(event.operation.source?.id ?? "");
            const targetId = String(event.operation.target?.id ?? "");
            if (sourceId.startsWith("section:") && targetId.startsWith("section:")) {
              moveSection(sourceId.slice(8), targetId.slice(8));
              return;
            }
            if (!sourceId.startsWith("asset:")) return;
            const asset = sourceId.slice(6);
            if (targetId.startsWith("section-assets:")) moveSymbol(asset, targetId.slice(15));
            else if (targetId.startsWith("asset:")) {
              const targetAsset = targetId.slice(6);
              const targetSection = sections.find((section) => section.symbols.includes(targetAsset));
              if (!targetSection || asset === targetAsset) return;
              const sourceIndex = targetSection.symbols.indexOf(asset);
              const targetIndex = targetSection.symbols.indexOf(targetAsset);
              const before = sourceIndex >= 0 && sourceIndex < targetIndex ? targetSection.symbols[targetIndex + 1] : targetAsset;
              moveSymbol(asset, targetSection.id, before);
            }
          }}>
          {sections.map((section, index) => <Section key={`${section.id}:${editingSectionId === section.id}`} section={section} index={index}
            startEditing={editingSectionId === section.id} onEditDone={() => setEditingSectionId(null)}
            rows={rows} flash={flash} activeSymbol={symbol}
            onSelect={(asset) => { setSymbol(asset); onClose?.(); }}
            suppressClick={suppressClick} isDragInteraction={isDragInteraction} />)}
        </DragDropProvider>
      </ScrollArea>
    </div>
  );
}
