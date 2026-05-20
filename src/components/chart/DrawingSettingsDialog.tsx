"use client";

import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChartStore } from "@/lib/store/chart-store";
import type { TrendLineDrawing } from "@/lib/drawings/types";

type Tab = "estilo" | "coordenadas";

const LINE_STYLES = [
  { value: 0, dasharray: "none",  label: "Sólida" },
  { value: 2, dasharray: "6,4",   label: "Discontinua" },
  { value: 1, dasharray: "2,4",   label: "Punteada" },
  { value: 3, dasharray: "12,4",  label: "Guión largo" },
];

function LinePreview({ dasharray, color }: { dasharray: string; color: string }) {
  return (
    <svg width="20" height="8" viewBox="0 0 20 8">
      <line x1="0" y1="4" x2="20" y2="4" stroke={color} strokeWidth="1.5"
        strokeDasharray={dasharray === "none" ? undefined : dasharray} />
    </svg>
  );
}

function formatTime(t: number): string {
  return new Date(t * 1000).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function DrawingSettingsDialog() {
  const drawingEditTarget = useChartStore((s) => s.drawingEditTarget);
  const setDrawingEditTarget = useChartStore((s) => s.setDrawingEditTarget);
  const drawings = useChartStore((s) => s.drawings);
  const updateDrawing = useChartStore((s) => s.updateDrawing);

  const drawing = (drawings.find((d) => d.id === drawingEditTarget) ?? null) as TrendLineDrawing | null;
  const open = drawing !== null;

  const [tab, setTab] = useState<Tab>("estilo");
  const [draft, setDraft] = useState({
    color: "#2962ff",
    lineWidth: 1 as 1 | 2 | 3 | 4,
    lineStyle: 0,
    extendLeft: false,
    extendRight: false,
    priceA: 0,
    priceB: 0,
  });

  useEffect(() => {
    if (drawing) {
      setTab("estilo");
      setDraft({
        color: drawing.color,
        lineWidth: drawing.lineWidth,
        lineStyle: drawing.lineStyle,
        extendLeft: drawing.extendLeft,
        extendRight: drawing.extendRight,
        priceA: drawing.a.price,
        priceB: drawing.b.price,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawingEditTarget]);

  function handleSave() {
    if (!drawingEditTarget || !drawing) return;
    updateDrawing(drawingEditTarget, {
      color: draft.color,
      lineWidth: draft.lineWidth,
      lineStyle: draft.lineStyle,
      extendLeft: draft.extendLeft,
      extendRight: draft.extendRight,
      a: { ...drawing.a, price: draft.priceA },
      b: { ...drawing.b, price: draft.priceB },
    });
    setDrawingEditTarget(null);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setDrawingEditTarget(null); }} disablePointerDismissal>
      <DialogContent className="max-w-xs bg-tv-panel">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold text-tv-text">Línea de tendencia</DialogTitle>
        </DialogHeader>

        <div className="flex border-b border-tv-border -mx-6 px-6 text-xs">
          {(["estilo", "coordenadas"] as Tab[]).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={`px-3 py-1.5 font-medium border-b-2 -mb-px transition-colors ${
                tab === t ? "border-tv-blue text-tv-text" : "border-transparent text-tv-text-muted hover:text-tv-text"
              }`}>
              {t === "estilo" ? "Estilo" : "Coordenadas"}
            </button>
          ))}
        </div>

        {tab === "estilo" && (
          <div className="flex flex-col gap-4 py-2">
            <div className="flex items-center gap-3">
              <span className="w-14 text-xs text-tv-text-muted">Línea</span>
              <input type="color" value={draft.color.slice(0, 7)}
                onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
                className="h-6 w-7 cursor-pointer rounded border border-tv-border bg-transparent p-0" />
              <div className="flex gap-1">
                {LINE_STYLES.map((s) => (
                  <button key={s.value} title={s.label}
                    onClick={() => setDraft((d) => ({ ...d, lineStyle: s.value }))}
                    className={`flex h-6 w-8 items-center justify-center rounded border transition-colors ${
                      draft.lineStyle === s.value ? "border-tv-blue bg-tv-blue/10" : "border-tv-border hover:border-tv-text-muted"
                    }`}>
                    <LinePreview dasharray={s.dasharray} color={draft.lineStyle === s.value ? "#2962ff" : "#787b86"} />
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="w-14 text-xs text-tv-text-muted">Grosor</span>
              <div className="flex gap-1">
                {([1, 2, 3, 4] as const).map((w) => (
                  <button key={w} onClick={() => setDraft((d) => ({ ...d, lineWidth: w }))}
                    className={`flex h-6 w-8 items-center justify-center rounded border transition-colors ${
                      draft.lineWidth === w ? "border-tv-blue bg-tv-blue/10 text-tv-blue" : "border-tv-border text-tv-text-muted hover:border-tv-text-muted"
                    }`}>
                    <span className="text-[10px] tabular-nums">{w}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={draft.extendLeft}
                  onChange={(e) => setDraft((d) => ({ ...d, extendLeft: e.target.checked }))}
                  className="h-3.5 w-3.5 cursor-pointer rounded border border-tv-border bg-tv-bg accent-tv-blue" />
                <span className="text-xs text-tv-text">Extender izquierda</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={draft.extendRight}
                  onChange={(e) => setDraft((d) => ({ ...d, extendRight: e.target.checked }))}
                  className="h-3.5 w-3.5 cursor-pointer rounded border border-tv-border bg-tv-bg accent-tv-blue" />
                <span className="text-xs text-tv-text">Extender derecha</span>
              </label>
            </div>
          </div>
        )}

        {tab === "coordenadas" && drawing && (
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">Punto A</span>
              <span className="text-[10px] text-tv-text-dim">{formatTime(drawing.a.time)}</span>
              <Input type="number" step="any" value={draft.priceA}
                onChange={(e) => { const n = parseFloat(e.target.value); if (!isNaN(n)) setDraft((d) => ({ ...d, priceA: n })); }}
                className="bg-tv-bg tabular-nums text-xs" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">Punto B</span>
              <span className="text-[10px] text-tv-text-dim">{formatTime(drawing.b.time)}</span>
              <Input type="number" step="any" value={draft.priceB}
                onChange={(e) => { const n = parseFloat(e.target.value); if (!isNaN(n)) setDraft((d) => ({ ...d, priceB: n })); }}
                className="bg-tv-bg tabular-nums text-xs" />
            </div>
          </div>
        )}

        <div className="mt-1 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setDrawingEditTarget(null)}
            className="text-tv-text-muted hover:text-tv-text">Cancelar</Button>
          <Button size="sm" onClick={handleSave} className="bg-tv-blue hover:bg-tv-blue/90">Aceptar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
