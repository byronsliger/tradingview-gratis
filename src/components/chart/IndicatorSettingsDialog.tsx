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

  const open = target !== null;

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
            {target ? TITLES[target] : ""} — Configuración
          </DialogTitle>
        </DialogHeader>

        {target === "ema20"  && <EMASettings  target="ema20"  config={config} onSave={handleSave} onReset={handleReset} />}
        {target === "ema50"  && <EMASettings  target="ema50"  config={config} onSave={handleSave} onReset={handleReset} />}
        {target === "ema200" && <EMASettings  target="ema200" config={config} onSave={handleSave} onReset={handleReset} />}
        {target === "rsi"    && <RSISettings               config={config} onSave={handleSave} onReset={handleReset} />}
        {target === "macd"   && <MACDSettings              config={config} onSave={handleSave} onReset={handleReset} />}
        {target === "volume" && <VolumeSettings                            onSave={handleSave} onReset={handleReset} />}
        {target === "sqzmom" && <SQZSettings               config={config} onSave={handleSave} onReset={handleReset} />}
        {target === "adx"    && <ADXSettings               config={config} onSave={handleSave} onReset={handleReset} />}
        {target === "vrvp"   && <VRVPSettings              config={config} onSave={handleSave} onReset={handleReset} />}
      </DialogContent>
    </Dialog>
  );
}
