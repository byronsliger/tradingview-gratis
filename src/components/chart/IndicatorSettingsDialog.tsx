"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  useChartStore,
  DEFAULT_CONFIG,
  type IndicatorKey,
} from "@/lib/store/chart-store";

const TITLES: Record<IndicatorKey, string> = {
  ema20: "EMA — Slot 1",
  ema50: "EMA — Slot 2",
  ema200: "EMA — Slot 3",
  rsi: "RSI",
  macd: "MACD",
  volume: "Volumen",
  sqzmom: "Squeeze Momentum [LazyBear]",
  adx: "DMI / ADX / KEYLEVEL",
  vrvp: "Perfil de Volumen Visible (VRVP)",
};

const HAS_STYLE_TAB = new Set<IndicatorKey>(["ema20", "ema50", "ema200", "sqzmom", "adx", "vrvp"]);

const LINE_STYLES = [
  { value: 0, label: "Sólida",      dasharray: "none" },
  { value: 2, label: "Discontinua", dasharray: "4,3" },
  { value: 1, label: "Punteada",    dasharray: "2,2" },
  { value: 3, label: "Guión largo", dasharray: "8,3" },
];

export function IndicatorSettingsDialog() {
  const target = useChartStore((s) => s.settingsTarget);
  const setTarget = useChartStore((s) => s.setSettingsTarget);
  const config = useChartStore((s) => s.config);
  const setConfig = useChartStore((s) => s.setConfig);

  const open = target !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setTarget(null);
      }}
    >
      <DialogContent className="max-w-sm bg-tv-panel">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            {target ? TITLES[target] : ""} — Configuración
          </DialogTitle>
        </DialogHeader>
        {target && (
          <SettingsForm
            target={target}
            config={config}
            onSave={(patch) => {
              setConfig(patch);
              setTarget(null);
            }}
            onReset={() => {
              setConfig(DEFAULT_CONFIG);
              setTarget(null);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface FormProps {
  target: IndicatorKey;
  config: typeof DEFAULT_CONFIG;
  onSave: (patch: Partial<typeof DEFAULT_CONFIG>) => void;
  onReset: () => void;
}

function SettingsForm({ target, config, onSave, onReset }: FormProps) {
  const [activeTab, setActiveTab] = useState<"inputs" | "style">("inputs");

  const [draft, setDraft] = useState({
    ema20:          config.ema20          ?? DEFAULT_CONFIG.ema20,
    ema50:          config.ema50          ?? DEFAULT_CONFIG.ema50,
    ema200:         config.ema200         ?? DEFAULT_CONFIG.ema200,
    rsi:            config.rsi            ?? DEFAULT_CONFIG.rsi,
    macdFast:       config.macdFast       ?? DEFAULT_CONFIG.macdFast,
    macdSlow:       config.macdSlow       ?? DEFAULT_CONFIG.macdSlow,
    macdSignal:     config.macdSignal     ?? DEFAULT_CONFIG.macdSignal,
    sqzmomBBLength: config.sqzmomBBLength ?? DEFAULT_CONFIG.sqzmomBBLength,
    sqzmomBBMult:   config.sqzmomBBMult   ?? DEFAULT_CONFIG.sqzmomBBMult,
    sqzmomKCLength: config.sqzmomKCLength ?? DEFAULT_CONFIG.sqzmomKCLength,
    sqzmomKCMult:   config.sqzmomKCMult   ?? DEFAULT_CONFIG.sqzmomKCMult,
    adxLen:           config.adxLen           ?? DEFAULT_CONFIG.adxLen,
    adxDiLen:         config.adxDiLen         ?? DEFAULT_CONFIG.adxDiLen,
    adxKeyLevel:      config.adxKeyLevel      ?? DEFAULT_CONFIG.adxKeyLevel,
    adxStrengthLevel: config.adxStrengthLevel ?? DEFAULT_CONFIG.adxStrengthLevel,
    // EMA style
    ema20Color: config.ema20Color ?? DEFAULT_CONFIG.ema20Color,
    ema20Width: config.ema20Width ?? DEFAULT_CONFIG.ema20Width,
    ema20Style: config.ema20Style ?? DEFAULT_CONFIG.ema20Style,
    ema50Color: config.ema50Color ?? DEFAULT_CONFIG.ema50Color,
    ema50Width: config.ema50Width ?? DEFAULT_CONFIG.ema50Width,
    ema50Style: config.ema50Style ?? DEFAULT_CONFIG.ema50Style,
    ema200Color: config.ema200Color ?? DEFAULT_CONFIG.ema200Color,
    ema200Width: config.ema200Width ?? DEFAULT_CONFIG.ema200Width,
    ema200Style: config.ema200Style ?? DEFAULT_CONFIG.ema200Style,
    // SQZ style
    sqzmomColorBullUp: config.sqzmomColorBullUp ?? DEFAULT_CONFIG.sqzmomColorBullUp,
    sqzmomColorBullDn: config.sqzmomColorBullDn ?? DEFAULT_CONFIG.sqzmomColorBullDn,
    sqzmomColorBearDn: config.sqzmomColorBearDn ?? DEFAULT_CONFIG.sqzmomColorBearDn,
    sqzmomColorBearUp: config.sqzmomColorBearUp ?? DEFAULT_CONFIG.sqzmomColorBearUp,
    sqzmomColorNoSqz:  config.sqzmomColorNoSqz  ?? DEFAULT_CONFIG.sqzmomColorNoSqz,
    sqzmomColorSqzOff: config.sqzmomColorSqzOff ?? DEFAULT_CONFIG.sqzmomColorSqzOff,
    // ADX style
    adxColorRising:   config.adxColorRising   ?? DEFAULT_CONFIG.adxColorRising,
    adxColorFalling:  config.adxColorFalling  ?? DEFAULT_CONFIG.adxColorFalling,
    adxColorKeyLevel: config.adxColorKeyLevel ?? DEFAULT_CONFIG.adxColorKeyLevel,
    adxColorStrength: config.adxColorStrength ?? DEFAULT_CONFIG.adxColorStrength,
    // VRVP
    vrvpRowLayout:        config.vrvpRowLayout        ?? DEFAULT_CONFIG.vrvpRowLayout,
    vrvpRowSize:          config.vrvpRowSize          ?? DEFAULT_CONFIG.vrvpRowSize,
    vrvpVolume:           config.vrvpVolume           ?? DEFAULT_CONFIG.vrvpVolume,
    vrvpValueAreaVolume:  config.vrvpValueAreaVolume  ?? DEFAULT_CONFIG.vrvpValueAreaVolume,
    vrvpShowProfile:      config.vrvpShowProfile      ?? DEFAULT_CONFIG.vrvpShowProfile,
    vrvpShowValues:       config.vrvpShowValues       ?? DEFAULT_CONFIG.vrvpShowValues,
    vrvpWidth:            config.vrvpWidth            ?? DEFAULT_CONFIG.vrvpWidth,
    vrvpPlacement:        config.vrvpPlacement        ?? DEFAULT_CONFIG.vrvpPlacement,
    vrvpColorUpVol:       config.vrvpColorUpVol       ?? DEFAULT_CONFIG.vrvpColorUpVol,
    vrvpColorDnVol:       config.vrvpColorDnVol       ?? DEFAULT_CONFIG.vrvpColorDnVol,
    vrvpColorUpVolVA:     config.vrvpColorUpVolVA     ?? DEFAULT_CONFIG.vrvpColorUpVolVA,
    vrvpColorDnVolVA:     config.vrvpColorDnVolVA     ?? DEFAULT_CONFIG.vrvpColorDnVolVA,
    vrvpShowVAH:          config.vrvpShowVAH          ?? DEFAULT_CONFIG.vrvpShowVAH,
    vrvpShowVAL:          config.vrvpShowVAL          ?? DEFAULT_CONFIG.vrvpShowVAL,
    vrvpShowPOC:          config.vrvpShowPOC          ?? DEFAULT_CONFIG.vrvpShowPOC,
    vrvpColorPOC:         config.vrvpColorPOC         ?? DEFAULT_CONFIG.vrvpColorPOC,
    vrvpColorVAH:         config.vrvpColorVAH         ?? DEFAULT_CONFIG.vrvpColorVAH,
    vrvpColorVAL:         config.vrvpColorVAL         ?? DEFAULT_CONFIG.vrvpColorVAL,
    vrvpShowLabels:       config.vrvpShowLabels       ?? DEFAULT_CONFIG.vrvpShowLabels,
    vrvpShowStatusValues: config.vrvpShowStatusValues ?? DEFAULT_CONFIG.vrvpShowStatusValues,
    vrvpShowStatusInputs: config.vrvpShowStatusInputs ?? DEFAULT_CONFIG.vrvpShowStatusInputs,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setActiveTab("inputs");
      setDraft({
        ema20:          config.ema20          ?? DEFAULT_CONFIG.ema20,
        ema50:          config.ema50          ?? DEFAULT_CONFIG.ema50,
        ema200:         config.ema200         ?? DEFAULT_CONFIG.ema200,
        rsi:            config.rsi            ?? DEFAULT_CONFIG.rsi,
        macdFast:       config.macdFast       ?? DEFAULT_CONFIG.macdFast,
        macdSlow:       config.macdSlow       ?? DEFAULT_CONFIG.macdSlow,
        macdSignal:     config.macdSignal     ?? DEFAULT_CONFIG.macdSignal,
        sqzmomBBLength: config.sqzmomBBLength ?? DEFAULT_CONFIG.sqzmomBBLength,
        sqzmomBBMult:   config.sqzmomBBMult   ?? DEFAULT_CONFIG.sqzmomBBMult,
        sqzmomKCLength: config.sqzmomKCLength ?? DEFAULT_CONFIG.sqzmomKCLength,
        sqzmomKCMult:   config.sqzmomKCMult   ?? DEFAULT_CONFIG.sqzmomKCMult,
        adxLen:           config.adxLen           ?? DEFAULT_CONFIG.adxLen,
        adxDiLen:         config.adxDiLen         ?? DEFAULT_CONFIG.adxDiLen,
        adxKeyLevel:      config.adxKeyLevel      ?? DEFAULT_CONFIG.adxKeyLevel,
        adxStrengthLevel: config.adxStrengthLevel ?? DEFAULT_CONFIG.adxStrengthLevel,
        ema20Color: config.ema20Color ?? DEFAULT_CONFIG.ema20Color,
        ema20Width: config.ema20Width ?? DEFAULT_CONFIG.ema20Width,
        ema20Style: config.ema20Style ?? DEFAULT_CONFIG.ema20Style,
        ema50Color: config.ema50Color ?? DEFAULT_CONFIG.ema50Color,
        ema50Width: config.ema50Width ?? DEFAULT_CONFIG.ema50Width,
        ema50Style: config.ema50Style ?? DEFAULT_CONFIG.ema50Style,
        ema200Color: config.ema200Color ?? DEFAULT_CONFIG.ema200Color,
        ema200Width: config.ema200Width ?? DEFAULT_CONFIG.ema200Width,
        ema200Style: config.ema200Style ?? DEFAULT_CONFIG.ema200Style,
        sqzmomColorBullUp: config.sqzmomColorBullUp ?? DEFAULT_CONFIG.sqzmomColorBullUp,
        sqzmomColorBullDn: config.sqzmomColorBullDn ?? DEFAULT_CONFIG.sqzmomColorBullDn,
        sqzmomColorBearDn: config.sqzmomColorBearDn ?? DEFAULT_CONFIG.sqzmomColorBearDn,
        sqzmomColorBearUp: config.sqzmomColorBearUp ?? DEFAULT_CONFIG.sqzmomColorBearUp,
        sqzmomColorNoSqz:  config.sqzmomColorNoSqz  ?? DEFAULT_CONFIG.sqzmomColorNoSqz,
        sqzmomColorSqzOff: config.sqzmomColorSqzOff ?? DEFAULT_CONFIG.sqzmomColorSqzOff,
        adxColorRising:   config.adxColorRising   ?? DEFAULT_CONFIG.adxColorRising,
        adxColorFalling:  config.adxColorFalling  ?? DEFAULT_CONFIG.adxColorFalling,
        adxColorKeyLevel: config.adxColorKeyLevel ?? DEFAULT_CONFIG.adxColorKeyLevel,
        adxColorStrength: config.adxColorStrength ?? DEFAULT_CONFIG.adxColorStrength,
        vrvpRowLayout:        config.vrvpRowLayout        ?? DEFAULT_CONFIG.vrvpRowLayout,
        vrvpRowSize:          config.vrvpRowSize          ?? DEFAULT_CONFIG.vrvpRowSize,
        vrvpVolume:           config.vrvpVolume           ?? DEFAULT_CONFIG.vrvpVolume,
        vrvpValueAreaVolume:  config.vrvpValueAreaVolume  ?? DEFAULT_CONFIG.vrvpValueAreaVolume,
        vrvpShowProfile:      config.vrvpShowProfile      ?? DEFAULT_CONFIG.vrvpShowProfile,
        vrvpShowValues:       config.vrvpShowValues       ?? DEFAULT_CONFIG.vrvpShowValues,
        vrvpWidth:            config.vrvpWidth            ?? DEFAULT_CONFIG.vrvpWidth,
        vrvpPlacement:        config.vrvpPlacement        ?? DEFAULT_CONFIG.vrvpPlacement,
        vrvpColorUpVol:       config.vrvpColorUpVol       ?? DEFAULT_CONFIG.vrvpColorUpVol,
        vrvpColorDnVol:       config.vrvpColorDnVol       ?? DEFAULT_CONFIG.vrvpColorDnVol,
        vrvpColorUpVolVA:     config.vrvpColorUpVolVA     ?? DEFAULT_CONFIG.vrvpColorUpVolVA,
        vrvpColorDnVolVA:     config.vrvpColorDnVolVA     ?? DEFAULT_CONFIG.vrvpColorDnVolVA,
        vrvpShowVAH:          config.vrvpShowVAH          ?? DEFAULT_CONFIG.vrvpShowVAH,
        vrvpShowVAL:          config.vrvpShowVAL          ?? DEFAULT_CONFIG.vrvpShowVAL,
        vrvpShowPOC:          config.vrvpShowPOC          ?? DEFAULT_CONFIG.vrvpShowPOC,
        vrvpColorPOC:         config.vrvpColorPOC         ?? DEFAULT_CONFIG.vrvpColorPOC,
        vrvpColorVAH:         config.vrvpColorVAH         ?? DEFAULT_CONFIG.vrvpColorVAH,
        vrvpColorVAL:         config.vrvpColorVAL         ?? DEFAULT_CONFIG.vrvpColorVAL,
        vrvpShowLabels:       config.vrvpShowLabels       ?? DEFAULT_CONFIG.vrvpShowLabels,
        vrvpShowStatusValues: config.vrvpShowStatusValues ?? DEFAULT_CONFIG.vrvpShowStatusValues,
        vrvpShowStatusInputs: config.vrvpShowStatusInputs ?? DEFAULT_CONFIG.vrvpShowStatusInputs,
      });
    }, 0);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, target]);

  function save() {
    if (target === "ema20")
      onSave({ ema20: clamp(draft.ema20, 2, 500), ema20Color: draft.ema20Color, ema20Width: draft.ema20Width, ema20Style: draft.ema20Style });
    else if (target === "ema50")
      onSave({ ema50: clamp(draft.ema50, 2, 500), ema50Color: draft.ema50Color, ema50Width: draft.ema50Width, ema50Style: draft.ema50Style });
    else if (target === "ema200")
      onSave({ ema200: clamp(draft.ema200, 2, 500), ema200Color: draft.ema200Color, ema200Width: draft.ema200Width, ema200Style: draft.ema200Style });
    else if (target === "rsi") onSave({ rsi: clamp(draft.rsi, 2, 100) });
    else if (target === "macd")
      onSave({
        macdFast: clamp(draft.macdFast, 2, 100),
        macdSlow: clamp(draft.macdSlow, 2, 200),
        macdSignal: clamp(draft.macdSignal, 2, 100),
      });
    else if (target === "volume") onSave({});
    else if (target === "sqzmom")
      onSave({
        sqzmomBBLength: clamp(draft.sqzmomBBLength, 2, 200),
        sqzmomBBMult:   Math.max(0.1, draft.sqzmomBBMult),
        sqzmomKCLength: clamp(draft.sqzmomKCLength, 2, 200),
        sqzmomKCMult:   Math.max(0.1, draft.sqzmomKCMult),
        sqzmomColorBullUp: draft.sqzmomColorBullUp,
        sqzmomColorBullDn: draft.sqzmomColorBullDn,
        sqzmomColorBearDn: draft.sqzmomColorBearDn,
        sqzmomColorBearUp: draft.sqzmomColorBearUp,
        sqzmomColorNoSqz:  draft.sqzmomColorNoSqz,
        sqzmomColorSqzOff: draft.sqzmomColorSqzOff,
      });
    else if (target === "adx")
      onSave({
        adxLen:           clamp(draft.adxLen, 2, 200),
        adxDiLen:         clamp(draft.adxDiLen, 2, 200),
        adxKeyLevel:      clamp(draft.adxKeyLevel, 0, 100),
        adxStrengthLevel: clamp(draft.adxStrengthLevel, 0, 100),
        adxColorRising:   draft.adxColorRising,
        adxColorFalling:  draft.adxColorFalling,
        adxColorKeyLevel: draft.adxColorKeyLevel,
        adxColorStrength: draft.adxColorStrength,
      });
    else if (target === "vrvp")
      onSave({
        vrvpRowLayout:        draft.vrvpRowLayout,
        vrvpRowSize:          clamp(draft.vrvpRowSize, 5, 1000),
        vrvpVolume:           draft.vrvpVolume,
        vrvpValueAreaVolume:  clamp(draft.vrvpValueAreaVolume, 0, 100),
        vrvpShowProfile:      draft.vrvpShowProfile,
        vrvpShowValues:       draft.vrvpShowValues,
        vrvpWidth:            clamp(draft.vrvpWidth, 5, 100),
        vrvpPlacement:        draft.vrvpPlacement,
        vrvpColorUpVol:       draft.vrvpColorUpVol,
        vrvpColorDnVol:       draft.vrvpColorDnVol,
        vrvpColorUpVolVA:     draft.vrvpColorUpVolVA,
        vrvpColorDnVolVA:     draft.vrvpColorDnVolVA,
        vrvpShowVAH:          draft.vrvpShowVAH,
        vrvpShowVAL:          draft.vrvpShowVAL,
        vrvpShowPOC:          draft.vrvpShowPOC,
        vrvpColorPOC:         draft.vrvpColorPOC,
        vrvpColorVAH:         draft.vrvpColorVAH,
        vrvpColorVAL:         draft.vrvpColorVAL,
        vrvpShowLabels:       draft.vrvpShowLabels,
        vrvpShowStatusValues: draft.vrvpShowStatusValues,
        vrvpShowStatusInputs: draft.vrvpShowStatusInputs,
      });
  }

  const showTabs = HAS_STYLE_TAB.has(target);

  return (
    <div className="flex flex-col gap-3">
      {showTabs && (
        <div className="flex border-b border-tv-border -mx-6 px-6 pb-2 mb-2 text-xs">
          <TabBtn label="Valores" active={activeTab === "inputs"} onClick={() => setActiveTab("inputs")} />
          <TabBtn label="Estilo"  active={activeTab === "style"}  onClick={() => setActiveTab("style")} />
        </div>
      )}

      {/* ── INPUTS TAB ── */}
      {activeTab === "inputs" && (
        <div className="flex flex-col gap-3">
          {(target === "ema20" || target === "ema50" || target === "ema200") && (
            <Field label="Período" value={draft[target]} onChange={(n) => setDraft((d) => ({ ...d, [target]: n }))} />
          )}
          {target === "rsi" && (
            <Field label="Período" value={draft.rsi} onChange={(n) => setDraft((d) => ({ ...d, rsi: n }))} />
          )}
          {target === "macd" && (
            <div className="grid grid-cols-3 gap-2">
              <Field label="Rápida" value={draft.macdFast}   onChange={(n) => setDraft((d) => ({ ...d, macdFast: n }))} />
              <Field label="Lenta"  value={draft.macdSlow}   onChange={(n) => setDraft((d) => ({ ...d, macdSlow: n }))} />
              <Field label="Señal"  value={draft.macdSignal} onChange={(n) => setDraft((d) => ({ ...d, macdSignal: n }))} />
            </div>
          )}
          {target === "volume" && (
            <p className="text-xs text-tv-text-muted">El indicador de volumen no tiene parámetros configurables.</p>
          )}
          {target === "sqzmom" && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                <Field label="BB Length" value={draft.sqzmomBBLength} onChange={(n) => setDraft((d) => ({ ...d, sqzmomBBLength: n }))} />
                <FieldFloat label="BB Mult" value={draft.sqzmomBBMult} onChange={(n) => setDraft((d) => ({ ...d, sqzmomBBMult: n }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="KC Length" value={draft.sqzmomKCLength} onChange={(n) => setDraft((d) => ({ ...d, sqzmomKCLength: n }))} />
                <FieldFloat label="KC Mult" value={draft.sqzmomKCMult} onChange={(n) => setDraft((d) => ({ ...d, sqzmomKCMult: n }))} />
              </div>
              <p className="text-[10px] text-tv-text-muted">Basado en el indicador original de LazyBear</p>
            </div>
          )}
          {target === "adx" && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                <Field label="DI Length"      value={draft.adxDiLen}         onChange={(n) => setDraft((d) => ({ ...d, adxDiLen: n }))} />
                <Field label="ADX Smoothing"  value={draft.adxLen}           onChange={(n) => setDraft((d) => ({ ...d, adxLen: n }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Key Level"      value={draft.adxKeyLevel}      onChange={(n) => setDraft((d) => ({ ...d, adxKeyLevel: n }))} />
                <Field label="Strength Level" value={draft.adxStrengthLevel} onChange={(n) => setDraft((d) => ({ ...d, adxStrengthLevel: n }))} />
              </div>
            </div>
          )}
          {target === "vrvp" && (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">Diseño de las filas</span>
                <select
                  value={draft.vrvpRowLayout}
                  onChange={(e) => setDraft((d) => ({ ...d, vrvpRowLayout: e.target.value as "rows" | "ticks" }))}
                  className="bg-tv-bg text-xs border border-tv-border rounded-md px-2 py-1.5 focus:outline-none focus:border-tv-blue text-tv-text"
                >
                  <option value="rows">Tamaño de filas</option>
                  <option value="ticks">Ticks por fila</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">Tamaño de la fila</span>
                <Input type="number" min={5} max={1000} value={draft.vrvpRowSize}
                  onChange={(e) => { const n = parseInt(e.target.value, 10); if (!isNaN(n)) setDraft((d) => ({ ...d, vrvpRowSize: n })); }}
                  className="bg-tv-bg tabular-nums text-xs" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">Volumen</span>
                <select
                  value={draft.vrvpVolume}
                  onChange={(e) => setDraft((d) => ({ ...d, vrvpVolume: e.target.value as "total" | "updown" }))}
                  className="bg-tv-bg text-xs border border-tv-border rounded-md px-2 py-1.5 focus:outline-none focus:border-tv-blue text-tv-text"
                >
                  <option value="total">Total</option>
                  <option value="updown">Arriba / Abajo</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">Volumen del área de valor (%)</span>
                <Input type="number" min={0} max={100} value={draft.vrvpValueAreaVolume}
                  onChange={(e) => { const n = parseInt(e.target.value, 10); if (!isNaN(n)) setDraft((d) => ({ ...d, vrvpValueAreaVolume: n })); }}
                  className="bg-tv-bg tabular-nums text-xs" />
              </label>
            </div>
          )}
        </div>
      )}

      {/* ── STYLE TAB ── */}
      {activeTab === "style" && (
        <div className="flex flex-col gap-3 max-h-[320px] overflow-y-auto pr-1">

          {/* EMA style */}
          {(target === "ema20" || target === "ema50" || target === "ema200") && (() => {
            const colorKey = `${target}Color` as "ema20Color" | "ema50Color" | "ema200Color";
            const widthKey = `${target}Width` as "ema20Width" | "ema50Width" | "ema200Width";
            const styleKey = `${target}Style` as "ema20Style" | "ema50Style" | "ema200Style";
            return (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="w-14 text-xs text-tv-text-muted">Color</span>
                  <input type="color" value={draft[colorKey].slice(0, 7)}
                    onChange={(e) => setDraft((d) => ({ ...d, [colorKey]: e.target.value }))}
                    className="h-6 w-7 cursor-pointer rounded border border-tv-border bg-transparent p-0" />
                  <span className="text-[10px] font-mono text-tv-text-muted">{draft[colorKey]}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-14 text-xs text-tv-text-muted">Grosor</span>
                  <div className="flex gap-1">
                    {([1, 2, 3, 4] as const).map((w) => (
                      <button key={w}
                        onClick={() => setDraft((d) => ({ ...d, [widthKey]: w }))}
                        className={`flex h-6 w-8 items-center justify-center rounded border transition-colors text-[10px] tabular-nums ${
                          draft[widthKey] === w ? "border-tv-blue bg-tv-blue/10 text-tv-blue" : "border-tv-border text-tv-text-muted hover:border-tv-text-muted"
                        }`}
                      >{w}</button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-14 text-xs text-tv-text-muted">Estilo</span>
                  <div className="flex gap-1">
                    {LINE_STYLES.map((s) => (
                      <button key={s.value} title={s.label}
                        onClick={() => setDraft((d) => ({ ...d, [styleKey]: s.value }))}
                        className={`flex h-6 w-8 items-center justify-center rounded border transition-colors ${
                          draft[styleKey] === s.value ? "border-tv-blue bg-tv-blue/10" : "border-tv-border hover:border-tv-text-muted"
                        }`}
                      >
                        <svg width="20" height="8" viewBox="0 0 20 8">
                          <line x1="0" y1="4" x2="20" y2="4"
                            stroke={draft[styleKey] === s.value ? "#2962ff" : "#787b86"}
                            strokeWidth="1.5"
                            strokeDasharray={s.dasharray === "none" ? undefined : s.dasharray} />
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* SQZ style */}
          {target === "sqzmom" && (
            <div className="flex flex-col gap-1">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted mb-1">Histograma</h4>
              <SimpleColorRow label="Alcista subiendo"   color={draft.sqzmomColorBullUp} onColorChange={(c) => setDraft((d) => ({ ...d, sqzmomColorBullUp: c }))} />
              <SimpleColorRow label="Alcista bajando"    color={draft.sqzmomColorBullDn} onColorChange={(c) => setDraft((d) => ({ ...d, sqzmomColorBullDn: c }))} />
              <SimpleColorRow label="Bajista bajando"    color={draft.sqzmomColorBearDn} onColorChange={(c) => setDraft((d) => ({ ...d, sqzmomColorBearDn: c }))} />
              <SimpleColorRow label="Bajista subiendo"   color={draft.sqzmomColorBearUp} onColorChange={(c) => setDraft((d) => ({ ...d, sqzmomColorBearUp: c }))} />
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted mt-3 mb-1">Puntos (Squeeze)</h4>
              <SimpleColorRow label="Sin squeeze"        color={draft.sqzmomColorNoSqz}  onColorChange={(c) => setDraft((d) => ({ ...d, sqzmomColorNoSqz: c }))} />
              <SimpleColorRow label="Squeeze apagado"    color={draft.sqzmomColorSqzOff} onColorChange={(c) => setDraft((d) => ({ ...d, sqzmomColorSqzOff: c }))} />
            </div>
          )}

          {/* ADX style */}
          {target === "adx" && (
            <div className="flex flex-col gap-1">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted mb-1">ADX</h4>
              <SimpleColorRow label="Subiendo"       color={draft.adxColorRising}   onColorChange={(c) => setDraft((d) => ({ ...d, adxColorRising: c }))} />
              <SimpleColorRow label="Bajando"        color={draft.adxColorFalling}  onColorChange={(c) => setDraft((d) => ({ ...d, adxColorFalling: c }))} />
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted mt-3 mb-1">Niveles</h4>
              <SimpleColorRow label="Key Level"      color={draft.adxColorKeyLevel} onColorChange={(c) => setDraft((d) => ({ ...d, adxColorKeyLevel: c }))} />
              <SimpleColorRow label="Strength Level" color={draft.adxColorStrength} onColorChange={(c) => setDraft((d) => ({ ...d, adxColorStrength: c }))} />
            </div>
          )}

          {/* VRVP style */}
          {target === "vrvp" && (
            <div className="flex flex-col gap-2">
              <div className="border-b border-tv-border pb-2 mb-1">
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted mb-2">Perfil de Volumen</h4>
                <ColorRow label="Volumen Ascendente" checked={draft.vrvpShowProfile} onCheckedChange={(v) => setDraft((d) => ({ ...d, vrvpShowProfile: v }))} color={draft.vrvpColorUpVol}   onColorChange={(c) => setDraft((d) => ({ ...d, vrvpColorUpVol: c }))}   defaultAlpha="44" />
                <ColorRow label="Volumen Descendente" checked={draft.vrvpShowProfile} onCheckedChange={(v) => setDraft((d) => ({ ...d, vrvpShowProfile: v }))} color={draft.vrvpColorDnVol}   onColorChange={(c) => setDraft((d) => ({ ...d, vrvpColorDnVol: c }))}   defaultAlpha="44" />
                <ColorRow label="VA Ascendente"       checked={draft.vrvpShowProfile} onCheckedChange={(v) => setDraft((d) => ({ ...d, vrvpShowProfile: v }))} color={draft.vrvpColorUpVolVA} onColorChange={(c) => setDraft((d) => ({ ...d, vrvpColorUpVolVA: c }))} defaultAlpha="bb" />
                <ColorRow label="VA Descendente"      checked={draft.vrvpShowProfile} onCheckedChange={(v) => setDraft((d) => ({ ...d, vrvpShowProfile: v }))} color={draft.vrvpColorDnVolVA} onColorChange={(c) => setDraft((d) => ({ ...d, vrvpColorDnVolVA: c }))} defaultAlpha="bb" />
                <div className="grid grid-cols-2 gap-2 mt-2 pt-1">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">Ubicación</span>
                    <select value={draft.vrvpPlacement} onChange={(e) => setDraft((d) => ({ ...d, vrvpPlacement: e.target.value as "Left" | "Right" }))}
                      className="bg-tv-bg text-xs border border-tv-border rounded-md px-2 py-1.5 focus:outline-none focus:border-tv-blue text-tv-text">
                      <option value="Left">Izquierda</option>
                      <option value="Right">Derecha</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">Ancho (%)</span>
                    <Input type="number" min={5} max={100} value={draft.vrvpWidth}
                      onChange={(e) => { const n = parseInt(e.target.value, 10); if (!isNaN(n)) setDraft((d) => ({ ...d, vrvpWidth: n })); }}
                      className="bg-tv-bg tabular-nums text-xs h-8" />
                  </label>
                </div>
              </div>
              <div>
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted mb-2">Líneas del Perfil</h4>
                <ColorRow label="Punto de Control (POC)" checked={draft.vrvpShowPOC} onCheckedChange={(v) => setDraft((d) => ({ ...d, vrvpShowPOC: v }))} color={draft.vrvpColorPOC} onColorChange={(c) => setDraft((d) => ({ ...d, vrvpColorPOC: c }))} defaultAlpha="" />
                <ColorRow label="Value Area High (VAH)"  checked={draft.vrvpShowVAH} onCheckedChange={(v) => setDraft((d) => ({ ...d, vrvpShowVAH: v }))} color={draft.vrvpColorVAH} onColorChange={(c) => setDraft((d) => ({ ...d, vrvpColorVAH: c }))} defaultAlpha="" />
                <ColorRow label="Value Area Low (VAL)"   checked={draft.vrvpShowVAL} onCheckedChange={(v) => setDraft((d) => ({ ...d, vrvpShowVAL: v }))} color={draft.vrvpColorVAL} onColorChange={(c) => setDraft((d) => ({ ...d, vrvpColorVAL: c }))} defaultAlpha="" />
              </div>
            </div>
          )}
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

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`px-3 py-1.5 font-medium border-b-2 -mb-px transition-colors text-xs ${
        active ? "border-tv-blue text-tv-text" : "border-transparent text-tv-text-muted hover:text-tv-text"
      }`}
    >{label}</button>
  );
}

function Field({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">{label}</span>
      <Input type="number" min={2} max={500} value={value}
        onChange={(e) => { const n = parseInt(e.target.value, 10); if (!isNaN(n)) onChange(n); }}
        className="bg-tv-bg tabular-nums" />
    </label>
  );
}

function FieldFloat({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">{label}</span>
      <Input type="number" min={0.1} max={10} step={0.1} value={value}
        onChange={(e) => { const n = parseFloat(e.target.value); if (!isNaN(n)) onChange(n); }}
        className="bg-tv-bg tabular-nums" />
    </label>
  );
}

function SimpleColorRow({ label, color, onColorChange }: { label: string; color: string; onColorChange: (c: string) => void }) {
  const hex6 = color ? color.slice(0, 7) : "#ffffff";
  return (
    <div className="flex items-center justify-between py-1 text-xs">
      <span className="text-tv-text font-medium">{label}</span>
      <div className="flex items-center gap-1.5">
        <input type="color" value={hex6}
          onChange={(e) => {
            const alpha = color && color.length === 9 ? color.slice(7, 9) : "";
            onColorChange(e.target.value + alpha);
          }}
          className="w-6 h-5 rounded cursor-pointer border border-tv-border bg-transparent p-0" />
        <input type="text" value={color || ""}
          onChange={(e) => onColorChange(e.target.value)}
          className="w-20 bg-tv-bg text-[10px] border border-tv-border rounded px-1.5 py-0.5 font-mono text-tv-text focus:outline-none focus:border-tv-blue" />
      </div>
    </div>
  );
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function ColorRow({
  label, checked, onCheckedChange, color, onColorChange, defaultAlpha = "",
}: {
  label: string;
  checked?: boolean;
  onCheckedChange?: (v: boolean) => void;
  color: string;
  onColorChange: (c: string) => void;
  defaultAlpha?: string;
}) {
  const hex6 = color ? color.slice(0, 7) : "#ffffff";
  return (
    <div className="flex items-center justify-between py-1 text-xs">
      <div className="flex items-center gap-2">
        {onCheckedChange !== undefined && (
          <input type="checkbox" checked={checked} onChange={(e) => onCheckedChange(e.target.checked)}
            className="w-3.5 h-3.5 accent-tv-blue border border-tv-border bg-tv-bg text-tv-blue focus:ring-0 cursor-pointer rounded" />
        )}
        <span className={checked === false ? "text-tv-text-dim" : "text-tv-text font-medium"}>{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <input type="color" value={hex6} disabled={checked === false}
          onChange={(e) => {
            const alpha = color && color.length === 9 ? color.slice(7, 9) : defaultAlpha;
            onColorChange(e.target.value + alpha);
          }}
          className="w-6 h-5 rounded cursor-pointer border border-tv-border bg-transparent p-0 disabled:opacity-40 disabled:cursor-not-allowed" />
        <input type="text" value={color || ""} disabled={checked === false}
          onChange={(e) => onColorChange(e.target.value)}
          className="w-20 bg-tv-bg text-[10px] border border-tv-border rounded px-1.5 py-0.5 font-mono text-tv-text disabled:opacity-40 focus:outline-none focus:border-tv-blue" />
      </div>
    </div>
  );
}
