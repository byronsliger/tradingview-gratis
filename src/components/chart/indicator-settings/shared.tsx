"use client";

import { Input } from "@/components/ui/input";

export const LINE_STYLES = [
  { value: 0, label: "Sólida",      dasharray: "none" },
  { value: 2, label: "Discontinua", dasharray: "4,3" },
  { value: 1, label: "Punteada",    dasharray: "2,2" },
  { value: 3, label: "Guión largo", dasharray: "8,3" },
] as const;

export function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 font-medium border-b-2 -mb-px transition-colors text-xs ${
        active ? "border-tv-blue text-tv-text" : "border-transparent text-tv-text-muted hover:text-tv-text"
      }`}
    >
      {label}
    </button>
  );
}

export function Tabs({ active, onChange }: { active: "inputs" | "style"; onChange: (t: "inputs" | "style") => void }) {
  return (
    <div className="flex border-b border-tv-border -mx-6 px-6 pb-2 mb-2 text-xs">
      <TabBtn label="Valores" active={active === "inputs"} onClick={() => onChange("inputs")} />
      <TabBtn label="Estilo"  active={active === "style"}  onClick={() => onChange("style")} />
    </div>
  );
}

export function Field({ label, value, onChange, min = 2, max = 500 }: {
  label: string; value: number; onChange: (n: number) => void; min?: number; max?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">{label}</span>
      <Input
        type="number" min={min} max={max} value={value}
        onChange={(e) => { const n = parseInt(e.target.value, 10); if (!isNaN(n)) onChange(n); }}
        className="bg-tv-bg tabular-nums"
      />
    </label>
  );
}

export function FieldFloat({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">{label}</span>
      <Input
        type="number" min={0.1} max={10} step={0.1} value={value}
        onChange={(e) => { const n = parseFloat(e.target.value); if (!isNaN(n)) onChange(n); }}
        className="bg-tv-bg tabular-nums"
      />
    </label>
  );
}

export function SimpleColorRow({ label, color, onColorChange }: {
  label: string; color: string; onColorChange: (c: string) => void;
}) {
  const hex6 = color ? color.slice(0, 7) : "#ffffff";
  return (
    <div className="flex items-center justify-between py-1 text-xs">
      <span className="text-tv-text font-medium">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="color" value={hex6}
          onChange={(e) => {
            const alpha = color && color.length === 9 ? color.slice(7, 9) : "";
            onColorChange(e.target.value + alpha);
          }}
          className="w-6 h-5 rounded cursor-pointer border border-tv-border bg-transparent p-0"
        />
        <input
          type="text" value={color || ""}
          onChange={(e) => onColorChange(e.target.value)}
          className="w-20 bg-tv-bg text-[10px] border border-tv-border rounded px-1.5 py-0.5 font-mono text-tv-text focus:outline-none focus:border-tv-blue"
        />
      </div>
    </div>
  );
}

export function ColorRow({ label, checked, onCheckedChange, color, onColorChange, defaultAlpha = "" }: {
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
          <input
            type="checkbox" checked={checked}
            onChange={(e) => onCheckedChange(e.target.checked)}
            className="w-3.5 h-3.5 accent-tv-blue border border-tv-border bg-tv-bg focus:ring-0 cursor-pointer rounded"
          />
        )}
        <span className={checked === false ? "text-tv-text-dim" : "text-tv-text font-medium"}>{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="color" value={hex6} disabled={checked === false}
          onChange={(e) => {
            const alpha = color && color.length === 9 ? color.slice(7, 9) : defaultAlpha;
            onColorChange(e.target.value + alpha);
          }}
          className="w-6 h-5 rounded cursor-pointer border border-tv-border bg-transparent p-0 disabled:opacity-40 disabled:cursor-not-allowed"
        />
        <input
          type="text" value={color || ""} disabled={checked === false}
          onChange={(e) => onColorChange(e.target.value)}
          className="w-20 bg-tv-bg text-[10px] border border-tv-border rounded px-1.5 py-0.5 font-mono text-tv-text disabled:opacity-40 focus:outline-none focus:border-tv-blue"
        />
      </div>
    </div>
  );
}

export function LineStylePicker({ value, color, onChange }: {
  value: number; color: string; onChange: (v: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {LINE_STYLES.map((s) => (
        <button
          key={s.value} title={s.label}
          onClick={() => onChange(s.value)}
          className={`flex h-6 w-8 items-center justify-center rounded border transition-colors ${
            value === s.value ? "border-tv-blue bg-tv-blue/10" : "border-tv-border hover:border-tv-text-muted"
          }`}
        >
          <svg width="20" height="8" viewBox="0 0 20 8">
            <line x1="0" y1="4" x2="20" y2="4"
              stroke={value === s.value ? color : "#787b86"}
              strokeWidth="1.5"
              strokeDasharray={s.dasharray === "none" ? undefined : s.dasharray}
            />
          </svg>
        </button>
      ))}
    </div>
  );
}

export function WidthPicker({ value, onChange }: { value: 1 | 2 | 3 | 4; onChange: (w: 1 | 2 | 3 | 4) => void }) {
  return (
    <div className="flex gap-1">
      {([1, 2, 3, 4] as const).map((w) => (
        <button
          key={w} onClick={() => onChange(w)}
          className={`flex h-6 w-8 items-center justify-center rounded border transition-colors text-[10px] tabular-nums ${
            value === w ? "border-tv-blue bg-tv-blue/10 text-tv-blue" : "border-tv-border text-tv-text-muted hover:border-tv-text-muted"
          }`}
        >{w}</button>
      ))}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted mb-1">
      {children}
    </h4>
  );
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function AxisLabelToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-1">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 cursor-pointer rounded border border-tv-border bg-tv-bg accent-tv-blue"
      />
      <span className="text-xs text-tv-text">Etiqueta en eje de precio</span>
    </label>
  );
}
