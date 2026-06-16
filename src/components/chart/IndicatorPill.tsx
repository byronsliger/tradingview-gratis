"use client";

import { AlertTriangle, Eye, EyeOff, Pencil, Settings, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  name: string;
  value?: string;
  color: string;
  hidden: boolean;
  selected?: boolean;
  /** Mensaje de error del script (muestra un icono rojo con tooltip) */
  error?: string;
  onToggleHide: () => void;
  onSettings: () => void;
  onRemove: () => void;
  /** Si se pasa, muestra un botón de editar (lápiz) — usado por los scripts Pine */
  onEdit?: () => void;
}

export function IndicatorPill({
  name,
  value,
  color,
  hidden,
  selected,
  error,
  onToggleHide,
  onSettings,
  onRemove,
  onEdit,
}: Props) {
  return (
    <div
      onDoubleClick={onSettings}
      className={cn(
        "group/pill pointer-events-auto flex cursor-pointer items-center gap-1 rounded px-1 py-px text-[11px] transition-colors bg-tv-panel/50 hover:bg-tv-panel/80",
        selected && "outline outline-1 outline-tv-blue/60",
        hidden && "opacity-40",
      )}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: color }}
      />
      <span className="font-medium text-tv-text">{name}</span>
      {error ? (
        <AlertTriangle className="h-3 w-3 shrink-0 text-tv-red" aria-label="Error" />
      ) : (
        value !== undefined && (
          <span className="tabular-nums text-tv-text-muted">{value}</span>
        )
      )}
      <div className="ml-0.5 flex items-center gap-0.5 md:hidden md:group-hover/pill:flex">
        <button
          onClick={(e) => { e.stopPropagation(); onToggleHide(); }}
          title={hidden ? "Mostrar" : "Ocultar"}
          aria-label={hidden ? "Mostrar" : "Ocultar"}
          className="rounded p-0.5 text-tv-text-dim transition-colors hover:text-tv-text"
        >
          {hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        </button>
        {onEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            title="Editar código"
            aria-label="Editar código"
            className="rounded p-0.5 text-tv-text-dim transition-colors hover:text-tv-text"
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onSettings(); }}
          title="Configurar"
          aria-label="Configurar"
          className="rounded p-0.5 text-tv-text-dim transition-colors hover:text-tv-text"
        >
          <Settings className="h-3 w-3" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          title="Eliminar"
          aria-label="Eliminar"
          className="rounded p-0.5 text-tv-text-dim transition-colors hover:text-tv-red"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
