"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_CONFIG, type IndicatorConfig } from "@/lib/store/chart-store";
import { Tabs, ColorRow, SectionLabel, clamp } from "./shared";

interface Props {
  config: IndicatorConfig;
  onSave: (patch: Partial<IndicatorConfig>) => void;
  onReset: () => void;
}

export function VRVPSettings({ config, onSave, onReset }: Props) {
  const [tab, setTab] = useState<"inputs" | "style">("inputs");

  const [rowLayout,       setRowLayout]       = useState(config.vrvpRowLayout       ?? DEFAULT_CONFIG.vrvpRowLayout);
  const [rowSize,         setRowSize]         = useState(config.vrvpRowSize         ?? DEFAULT_CONFIG.vrvpRowSize);
  const [volume,          setVolume]          = useState(config.vrvpVolume          ?? DEFAULT_CONFIG.vrvpVolume);
  const [valueAreaVolume, setValueAreaVolume] = useState(config.vrvpValueAreaVolume ?? DEFAULT_CONFIG.vrvpValueAreaVolume);

  const [showProfile,   setShowProfile]   = useState(config.vrvpShowProfile   ?? DEFAULT_CONFIG.vrvpShowProfile);
  const [colorUpVol,    setColorUpVol]    = useState(config.vrvpColorUpVol    ?? DEFAULT_CONFIG.vrvpColorUpVol);
  const [colorDnVol,    setColorDnVol]    = useState(config.vrvpColorDnVol    ?? DEFAULT_CONFIG.vrvpColorDnVol);
  const [colorUpVolVA,  setColorUpVolVA]  = useState(config.vrvpColorUpVolVA  ?? DEFAULT_CONFIG.vrvpColorUpVolVA);
  const [colorDnVolVA,  setColorDnVolVA]  = useState(config.vrvpColorDnVolVA  ?? DEFAULT_CONFIG.vrvpColorDnVolVA);
  const [placement,     setPlacement]     = useState(config.vrvpPlacement     ?? DEFAULT_CONFIG.vrvpPlacement);
  const [width,         setWidth]         = useState(config.vrvpWidth         ?? DEFAULT_CONFIG.vrvpWidth);
  const [showPOC,       setShowPOC]       = useState(config.vrvpShowPOC       ?? DEFAULT_CONFIG.vrvpShowPOC);
  const [colorPOC,      setColorPOC]      = useState(config.vrvpColorPOC      ?? DEFAULT_CONFIG.vrvpColorPOC);
  const [showVAH,       setShowVAH]       = useState(config.vrvpShowVAH       ?? DEFAULT_CONFIG.vrvpShowVAH);
  const [colorVAH,      setColorVAH]      = useState(config.vrvpColorVAH      ?? DEFAULT_CONFIG.vrvpColorVAH);
  const [showVAL,       setShowVAL]       = useState(config.vrvpShowVAL       ?? DEFAULT_CONFIG.vrvpShowVAL);
  const [colorVAL,      setColorVAL]      = useState(config.vrvpColorVAL      ?? DEFAULT_CONFIG.vrvpColorVAL);
  const [showLabels]    = useState(config.vrvpShowLabels    ?? DEFAULT_CONFIG.vrvpShowLabels);
  const [showStatusValues] = useState(config.vrvpShowStatusValues ?? DEFAULT_CONFIG.vrvpShowStatusValues);
  const [showStatusInputs] = useState(config.vrvpShowStatusInputs ?? DEFAULT_CONFIG.vrvpShowStatusInputs);

  function save() {
    onSave({
      vrvpRowLayout: rowLayout,
      vrvpRowSize: clamp(rowSize, 5, 1000),
      vrvpVolume: volume,
      vrvpValueAreaVolume: clamp(valueAreaVolume, 0, 100),
      vrvpShowProfile: showProfile,
      vrvpShowValues: false,
      vrvpWidth: clamp(width, 5, 100),
      vrvpPlacement: placement,
      vrvpColorUpVol: colorUpVol,
      vrvpColorDnVol: colorDnVol,
      vrvpColorUpVolVA: colorUpVolVA,
      vrvpColorDnVolVA: colorDnVolVA,
      vrvpShowVAH: showVAH,
      vrvpShowVAL: showVAL,
      vrvpShowPOC: showPOC,
      vrvpColorPOC: colorPOC,
      vrvpColorVAH: colorVAH,
      vrvpColorVAL: colorVAL,
      vrvpShowLabels: showLabels,
      vrvpShowStatusValues: showStatusValues,
      vrvpShowStatusInputs: showStatusInputs,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Tabs active={tab} onChange={setTab} />

      {tab === "inputs" && (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">Diseño de las filas</span>
            <select value={rowLayout} onChange={(e) => setRowLayout(e.target.value as "rows" | "ticks")}
              className="bg-tv-bg text-xs border border-tv-border rounded-md px-2 py-1.5 focus:outline-none focus:border-tv-blue text-tv-text">
              <option value="rows">Tamaño de filas</option>
              <option value="ticks">Ticks por fila</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">Tamaño de la fila</span>
            <Input type="number" min={5} max={1000} value={rowSize}
              onChange={(e) => { const n = parseInt(e.target.value, 10); if (!isNaN(n)) setRowSize(n); }}
              className="bg-tv-bg tabular-nums text-xs" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">Volumen</span>
            <select value={volume} onChange={(e) => setVolume(e.target.value as "total" | "updown")}
              className="bg-tv-bg text-xs border border-tv-border rounded-md px-2 py-1.5 focus:outline-none focus:border-tv-blue text-tv-text">
              <option value="total">Total</option>
              <option value="updown">Arriba / Abajo</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">Volumen del área de valor (%)</span>
            <Input type="number" min={0} max={100} value={valueAreaVolume}
              onChange={(e) => { const n = parseInt(e.target.value, 10); if (!isNaN(n)) setValueAreaVolume(n); }}
              className="bg-tv-bg tabular-nums text-xs" />
          </label>
        </div>
      )}

      {tab === "style" && (
        <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto pr-1">
          <div className="border-b border-tv-border pb-2 mb-1">
            <SectionLabel>Perfil de Volumen</SectionLabel>
            <ColorRow label="Volumen Ascendente" checked={showProfile} onCheckedChange={setShowProfile} color={colorUpVol}   onColorChange={setColorUpVol}   defaultAlpha="44" />
            <ColorRow label="Volumen Descendente" checked={showProfile} onCheckedChange={setShowProfile} color={colorDnVol}   onColorChange={setColorDnVol}   defaultAlpha="44" />
            <ColorRow label="VA Ascendente"       checked={showProfile} onCheckedChange={setShowProfile} color={colorUpVolVA} onColorChange={setColorUpVolVA} defaultAlpha="bb" />
            <ColorRow label="VA Descendente"      checked={showProfile} onCheckedChange={setShowProfile} color={colorDnVolVA} onColorChange={setColorDnVolVA} defaultAlpha="bb" />
            <div className="grid grid-cols-2 gap-2 mt-2 pt-1">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">Ubicación</span>
                <select value={placement} onChange={(e) => setPlacement(e.target.value as "Left" | "Right")}
                  className="bg-tv-bg text-xs border border-tv-border rounded-md px-2 py-1.5 focus:outline-none focus:border-tv-blue text-tv-text">
                  <option value="Left">Izquierda</option>
                  <option value="Right">Derecha</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">Ancho (%)</span>
                <Input type="number" min={5} max={100} value={width}
                  onChange={(e) => { const n = parseInt(e.target.value, 10); if (!isNaN(n)) setWidth(n); }}
                  className="bg-tv-bg tabular-nums text-xs h-8" />
              </label>
            </div>
          </div>
          <div>
            <SectionLabel>Líneas del Perfil</SectionLabel>
            <ColorRow label="Punto de Control (POC)" checked={showPOC} onCheckedChange={setShowPOC} color={colorPOC} onColorChange={setColorPOC} defaultAlpha="" />
            <ColorRow label="Value Area High (VAH)"  checked={showVAH} onCheckedChange={setShowVAH} color={colorVAH} onColorChange={setColorVAH} defaultAlpha="" />
            <ColorRow label="Value Area Low (VAL)"   checked={showVAL} onCheckedChange={setShowVAL} color={colorVAL} onColorChange={setColorVAL} defaultAlpha="" />
          </div>
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
