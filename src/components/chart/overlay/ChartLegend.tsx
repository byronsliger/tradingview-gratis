"use client";

import React from "react";
import { INDICATOR_COLORS, useChartStore, type IndicatorConfig, type IndicatorKey } from "@/lib/store/chart-store";
import { IndicatorPill } from "@/components/chart/IndicatorPill";
import { formatPrice, formatVolume } from "@/lib/format";

interface LastValues {
  ema20?: number;
  ema50?: number;
  ema200?: number;
  volume?: number;
}

interface Props {
  indicators: Record<IndicatorKey, boolean>;
  hidden: Record<IndicatorKey, boolean>;
  config: IndicatorConfig;
  lastValues: LastValues;
  top: number;
  left: number;
}

function LegendToggleButton({ collapsed, count, onClick }: { collapsed: boolean; count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Leyenda de los indicadores"
      className="pointer-events-auto group flex h-5 items-center gap-1 rounded border border-transparent px-1.5 text-[10px] text-[#787b86] transition-all hover:border-[#2a2e39] hover:bg-[#1e222d] hover:text-[#d1d4dc] cursor-pointer"
      style={{ position: "relative", zIndex: 30 }}
    >
      <span className="leading-none">{collapsed ? "▼" : "▲"}</span>
      {collapsed && <span className="leading-none tabular-nums">{count}</span>}
      <span className="hidden leading-none group-hover:inline">
        {collapsed ? "Mostrar indicadores" : "Leyenda de los indicadores"}
      </span>
    </button>
  );
}

export const ChartLegend = React.memo(function ChartLegend({ indicators, hidden, config, lastValues, top, left }: Props) {
  const collapsed = useChartStore((s) => s.legendCollapsed);
  const toggleLegendCollapsed = useChartStore((s) => s.toggleLegendCollapsed);
  const toggleHidden = useChartStore((s) => s.toggleHidden);
  const setSettingsTarget = useChartStore((s) => s.setSettingsTarget);
  const removeIndicator = useChartStore((s) => s.removeIndicator);

  const mainCount = [indicators.ema20, indicators.ema50, indicators.ema200, indicators.volume, indicators.vrvp].filter(Boolean).length;
  if (mainCount === 0) return null;

  return (
    <div style={{ top, left: left - 5 }} className="absolute z-30 flex flex-col items-start gap-1">
      <LegendToggleButton collapsed={collapsed} count={mainCount} onClick={toggleLegendCollapsed} />
      {!collapsed && (
        <div className="ml-1.5 flex flex-col items-start gap-1">
          {indicators.ema20 && (
            <IndicatorPill
              name={`EMA ${config.ema20}`}
              value={lastValues.ema20 !== undefined ? formatPrice(lastValues.ema20) : undefined}
              color={INDICATOR_COLORS.ema20}
              hidden={hidden.ema20}
              onToggleHide={() => toggleHidden("ema20")}
              onSettings={() => setSettingsTarget("ema20")}
              onRemove={() => removeIndicator("ema20")}
            />
          )}
          {indicators.ema50 && (
            <IndicatorPill
              name={`EMA ${config.ema50}`}
              value={lastValues.ema50 !== undefined ? formatPrice(lastValues.ema50) : undefined}
              color={INDICATOR_COLORS.ema50}
              hidden={hidden.ema50}
              onToggleHide={() => toggleHidden("ema50")}
              onSettings={() => setSettingsTarget("ema50")}
              onRemove={() => removeIndicator("ema50")}
            />
          )}
          {indicators.ema200 && (
            <IndicatorPill
              name={`EMA ${config.ema200}`}
              value={lastValues.ema200 !== undefined ? formatPrice(lastValues.ema200) : undefined}
              color={INDICATOR_COLORS.ema200}
              hidden={hidden.ema200}
              onToggleHide={() => toggleHidden("ema200")}
              onSettings={() => setSettingsTarget("ema200")}
              onRemove={() => removeIndicator("ema200")}
            />
          )}
          {indicators.volume && (
            <IndicatorPill
              name="Vol"
              value={lastValues.volume !== undefined ? formatVolume(lastValues.volume) : undefined}
              color={INDICATOR_COLORS.volume}
              hidden={hidden.volume}
              onToggleHide={() => toggleHidden("volume")}
              onSettings={() => setSettingsTarget("volume")}
              onRemove={() => removeIndicator("volume")}
            />
          )}
          {indicators.vrvp && (
            <IndicatorPill
              name="VRVP"
              value={undefined}
              color={INDICATOR_COLORS.vrvp}
              hidden={hidden.vrvp}
              onToggleHide={() => toggleHidden("vrvp")}
              onSettings={() => setSettingsTarget("vrvp")}
              onRemove={() => removeIndicator("vrvp")}
            />
          )}
        </div>
      )}
    </div>
  );
});
