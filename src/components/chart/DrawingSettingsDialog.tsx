"use client";

import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChartStore } from "@/lib/store/chart-store";
import type { TrendLineDrawing, RectangleDrawing } from "@/lib/drawings/types";
import type { TrendLineDefaults, RectangleDefaults } from "@/lib/store/chart-store";

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

// ── TrendLine settings ────────────────────────────────────────────────────────

function TrendLineSettings({ drawing, onSave, onDelete, onClose }: {
  drawing: TrendLineDrawing;
  onSave: (patch: Partial<Omit<TrendLineDrawing, "id" | "symbol" | "type">>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("estilo");
  const [draft, setDraft] = useState({
    color: drawing.color,
    lineWidth: drawing.lineWidth,
    lineStyle: drawing.lineStyle,
    extendLeft: drawing.extendLeft,
    extendRight: drawing.extendRight,
    priceA: drawing.a.price,
    priceB: drawing.b.price,
  });

  useEffect(() => {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing.id]);

  return (
    <>
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

      {tab === "coordenadas" && (
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

      <div className="mt-1 flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onDelete}
          className="text-tv-red hover:bg-tv-red/10 hover:text-tv-red p-2" title="Eliminar">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}
            className="text-tv-text-muted hover:text-tv-text">Cancelar</Button>
          <Button size="sm" onClick={() => {
            onSave({
              color: draft.color,
              lineWidth: draft.lineWidth,
              lineStyle: draft.lineStyle,
              extendLeft: draft.extendLeft,
              extendRight: draft.extendRight,
              a: { ...drawing.a, price: draft.priceA },
              b: { ...drawing.b, price: draft.priceB },
            });
          }} className="bg-tv-blue hover:bg-tv-blue/90">Aceptar</Button>
        </div>
      </div>
    </>
  );
}

// ── Rectangle settings ────────────────────────────────────────────────────────

function RectangleSettings({ drawing, onSave, onDelete, onClose }: {
  drawing: RectangleDrawing;
  onSave: (patch: Partial<Omit<RectangleDrawing, "id" | "symbol" | "type">>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("estilo");
  const topPrice = Math.max(drawing.a.price, drawing.b.price);
  const bottomPrice = Math.min(drawing.a.price, drawing.b.price);
  const leftTime = Math.min(drawing.a.time, drawing.b.time);
  const rightTime = Math.max(drawing.a.time, drawing.b.time);

  const [draft, setDraft] = useState({
    color: drawing.color,
    lineWidth: drawing.lineWidth,
    lineStyle: drawing.lineStyle,
    fillVisible: drawing.fillVisible,
    fillColor: drawing.fillColor.slice(0, 7),
    fillAlpha: Math.round(parseInt(drawing.fillColor.slice(7, 9) || "22", 16) / 255 * 100),
    priceTop: topPrice,
    priceBottom: bottomPrice,
    timeLeft: leftTime,
    timeRight: rightTime,
  });

  useEffect(() => {
    setTab("estilo");
    const top = Math.max(drawing.a.price, drawing.b.price);
    const bot = Math.min(drawing.a.price, drawing.b.price);
    const fc = drawing.fillColor;
    setDraft({
      color: drawing.color,
      lineWidth: drawing.lineWidth,
      lineStyle: drawing.lineStyle,
      fillVisible: drawing.fillVisible,
      fillColor: fc.slice(0, 7),
      fillAlpha: Math.round(parseInt(fc.slice(7, 9) || "22", 16) / 255 * 100),
      priceTop: top,
      priceBottom: bot,
      timeLeft: Math.min(drawing.a.time, drawing.b.time),
      timeRight: Math.max(drawing.a.time, drawing.b.time),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing.id]);

  const buildFillColor = (hex: string, alpha: number) => {
    const a = Math.round(Math.max(0, Math.min(100, alpha)) / 100 * 255).toString(16).padStart(2, "0");
    return hex + a;
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-sm font-semibold text-tv-text">Rectángulo</DialogTitle>
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
            <span className="w-14 text-xs text-tv-text-muted">Borde</span>
            <input type="color" value={draft.color}
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

          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={draft.fillVisible}
                onChange={(e) => setDraft((d) => ({ ...d, fillVisible: e.target.checked }))}
                className="h-3.5 w-3.5 cursor-pointer rounded border border-tv-border bg-tv-bg accent-tv-blue" />
              <span className="text-xs text-tv-text">Relleno</span>
            </label>
            {draft.fillVisible && (
              <>
                <input type="color" value={draft.fillColor}
                  onChange={(e) => setDraft((d) => ({ ...d, fillColor: e.target.value }))}
                  className="h-6 w-7 cursor-pointer rounded border border-tv-border bg-transparent p-0" />
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-tv-text-muted">Opac.</span>
                  <input type="range" min={0} max={100} value={draft.fillAlpha}
                    onChange={(e) => setDraft((d) => ({ ...d, fillAlpha: Number(e.target.value) }))}
                    className="w-20 accent-tv-blue" />
                  <span className="w-7 text-right text-[10px] tabular-nums text-tv-text-muted">{draft.fillAlpha}%</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {tab === "coordenadas" && (
        <div className="flex flex-col gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">Precio superior</span>
              <Input type="number" step="any" value={draft.priceTop}
                onChange={(e) => { const n = parseFloat(e.target.value); if (!isNaN(n)) setDraft((d) => ({ ...d, priceTop: n })); }}
                className="bg-tv-bg tabular-nums text-xs" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">Precio inferior</span>
              <Input type="number" step="any" value={draft.priceBottom}
                onChange={(e) => { const n = parseFloat(e.target.value); if (!isNaN(n)) setDraft((d) => ({ ...d, priceBottom: n })); }}
                className="bg-tv-bg tabular-nums text-xs" />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">Tiempo izquierdo</span>
            <span className="text-[10px] text-tv-text-dim">{formatTime(draft.timeLeft)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">Tiempo derecho</span>
            <span className="text-[10px] text-tv-text-dim">{formatTime(draft.timeRight)}</span>
          </div>
        </div>
      )}

      <div className="mt-1 flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onDelete}
          className="text-tv-red hover:bg-tv-red/10 hover:text-tv-red p-2" title="Eliminar">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}
            className="text-tv-text-muted hover:text-tv-text">Cancelar</Button>
          <Button size="sm" onClick={() => {
            const aIsLeft = drawing.a.time <= drawing.b.time;
            const aIsTop = drawing.a.price >= drawing.b.price;
            const newA = {
              time: aIsLeft ? draft.timeLeft : draft.timeRight,
              price: aIsTop ? draft.priceTop : draft.priceBottom,
            };
            const newB = {
              time: aIsLeft ? draft.timeRight : draft.timeLeft,
              price: aIsTop ? draft.priceBottom : draft.priceTop,
            };
            onSave({
              color: draft.color,
              lineWidth: draft.lineWidth,
              lineStyle: draft.lineStyle,
              fillVisible: draft.fillVisible,
              fillColor: buildFillColor(draft.fillColor, draft.fillAlpha),
              a: newA,
              b: newB,
            });
          }} className="bg-tv-blue hover:bg-tv-blue/90">Aceptar</Button>
        </div>
      </div>
    </>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────────

export function DrawingSettingsDialog() {
  const drawingEditTarget = useChartStore((s) => s.drawingEditTarget);
  const setDrawingEditTarget = useChartStore((s) => s.setDrawingEditTarget);
  const drawings = useChartStore((s) => s.drawings);
  const updateDrawing = useChartStore((s) => s.updateDrawing);
  const removeDrawing = useChartStore((s) => s.removeDrawing);

  const setDrawingDefault = useChartStore((s) => s.setDrawingDefault);

  const drawing = drawings.find((d) => d.id === drawingEditTarget) ?? null;
  const open = drawing !== null;

  const handleClose = () => setDrawingEditTarget(null);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }} disablePointerDismissal>
      <DialogContent className="max-w-none sm:max-w-xs bg-tv-panel">
        {drawing?.type === "trendline" && (
          <TrendLineSettings
            drawing={drawing as TrendLineDrawing}
            onSave={(patch) => {
              updateDrawing(drawingEditTarget!, patch as Parameters<typeof updateDrawing>[1]);
              const p = patch as Partial<Omit<TrendLineDrawing, "id" | "symbol" | "type">>;
              setDrawingDefault("trendline", {
                color: p.color,
                lineWidth: p.lineWidth,
                lineStyle: p.lineStyle,
                extendLeft: p.extendLeft,
                extendRight: p.extendRight,
              } as Partial<TrendLineDefaults>);
              handleClose();
            }}
            onDelete={() => { removeDrawing(drawingEditTarget!); handleClose(); }}
            onClose={handleClose}
          />
        )}
        {drawing?.type === "rectangle" && (
          <RectangleSettings
            drawing={drawing as RectangleDrawing}
            onSave={(patch) => {
              updateDrawing(drawingEditTarget!, patch as Parameters<typeof updateDrawing>[1]);
              const p = patch as Partial<Omit<RectangleDrawing, "id" | "symbol" | "type">>;
              setDrawingDefault("rectangle", {
                color: p.color,
                lineWidth: p.lineWidth,
                lineStyle: p.lineStyle,
                fillColor: p.fillColor,
                fillVisible: p.fillVisible,
              } as Partial<RectangleDefaults>);
              handleClose();
            }}
            onDelete={() => { removeDrawing(drawingEditTarget!); handleClose(); }}
            onClose={handleClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
