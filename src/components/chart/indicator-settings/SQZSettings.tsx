"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DEFAULT_CONFIG, type IndicatorConfig } from "@/lib/store/chart-store";
import { Tabs, Field, FieldFloat, SimpleColorRow, SectionLabel, clamp, AxisLabelToggle } from "./shared";

interface Props {
  config: IndicatorConfig;
  onSave: (patch: Partial<IndicatorConfig>) => void;
  onReset: () => void;
}

export function SQZSettings({ config, onSave, onReset }: Props) {
  const [tab, setTab] = useState<"inputs" | "style">("inputs");

  const [bbLength,  setBBLength]  = useState(config.sqzmomBBLength   ?? DEFAULT_CONFIG.sqzmomBBLength);
  const [bbMult,    setBBMult]    = useState(config.sqzmomBBMult     ?? DEFAULT_CONFIG.sqzmomBBMult);
  const [kcLength,  setKCLength]  = useState(config.sqzmomKCLength   ?? DEFAULT_CONFIG.sqzmomKCLength);
  const [kcMult,    setKCMult]    = useState(config.sqzmomKCMult     ?? DEFAULT_CONFIG.sqzmomKCMult);
  const [axisLabel, setAxisLabel] = useState(config.sqzmomAxisLabel  ?? true);

  const [bullUp,  setBullUp]  = useState(config.sqzmomColorBullUp ?? DEFAULT_CONFIG.sqzmomColorBullUp);
  const [bullDn,  setBullDn]  = useState(config.sqzmomColorBullDn ?? DEFAULT_CONFIG.sqzmomColorBullDn);
  const [bearDn,  setBearDn]  = useState(config.sqzmomColorBearDn ?? DEFAULT_CONFIG.sqzmomColorBearDn);
  const [bearUp,  setBearUp]  = useState(config.sqzmomColorBearUp ?? DEFAULT_CONFIG.sqzmomColorBearUp);
  const [noSqz,   setNoSqz]   = useState(config.sqzmomColorNoSqz  ?? DEFAULT_CONFIG.sqzmomColorNoSqz);
  const [sqzOff,  setSqzOff]  = useState(config.sqzmomColorSqzOff ?? DEFAULT_CONFIG.sqzmomColorSqzOff);

  function save() {
    onSave({
      sqzmomBBLength: clamp(bbLength, 2, 200),
      sqzmomBBMult:   Math.max(0.1, bbMult),
      sqzmomKCLength: clamp(kcLength, 2, 200),
      sqzmomKCMult:   Math.max(0.1, kcMult),
      sqzmomColorBullUp: bullUp,
      sqzmomColorBullDn: bullDn,
      sqzmomColorBearDn: bearDn,
      sqzmomColorBearUp: bearUp,
      sqzmomColorNoSqz:  noSqz,
      sqzmomColorSqzOff: sqzOff,
      sqzmomAxisLabel:   axisLabel,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Tabs active={tab} onChange={setTab} />

      {tab === "inputs" && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="BB Length" value={bbLength} onChange={setBBLength} />
            <FieldFloat label="BB Mult" value={bbMult} onChange={setBBMult} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="KC Length" value={kcLength} onChange={setKCLength} />
            <FieldFloat label="KC Mult" value={kcMult} onChange={setKCMult} />
          </div>
          <p className="text-[10px] text-tv-text-muted">Basado en el indicador original de LazyBear</p>
        </div>
      )}

      {tab === "style" && (
        <div className="flex flex-col gap-1">
          <AxisLabelToggle value={axisLabel} onChange={setAxisLabel} />
          <SectionLabel>Histograma</SectionLabel>
          <SimpleColorRow label="Alcista subiendo" color={bullUp} onColorChange={setBullUp} />
          <SimpleColorRow label="Alcista bajando"  color={bullDn} onColorChange={setBullDn} />
          <SimpleColorRow label="Bajista bajando"  color={bearDn} onColorChange={setBearDn} />
          <SimpleColorRow label="Bajista subiendo" color={bearUp} onColorChange={setBearUp} />
          <SectionLabel>Puntos (Squeeze)</SectionLabel>
          <SimpleColorRow label="Sin squeeze"     color={noSqz}  onColorChange={setNoSqz} />
          <SimpleColorRow label="Squeeze apagado" color={sqzOff} onColorChange={setSqzOff} />
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
