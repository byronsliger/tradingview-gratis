"use client";

import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SimpleColorRow } from "@/components/chart/indicator-settings/shared";
import { useChartStore } from "@/lib/store/chart-store";
import { compile } from "@/lib/pine";
import type { InputDef } from "@/lib/pine/types";

const SOURCE_OPTIONS = ["open", "high", "low", "close", "volume", "hl2", "hlc3", "ohlc4"];

type InputValue = number | string | boolean;

/** Valor actual de un input: override guardado o el defval declarado. */
function currentValue(def: InputDef, overrides: Record<string, InputValue>): InputValue {
  return def.id in overrides ? overrides[def.id] : def.defval;
}

function InputControl({
  def,
  value,
  onChange,
}: {
  def: InputDef;
  value: InputValue;
  onChange: (v: InputValue) => void;
}) {
  const label = def.title || def.id;

  if (def.type === "bool") {
    return (
      <label className="flex cursor-pointer items-center justify-between py-1 text-xs">
        <span className="font-medium text-tv-text">{label}</span>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-3.5 w-3.5 cursor-pointer rounded border border-tv-border bg-tv-bg accent-tv-blue"
        />
      </label>
    );
  }

  if (def.type === "color") {
    return (
      <SimpleColorRow
        label={label}
        color={String(value)}
        onColorChange={(c) => onChange(c)}
      />
    );
  }

  if (def.type === "source") {
    return (
      <label className="flex items-center justify-between py-1 text-xs">
        <span className="font-medium text-tv-text">{label}</span>
        <select
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="w-28 rounded border border-tv-border bg-tv-bg px-1.5 py-0.5 text-xs text-tv-text focus:border-tv-blue focus:outline-none"
        >
          {SOURCE_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>
    );
  }

  if (def.type === "string") {
    if (def.options && def.options.length > 0) {
      return (
        <label className="flex items-center justify-between py-1 text-xs">
          <span className="font-medium text-tv-text">{label}</span>
          <select
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
            className="w-32 rounded border border-tv-border bg-tv-bg px-1.5 py-0.5 text-xs text-tv-text focus:border-tv-blue focus:outline-none"
          >
            {def.options.map((o) => (
              <option key={String(o)} value={String(o)}>{String(o)}</option>
            ))}
          </select>
        </label>
      );
    }
    return (
      <label className="flex items-center justify-between gap-2 py-1 text-xs">
        <span className="font-medium text-tv-text">{label}</span>
        <Input
          type="text"
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="w-40 bg-tv-bg"
        />
      </label>
    );
  }

  // int / float
  const isInt = def.type === "int";
  if (def.options && def.options.length > 0) {
    return (
      <label className="flex items-center justify-between py-1 text-xs">
        <span className="font-medium text-tv-text">{label}</span>
        <select
          value={String(value)}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-28 rounded border border-tv-border bg-tv-bg px-1.5 py-0.5 text-xs text-tv-text focus:border-tv-blue focus:outline-none"
        >
          {def.options.map((o) => (
            <option key={String(o)} value={String(o)}>{String(o)}</option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <label className="flex items-center justify-between gap-2 py-1 text-xs">
      <span className="font-medium text-tv-text">{label}</span>
      <Input
        type="number"
        value={Number(value)}
        min={def.minval}
        max={def.maxval}
        step={def.step ?? (isInt ? 1 : "any")}
        onChange={(e) => {
          const n = isInt ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
          if (!Number.isNaN(n)) onChange(n);
        }}
        className="w-28 bg-tv-bg tabular-nums"
      />
    </label>
  );
}

export function ScriptSettingsDialog() {
  const target = useChartStore((s) => s.settingsTarget);
  const setTarget = useChartStore((s) => s.setSettingsTarget);
  const scripts = useChartStore((s) => s.scripts);
  const updateScript = useChartStore((s) => s.updateScript);

  const isScript = typeof target === "string" && target.startsWith("script:");
  const scriptId = isScript ? target.slice("script:".length) : null;
  const record = scriptId ? scripts.find((s) => s.id === scriptId) : undefined;

  // compile es puro; memoizamos por source para no recompilar en cada render.
  const inputs = useMemo<InputDef[]>(() => {
    if (!record) return [];
    const res = compile(record.source);
    return res.ok ? res.script.inputs : [];
  }, [record]);

  const open = isScript && !!record;

  function handleChange(defId: string, value: InputValue) {
    if (!record) return;
    updateScript(record.id, { inputs: { ...record.inputs, [defId]: value } });
  }

  function handleReset() {
    if (!record) return;
    updateScript(record.id, { inputs: {} });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setTarget(null); }}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 max-w-none sm:max-h-[80vh] sm:max-w-sm bg-tv-panel">
        <DialogHeader className="shrink-0 pb-3 pr-8">
          <DialogTitle className="text-sm font-semibold">
            {record?.name ?? "Script"} — Configuración
          </DialogTitle>
        </DialogHeader>

        {inputs.length === 0 ? (
          <p className="py-2 text-xs text-tv-text-muted">
            Este script no tiene parámetros configurables.
          </p>
        ) : (
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
            <div className="flex flex-col divide-y divide-tv-border/50">
              {inputs.map((def) => (
                <InputControl
                  key={def.id}
                  def={def}
                  value={currentValue(def, record!.inputs)}
                  onChange={(v) => handleChange(def.id, v)}
                />
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 flex shrink-0 justify-end border-t border-tv-border/50 pt-3">
          <button
            type="button"
            onClick={handleReset}
            className="rounded border border-tv-border px-3 py-1 text-xs text-tv-text-muted transition-colors hover:border-tv-text-muted hover:text-tv-text"
          >
            Restaurar valores
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
