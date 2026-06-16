"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useChartStore, DEFAULT_CONFIG, type IndicatorKey } from "@/lib/store/chart-store";
import { EMASettings }  from "./indicator-settings/EMASettings";
import { SQZSettings }  from "./indicator-settings/SQZSettings";
import { ADXSettings }  from "./indicator-settings/ADXSettings";
import { VRVPSettings } from "./indicator-settings/VRVPSettings";
import { RSISettings, MACDSettings, VolumeSettings } from "./indicator-settings/SimpleSettings";

const TITLES: Record<IndicatorKey, string> = {
  ema20:  "EMA — Slot 1",
  ema50:  "EMA — Slot 2",
  ema200: "EMA — Slot 3",
  rsi:    "RSI",
  macd:   "MACD",
  volume: "Volumen",
  sqzmom: "Squeeze Momentum [LazyBear]",
  adx:    "DMI / ADX / KEYLEVEL",
  vrvp:   "Perfil de Volumen Visible (VRVP)",
};

export function IndicatorSettingsDialog() {
  const target    = useChartStore((s) => s.settingsTarget);
  const setTarget = useChartStore((s) => s.setSettingsTarget);
  const config    = useChartStore((s) => s.config);
  const setConfig = useChartStore((s) => s.setConfig);

  // Los targets `script:<id>` se enrutan al ScriptSettingsDialog (montado aparte).
  const isScript = typeof target === "string" && target.startsWith("script:");
  const indicatorTarget = !isScript ? (target as IndicatorKey | null) : null;
  const open = indicatorTarget !== null;

  function handleSave(patch: Parameters<typeof setConfig>[0]) {
    setConfig(patch);
    setTarget(null);
  }

  function handleReset() {
    setConfig(DEFAULT_CONFIG);
    setTarget(null);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setTarget(null); }}>
      <DialogContent className="max-w-none sm:max-w-sm bg-tv-panel">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            {indicatorTarget ? TITLES[indicatorTarget] : ""} — Configuración
          </DialogTitle>
        </DialogHeader>

        {indicatorTarget === "ema20"  && <EMASettings  target="ema20"  config={config} onSave={handleSave} onReset={handleReset} />}
        {indicatorTarget === "ema50"  && <EMASettings  target="ema50"  config={config} onSave={handleSave} onReset={handleReset} />}
        {indicatorTarget === "ema200" && <EMASettings  target="ema200" config={config} onSave={handleSave} onReset={handleReset} />}
        {indicatorTarget === "rsi"    && <RSISettings               config={config} onSave={handleSave} onReset={handleReset} />}
        {indicatorTarget === "macd"   && <MACDSettings              config={config} onSave={handleSave} onReset={handleReset} />}
        {indicatorTarget === "volume" && <VolumeSettings                            onSave={handleSave} onReset={handleReset} />}
        {indicatorTarget === "sqzmom" && <SQZSettings               config={config} onSave={handleSave} onReset={handleReset} />}
        {indicatorTarget === "adx"    && <ADXSettings               config={config} onSave={handleSave} onReset={handleReset} />}
        {indicatorTarget === "vrvp"   && <VRVPSettings              config={config} onSave={handleSave} onReset={handleReset} />}
      </DialogContent>
    </Dialog>
  );
}
