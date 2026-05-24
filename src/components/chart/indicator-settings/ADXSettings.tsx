"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DEFAULT_CONFIG, type IndicatorConfig } from "@/lib/store/chart-store";
import { Tabs, Field, SimpleColorRow, SectionLabel, clamp, AxisLabelToggle } from "./shared";

interface Props {
  config: IndicatorConfig;
  onSave: (patch: Partial<IndicatorConfig>) => void;
  onReset: () => void;
}

export function ADXSettings({ config, onSave, onReset }: Props) {
  const [tab, setTab] = useState<"inputs" | "style">("inputs");

  const [adxLen,        setAdxLen]        = useState(config.adxLen           ?? DEFAULT_CONFIG.adxLen);
  const [diLen,         setDiLen]         = useState(config.adxDiLen         ?? DEFAULT_CONFIG.adxDiLen);
  const [keyLevel,      setKeyLevel]      = useState(config.adxKeyLevel      ?? DEFAULT_CONFIG.adxKeyLevel);
  const [strengthLevel, setStrengthLevel] = useState(config.adxStrengthLevel ?? DEFAULT_CONFIG.adxStrengthLevel);
  const [axisLabel,     setAxisLabel]     = useState(config.adxAxisLabel     ?? true);

  const [colorRising,   setColorRising]   = useState(config.adxColorRising   ?? DEFAULT_CONFIG.adxColorRising);
  const [colorFalling,  setColorFalling]  = useState(config.adxColorFalling  ?? DEFAULT_CONFIG.adxColorFalling);
  const [colorKeyLevel, setColorKeyLevel] = useState(config.adxColorKeyLevel ?? DEFAULT_CONFIG.adxColorKeyLevel);
  const [colorStrength, setColorStrength] = useState(config.adxColorStrength ?? DEFAULT_CONFIG.adxColorStrength);

  function save() {
    onSave({
      adxLen:           clamp(adxLen, 2, 200),
      adxDiLen:         clamp(diLen, 2, 200),
      adxKeyLevel:      clamp(keyLevel, 0, 100),
      adxStrengthLevel: clamp(strengthLevel, 0, 100),
      adxColorRising:   colorRising,
      adxColorFalling:  colorFalling,
      adxColorKeyLevel: colorKeyLevel,
      adxColorStrength: colorStrength,
      adxAxisLabel:     axisLabel,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Tabs active={tab} onChange={setTab} />

      {tab === "inputs" && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="DI Length"      value={diLen}         onChange={setDiLen} />
            <Field label="ADX Smoothing"  value={adxLen}        onChange={setAdxLen} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Key Level"      value={keyLevel}      onChange={setKeyLevel}      min={0} max={100} />
            <Field label="Strength Level" value={strengthLevel} onChange={setStrengthLevel} min={0} max={100} />
          </div>
        </div>
      )}

      {tab === "style" && (
        <div className="flex flex-col gap-1">
          <AxisLabelToggle value={axisLabel} onChange={setAxisLabel} />
          <SectionLabel>ADX</SectionLabel>
          <SimpleColorRow label="Subiendo"       color={colorRising}   onColorChange={setColorRising} />
          <SimpleColorRow label="Bajando"        color={colorFalling}  onColorChange={setColorFalling} />
          <SectionLabel>Niveles</SectionLabel>
          <SimpleColorRow label="Key Level"      color={colorKeyLevel} onColorChange={setColorKeyLevel} />
          <SimpleColorRow label="Strength Level" color={colorStrength} onColorChange={setColorStrength} />
        </div>
      )}

      <div className="mt-2 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onReset} className="text-tv-text-muted hover:text-tv-text">
          Reset defaults
        </Button>
        <Button size="sm" onClick={save} className="bg-tv-blue hover:bg-tv-blue/90">
          Aplicar
        </Button>
      </div>
    </div>
  );
}
