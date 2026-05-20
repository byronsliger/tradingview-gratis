"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChartStore } from "@/lib/store/chart-store";

type Tab = "estilo" | "coordenadas";

const LINE_STYLES: { value: number; label: string; dasharray: string }[] = [
  { value: 0, label: "Sólida",        dasharray: "none" },
  { value: 2, label: "Discontinua",   dasharray: "4,3" },
  { value: 1, label: "Punteada",      dasharray: "2,2" },
  { value: 3, label: "Guión largo",   dasharray: "8,3" },
];

function LinePreview({ dasharray, color }: { dasharray: string; color: string }) {
  return (
    <svg width="20" height="8" viewBox="0 0 20 8">
      <line
        x1="0" y1="4" x2="20" y2="4"
        stroke={color}
        strokeWidth="1.5"
        strokeDasharray={dasharray === "none" ? undefined : dasharray}
      />
    </svg>
  );
}

export function PriceLineSettingsDialog() {
  const priceLineEditTarget = useChartStore((s) => s.priceLineEditTarget);
  const setPriceLineEditTarget = useChartStore((s) => s.setPriceLineEditTarget);
  const priceLines = useChartStore((s) => s.priceLines);
  const updatePriceLine = useChartStore((s) => s.updatePriceLine);
  const updatePriceLineOptions = useChartStore((s) => s.updatePriceLineOptions);

  const line = priceLines.find((p) => p.id === priceLineEditTarget) ?? null;
  const open = line !== null;

  const [tab, setTab] = useState<Tab>("estilo");
  const [draft, setDraft] = useState({
    color: "#2962ff",
    lineWidth: 1 as 1 | 2 | 3 | 4,
    lineStyle: 2,
    axisLabelVisible: true,
    price: 0,
  });

  useEffect(() => {
    if (line) {
      setTab("estilo");
      setDraft({
        color: line.color ?? "#2962ff",
        lineWidth: (line.lineWidth ?? 1) as 1 | 2 | 3 | 4,
        lineStyle: line.lineStyle ?? 2,
        axisLabelVisible: line.axisLabelVisible ?? true,
        price: line.price,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceLineEditTarget]);

  function handleSave() {
    if (!priceLineEditTarget) return;
    updatePriceLine(priceLineEditTarget, draft.price);
    updatePriceLineOptions(priceLineEditTarget, {
      color: draft.color,
      lineWidth: draft.lineWidth,
      lineStyle: draft.lineStyle,
      axisLabelVisible: draft.axisLabelVisible,
    });
    setPriceLineEditTarget(null);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setPriceLineEditTarget(null); }} disablePointerDismissal>
      <DialogContent className="max-w-xs bg-tv-panel">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold text-tv-text">
            Línea horizontal
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b border-tv-border -mx-6 px-6 text-xs">
          {(["estilo", "coordenadas"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 font-medium border-b-2 -mb-px transition-colors ${
                tab === t
                  ? "border-tv-blue text-tv-text"
                  : "border-transparent text-tv-text-muted hover:text-tv-text"
              }`}
            >
              {t === "estilo" ? "Estilo" : "Coordenadas"}
            </button>
          ))}
        </div>

        {tab === "estilo" && (
          <div className="flex flex-col gap-4 py-2">
            <div className="flex items-center gap-3">
              <span className="w-14 text-xs text-tv-text-muted">Línea</span>
              <input
                type="color"
                value={draft.color.slice(0, 7)}
                onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
                className="h-6 w-7 cursor-pointer rounded border border-tv-border bg-transparent p-0"
              />
              <div className="flex gap-1">
                {LINE_STYLES.map((s) => (
                  <button
                    key={s.value}
                    title={s.label}
                    onClick={() => setDraft((d) => ({ ...d, lineStyle: s.value }))}
                    className={`flex h-6 w-8 items-center justify-center rounded border transition-colors ${
                      draft.lineStyle === s.value
                        ? "border-tv-blue bg-tv-blue/10"
                        : "border-tv-border hover:border-tv-text-muted"
                    }`}
                  >
                    <LinePreview
                      dasharray={s.dasharray}
                      color={draft.lineStyle === s.value ? "#2962ff" : "#787b86"}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="w-14 text-xs text-tv-text-muted">Grosor</span>
              <div className="flex gap-1">
                {([1, 2, 3, 4] as const).map((w) => (
                  <button
                    key={w}
                    onClick={() => setDraft((d) => ({ ...d, lineWidth: w }))}
                    className={`flex h-6 w-8 items-center justify-center rounded border transition-colors ${
                      draft.lineWidth === w
                        ? "border-tv-blue bg-tv-blue/10 text-tv-blue"
                        : "border-tv-border text-tv-text-muted hover:border-tv-text-muted"
                    }`}
                  >
                    <span className="text-[10px] tabular-nums">{w}</span>
                  </button>
                ))}
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={draft.axisLabelVisible}
                onChange={(e) => setDraft((d) => ({ ...d, axisLabelVisible: e.target.checked }))}
                className="h-3.5 w-3.5 cursor-pointer rounded border border-tv-border bg-tv-bg accent-tv-blue"
              />
              <span className="text-xs text-tv-text">Etiqueta de precios</span>
            </label>
          </div>
        )}

        {tab === "coordenadas" && (
          <div className="flex flex-col gap-3 py-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
                N° 1 (precio)
              </span>
              <Input
                type="number"
                step="any"
                value={draft.price}
                onChange={(e) => {
                  const n = parseFloat(e.target.value);
                  if (!isNaN(n)) setDraft((d) => ({ ...d, price: n }));
                }}
                className="bg-tv-bg tabular-nums text-xs"
              />
            </label>
          </div>
        )}

        <div className="mt-1 flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPriceLineEditTarget(null)}
            className="text-tv-text-muted hover:text-tv-text"
          >
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} className="bg-tv-blue hover:bg-tv-blue/90">
            Aceptar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
