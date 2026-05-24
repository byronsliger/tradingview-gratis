"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DEFAULT_CONFIG, type IndicatorConfig, type IndicatorKey } from "@/lib/store/chart-store";
import { Tabs, Field, SimpleColorRow, LineStylePicker, WidthPicker, clamp, AxisLabelToggle } from "./shared";

type EMAKey = "ema20" | "ema50" | "ema200";
type EMAAxisLabelKey = `${EMAKey}AxisLabel`;

interface Props {
  target: EMAKey;
  config: IndicatorConfig;
  onSave: (patch: Partial<IndicatorConfig>) => void;
  onReset: () => void;
}

export function EMASettings({ target, config, onSave, onReset }: Props) {
  const colorKey = `${target}Color` as `${EMAKey}Color`;
  const widthKey = `${target}Width` as `${EMAKey}Width`;
  const styleKey = `${target}Style` as `${EMAKey}Style`;

  const axisLabelKey = `${target}AxisLabel` as EMAAxisLabelKey;

  const [tab, setTab] = useState<"inputs" | "style">("inputs");
  const [period,     setPeriod]     = useState(config[target]        ?? DEFAULT_CONFIG[target]);
  const [color,      setColor]      = useState(config[colorKey]      ?? DEFAULT_CONFIG[colorKey]);
  const [width,      setWidth]      = useState<1|2|3|4>(config[widthKey] ?? DEFAULT_CONFIG[widthKey]);
  const [style,      setStyle]      = useState(config[styleKey]      ?? DEFAULT_CONFIG[styleKey]);
  const [axisLabel,  setAxisLabel]  = useState(config[axisLabelKey]  ?? true);

  function save() {
    onSave({ [target]: clamp(period, 2, 500), [colorKey]: color, [widthKey]: width, [styleKey]: style, [axisLabelKey]: axisLabel });
  }

  return (
    <div className="flex flex-col gap-3">
      <Tabs active={tab} onChange={setTab} />

      {tab === "inputs" && (
        <Field label="Período" value={period} onChange={setPeriod} />
      )}

      {tab === "style" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="w-14 text-xs text-tv-text-muted">Color</span>
            <input
              type="color" value={color.slice(0, 7)}
              onChange={(e) => setColor(e.target.value)}
              className="h-6 w-7 cursor-pointer rounded border border-tv-border bg-transparent p-0"
            />
            <span className="text-[10px] font-mono text-tv-text-muted">{color}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-14 text-xs text-tv-text-muted">Grosor</span>
            <WidthPicker value={width} onChange={setWidth} />
          </div>
          <div className="flex items-center gap-3">
            <span className="w-14 text-xs text-tv-text-muted">Estilo</span>
            <LineStylePicker value={style} color={color} onChange={setStyle} />
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={axisLabel}
              onChange={(e) => setAxisLabel(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer rounded border border-tv-border bg-tv-bg accent-tv-blue"
            />
            <span className="text-xs text-tv-text">Etiqueta en eje de precio</span>
          </label>
        </div>
      )}

      <Actions onReset={onReset} onSave={save} />
    </div>
  );
}

function Actions({ onReset, onSave }: { onReset: () => void; onSave: () => void }) {
  return (
    <div className="mt-2 flex items-center justify-between">
      <Button variant="ghost" size="sm" onClick={onReset} className="text-tv-text-muted hover:text-tv-text">
        Reset defaults
      </Button>
      <Button size="sm" onClick={onSave} className="bg-tv-blue hover:bg-tv-blue/90">
        Aplicar
      </Button>
    </div>
  );
}
