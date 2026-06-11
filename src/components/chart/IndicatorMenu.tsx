"use client";

import { Activity, Check, Plus, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChartStore, type IndicatorKey } from "@/lib/store/chart-store";

interface Entry {
  key: IndicatorKey;
  label: (cfg: {
    ema20: number;
    ema50: number;
    ema200: number;
    rsi: number;
    macdFast: number;
    macdSlow: number;
    macdSignal: number;
    sqzmomBBLength: number;
    sqzmomKCLength: number;
    adxLen: number;
    adxDiLen: number;
  }) => string;
  group: string;
}

export const ENTRIES: Entry[] = [
  { key: "ema20", group: "Medias móviles", label: (c) => `EMA ${c.ema20}` },
  { key: "ema50", group: "Medias móviles", label: (c) => `EMA ${c.ema50}` },
  { key: "ema200", group: "Medias móviles", label: (c) => `EMA ${c.ema200}` },
  { key: "volume", group: "Volumen", label: () => "Volumen" },
  { key: "vrvp", group: "Volumen", label: () => "Vol. Profile Visible Range (VRVP)" },
  { key: "rsi", group: "Osciladores", label: (c) => `RSI (${c.rsi})` },
  {
    key: "macd",
    group: "Osciladores",
    label: (c) => `MACD (${c.macdFast}, ${c.macdSlow}, ${c.macdSignal})`,
  },
  {
    key: "sqzmom",
    group: "Osciladores",
    label: (c) => `Squeeze Mom (${c.sqzmomBBLength}, ${c.sqzmomKCLength})`,
  },
  {
    key: "adx",
    group: "Osciladores",
    label: (c) => `DMI/ADX (${c.adxDiLen}, ${c.adxLen})`,
  },
];

export function IndicatorMenu() {
  const indicators = useChartStore((s) => s.indicators);
  const config = useChartStore((s) => s.config);
  const toggle = useChartStore((s) => s.toggleIndicator);
  const scripts = useChartStore((s) => s.scripts);
  const toggleScriptOnChart = useChartStore((s) => s.toggleScriptOnChart);
  const removeScript = useChartStore((s) => s.removeScript);
  const setAddScriptDialogOpen = useChartStore((s) => s.setAddScriptDialogOpen);

  const groups = ENTRIES.reduce<Record<string, Entry[]>>((acc, i) => {
    (acc[i.group] ||= []).push(i);
    return acc;
  }, {});

  const activeCount =
    Object.values(indicators).filter(Boolean).length +
    scripts.filter((s) => s.onChart).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-tv-text hover:bg-tv-panel-hover">
        <Activity className="h-3.5 w-3.5" />
        <span>Indicadores</span>
        {activeCount > 0 && (
          <span className="ml-1 rounded bg-tv-blue/20 px-1.5 py-0.5 text-[10px] font-semibold text-tv-blue">
            {activeCount}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 bg-tv-panel">
        {Object.entries(groups).map(([group, items], idx) => (
          <DropdownMenuGroup key={group}>
            {idx > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-tv-text-muted">
              {group}
            </DropdownMenuLabel>
            {items.map((i) => (
              <DropdownMenuItem
                key={i.key}
                closeOnClick={false}
                onClick={() => toggle(i.key)}
                className="flex items-center justify-between text-xs"
              >
                <span>{i.label(config)}</span>
                {indicators[i.key] && <Check className="h-3.5 w-3.5 text-tv-blue" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}

        <DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-tv-text-muted">
            Mis scripts
          </DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => setAddScriptDialogOpen(true)}
            className="flex items-center gap-1.5 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Nuevo script Pine…</span>
          </DropdownMenuItem>
          {scripts.map((sc) => (
            <DropdownMenuItem
              key={sc.id}
              closeOnClick={false}
              onClick={() => toggleScriptOnChart(sc.id)}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="truncate">{sc.name}</span>
              <span className="flex shrink-0 items-center gap-1">
                {sc.onChart && <Check className="h-3.5 w-3.5 text-tv-blue" />}
                <button
                  type="button"
                  aria-label={`Eliminar script ${sc.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeScript(sc.id);
                  }}
                  className="rounded p-0.5 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-red"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
