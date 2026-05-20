"use client";

import React, { useState } from "react";
import { INDICATOR_COLORS, useChartStore, type IndicatorConfig, type IndicatorKey } from "@/lib/store/chart-store";
import { IndicatorPill } from "@/components/chart/IndicatorPill";

interface PaneOffset {
  top: number;
  height: number;
}

interface LastValues {
  rsi?: number;
  macd?: number;
  macdSignal?: number;
  sqzmom?: number;
  adx?: number;
}

interface Props {
  indicators: Record<IndicatorKey, boolean>;
  hidden: Record<IndicatorKey, boolean>;
  config: IndicatorConfig;
  lastValues: LastValues;
  paneOffsets: PaneOffset[];
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

export const SubPaneLegend = React.memo(function SubPaneLegend({ indicators, hidden, config, lastValues, paneOffsets, left }: Props) {
  const [collapsed, setCollapsed] = useState(true);
  const toggleHidden = useChartStore((s) => s.toggleHidden);
  const setSettingsTarget = useChartStore((s) => s.setSettingsTarget);
  const removeIndicator = useChartStore((s) => s.removeIndicator);

  const subCount = [indicators.rsi, indicators.macd, indicators.sqzmom, indicators.adx].filter(Boolean).length;
  if (subCount === 0) return null;

  const rsiPaneIdx = 1;
  const macdPaneIdx = indicators.rsi ? 2 : 1;
  const sqzmomAdxPaneIdx = (indicators.rsi ? 1 : 0) + (indicators.macd ? 1 : 0) + 1;

  const firstPane = indicators.rsi
    ? paneOffsets[rsiPaneIdx]
    : indicators.macd
      ? paneOffsets[macdPaneIdx]
      : paneOffsets[sqzmomAdxPaneIdx];

  if (!firstPane) return null;

  return (
    <>
      {/* Toggle button anchored to first visible sub-pane */}
      <div style={{ top: firstPane.top + 8, left: left - 10 }} className="absolute z-30">
        <LegendToggleButton collapsed={collapsed} count={subCount} onClick={() => setCollapsed((v) => !v)} />
      </div>

      {!collapsed && (
        <>
          {indicators.rsi && paneOffsets[rsiPaneIdx] && (
            <div
              style={{ top: paneOffsets[rsiPaneIdx].top + 32, left }}
              className="pointer-events-none absolute z-10"
            >
              <IndicatorPill
                name={`RSI ${config.rsi}`}
                value={lastValues.rsi !== undefined ? lastValues.rsi.toFixed(2) : undefined}
                color={INDICATOR_COLORS.rsi}
                hidden={hidden.rsi}
                onToggleHide={() => toggleHidden("rsi")}
                onSettings={() => setSettingsTarget("rsi")}
                onRemove={() => removeIndicator("rsi")}
              />
            </div>
          )}

          {indicators.macd && paneOffsets[macdPaneIdx] && (
            <div
              style={{ top: paneOffsets[macdPaneIdx].top + 32, left }}
              className="pointer-events-none absolute z-10"
            >
              <IndicatorPill
                name={`MACD ${config.macdFast}, ${config.macdSlow}, ${config.macdSignal}`}
                value={
                  lastValues.macd !== undefined
                    ? `${lastValues.macd.toFixed(2)} / ${(lastValues.macdSignal ?? 0).toFixed(2)}`
                    : undefined
                }
                color={INDICATOR_COLORS.macd}
                hidden={hidden.macd}
                onToggleHide={() => toggleHidden("macd")}
                onSettings={() => setSettingsTarget("macd")}
                onRemove={() => removeIndicator("macd")}
              />
            </div>
          )}

          {indicators.sqzmom && paneOffsets[sqzmomAdxPaneIdx] && (
            <div
              style={{ top: paneOffsets[sqzmomAdxPaneIdx].top + 32, left }}
              className="pointer-events-none absolute z-10"
            >
              <IndicatorPill
                name={`SQZ MOM (${config.sqzmomBBLength}, ${config.sqzmomKCLength})`}
                value={lastValues.sqzmom !== undefined ? lastValues.sqzmom.toFixed(4) : undefined}
                color={INDICATOR_COLORS.sqzmom}
                hidden={hidden.sqzmom}
                onToggleHide={() => toggleHidden("sqzmom")}
                onSettings={() => setSettingsTarget("sqzmom")}
                onRemove={() => removeIndicator("sqzmom")}
              />
            </div>
          )}

          {indicators.adx && paneOffsets[sqzmomAdxPaneIdx] && (
            <div
              style={{ top: paneOffsets[sqzmomAdxPaneIdx].top + (indicators.sqzmom ? 54 : 32), left }}
              className="pointer-events-none absolute z-10"
            >
              <IndicatorPill
                name={`DMI/ADX (${config.adxDiLen}, ${config.adxLen})`}
                value={lastValues.adx !== undefined ? lastValues.adx.toFixed(2) : undefined}
                color={INDICATOR_COLORS.adx}
                hidden={hidden.adx}
                onToggleHide={() => toggleHidden("adx")}
                onSettings={() => setSettingsTarget("adx")}
                onRemove={() => removeIndicator("adx")}
              />
            </div>
          )}
        </>
      )}
    </>
  );
});
