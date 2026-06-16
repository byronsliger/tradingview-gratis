"use client";

import React from "react";
import { INDICATOR_COLORS, useChartStore, type IndicatorConfig, type IndicatorKey } from "@/lib/store/chart-store";
import { IndicatorPill } from "@/components/chart/IndicatorPill";
import type { ScriptPill } from "@/hooks/chart/useUserScriptPanes";

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
  selectedIndicatorKey: IndicatorKey | null;
  /** Pills de scripts Pine con overlay=false (cada uno en su sub-pane por paneIndex) */
  scriptPills?: ScriptPill[];
  paneOffsets: PaneOffset[];
  left: number;
}

function LegendToggleButton({ collapsed, count, onClick }: { collapsed: boolean; count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Leyenda de los indicadores"
      className="pointer-events-auto group flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-tv-text-dim transition-colors bg-tv-panel/50 hover:bg-tv-panel/80 hover:text-tv-text cursor-pointer"
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

export const SubPaneLegend = React.memo(function SubPaneLegend({ indicators, hidden, config, lastValues, selectedIndicatorKey, scriptPills, paneOffsets, left }: Props) {
  const collapsed = useChartStore((s) => s.legendCollapsed);
  const toggleLegendCollapsed = useChartStore((s) => s.toggleLegendCollapsed);
  const toggleHidden = useChartStore((s) => s.toggleHidden);
  const setSettingsTarget = useChartStore((s) => s.setSettingsTarget);
  const removeIndicator = useChartStore((s) => s.removeIndicator);
  const toggleScriptHidden = useChartStore((s) => s.toggleScriptHidden);
  const toggleScriptOnChart = useChartStore((s) => s.toggleScriptOnChart);
  const setPineEditorTarget = useChartStore((s) => s.setPineEditorTarget);
  const setPineEditorOpen = useChartStore((s) => s.setPineEditorOpen);

  const subPanePills = scriptPills ?? [];
  const subCount =
    [indicators.rsi, indicators.macd, indicators.sqzmom, indicators.adx].filter(Boolean).length +
    subPanePills.length;
  if (subCount === 0) return null;

  const rsiPaneIdx = 1;
  const macdPaneIdx = indicators.rsi ? 2 : 1;
  const sqzmomAdxPaneIdx = (indicators.rsi ? 1 : 0) + (indicators.macd ? 1 : 0) + 1;

  const indicatorFirstPane = indicators.rsi
    ? paneOffsets[rsiPaneIdx]
    : indicators.macd
      ? paneOffsets[macdPaneIdx]
      : (indicators.sqzmom || indicators.adx)
        ? paneOffsets[sqzmomAdxPaneIdx]
        : undefined;

  // Si no hay indicadores de sub-pane, anclamos el toggle al primer sub-pane con script.
  const scriptFirstPane = subPanePills
    .map((p) => paneOffsets[p.paneIndex])
    .filter((o): o is PaneOffset => !!o)
    .sort((a, b) => a.top - b.top)[0];

  const firstPane = indicatorFirstPane ?? scriptFirstPane;
  if (!firstPane) return null;

  return (
    <>
      {/* Toggle button anchored to first visible sub-pane */}
      <div style={{ top: firstPane.top + 4, left }} className="absolute z-30">
        <LegendToggleButton collapsed={collapsed} count={subCount} onClick={toggleLegendCollapsed} />
      </div>

      {!collapsed && (
        <>
          {indicators.rsi && paneOffsets[rsiPaneIdx] && (
            <div
              style={{ top: paneOffsets[rsiPaneIdx].top + 24, left }}
              className="pointer-events-none absolute z-10"
            >
              <IndicatorPill
                name={`RSI ${config.rsi}`}
                value={lastValues.rsi !== undefined ? lastValues.rsi.toFixed(2) : undefined}
                color={INDICATOR_COLORS.rsi}
                hidden={hidden.rsi}
                selected={selectedIndicatorKey === "rsi"}
                onToggleHide={() => toggleHidden("rsi")}
                onSettings={() => setSettingsTarget("rsi")}
                onRemove={() => removeIndicator("rsi")}
              />
            </div>
          )}

          {indicators.macd && paneOffsets[macdPaneIdx] && (
            <div
              style={{ top: paneOffsets[macdPaneIdx].top + 24, left }}
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
                selected={selectedIndicatorKey === "macd"}
                onToggleHide={() => toggleHidden("macd")}
                onSettings={() => setSettingsTarget("macd")}
                onRemove={() => removeIndicator("macd")}
              />
            </div>
          )}

          {indicators.sqzmom && paneOffsets[sqzmomAdxPaneIdx] && (
            <div
              style={{ top: paneOffsets[sqzmomAdxPaneIdx].top + 24, left }}
              className="pointer-events-none absolute z-10"
            >
              <IndicatorPill
                name={`SQZ MOM (${config.sqzmomBBLength}, ${config.sqzmomKCLength})`}
                value={lastValues.sqzmom !== undefined ? lastValues.sqzmom.toFixed(4) : undefined}
                color={INDICATOR_COLORS.sqzmom}
                hidden={hidden.sqzmom}
                selected={selectedIndicatorKey === "sqzmom"}
                onToggleHide={() => toggleHidden("sqzmom")}
                onSettings={() => setSettingsTarget("sqzmom")}
                onRemove={() => removeIndicator("sqzmom")}
              />
            </div>
          )}

          {indicators.adx && paneOffsets[sqzmomAdxPaneIdx] && (
            <div
              style={{ top: paneOffsets[sqzmomAdxPaneIdx].top + (indicators.sqzmom ? 44 : 24), left }}
              className="pointer-events-none absolute z-10"
            >
              <IndicatorPill
                name={`DMI/ADX (${config.adxDiLen}, ${config.adxLen})`}
                value={lastValues.adx !== undefined ? lastValues.adx.toFixed(2) : undefined}
                color={INDICATOR_COLORS.adx}
                hidden={hidden.adx}
                selected={selectedIndicatorKey === "adx"}
                onToggleHide={() => toggleHidden("adx")}
                onSettings={() => setSettingsTarget("adx")}
                onRemove={() => removeIndicator("adx")}
              />
            </div>
          )}

          {subPanePills.map((pill) =>
            paneOffsets[pill.paneIndex] ? (
              <div
                key={pill.id}
                style={{ top: paneOffsets[pill.paneIndex].top + 24, left }}
                className="pointer-events-none absolute z-10"
              >
                <IndicatorPill
                  name={pill.name}
                  value={pill.value}
                  color={pill.color}
                  hidden={pill.hidden}
                  error={pill.error}
                  onToggleHide={() => toggleScriptHidden(pill.id)}
                  onSettings={() => setSettingsTarget(`script:${pill.id}`)}
                  onRemove={() => toggleScriptOnChart(pill.id)}
                  onEdit={() => { setPineEditorTarget(pill.id); setPineEditorOpen(true); }}
                />
              </div>
            ) : null,
          )}
        </>
      )}
    </>
  );
});
