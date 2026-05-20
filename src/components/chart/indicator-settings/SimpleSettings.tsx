"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DEFAULT_CONFIG, type IndicatorConfig } from "@/lib/store/chart-store";
import { Field, clamp } from "./shared";

interface Props {
  config: IndicatorConfig;
  onSave: (patch: Partial<IndicatorConfig>) => void;
  onReset: () => void;
}

export function RSISettings({ config, onSave, onReset }: Props) {
  const [period, setPeriod] = useState(config.rsi ?? DEFAULT_CONFIG.rsi);
  return (
    <SimpleForm onReset={onReset} onSave={() => onSave({ rsi: clamp(period, 2, 100) })}>
      <Field label="Período" value={period} onChange={setPeriod} max={100} />
    </SimpleForm>
  );
}

export function MACDSettings({ config, onSave, onReset }: Props) {
  const [fast,   setFast]   = useState(config.macdFast   ?? DEFAULT_CONFIG.macdFast);
  const [slow,   setSlow]   = useState(config.macdSlow   ?? DEFAULT_CONFIG.macdSlow);
  const [signal, setSignal] = useState(config.macdSignal ?? DEFAULT_CONFIG.macdSignal);
  return (
    <SimpleForm onReset={onReset} onSave={() => onSave({
      macdFast: clamp(fast, 2, 100), macdSlow: clamp(slow, 2, 200), macdSignal: clamp(signal, 2, 100),
    })}>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Rápida" value={fast}   onChange={setFast}   max={100} />
        <Field label="Lenta"  value={slow}   onChange={setSlow}   max={200} />
        <Field label="Señal"  value={signal} onChange={setSignal} max={100} />
      </div>
    </SimpleForm>
  );
}

export function VolumeSettings({ onReset, onSave }: Omit<Props, "config">) {
  return (
    <SimpleForm onReset={onReset} onSave={() => onSave({})}>
      <p className="text-xs text-tv-text-muted">El indicador de volumen no tiene parámetros configurables.</p>
    </SimpleForm>
  );
}

function SimpleForm({ children, onReset, onSave }: { children: React.ReactNode; onReset: () => void; onSave: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      {children}
      <div className="mt-2 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onReset} className="text-tv-text-muted hover:text-tv-text">
          Reset defaults
        </Button>
        <Button size="sm" onClick={onSave} className="bg-tv-blue hover:bg-tv-blue/90">
          Aplicar
        </Button>
      </div>
    </div>
  );
}
