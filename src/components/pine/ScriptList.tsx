"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, FileCode2, Pencil, Plus, Trash2 } from "lucide-react";
import type { PineScriptRecord } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

interface ScriptListProps {
  scripts: PineScriptRecord[];
  /** id seleccionado en el editor (null = borrador nuevo sin guardar) */
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

/**
 * Lista lateral de scripts guardados del Editor Pine: crear, renombrar
 * (inline), duplicar y eliminar. El punto azul indica que está en el chart.
 */
export function ScriptList({
  scripts,
  selectedId,
  onSelect,
  onCreate,
  onRename,
  onDuplicate,
  onDelete,
}: ScriptListProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (renamingId) renameInputRef.current?.select();
  }, [renamingId]);

  function startRename(sc: PineScriptRecord) {
    setRenamingId(sc.id);
    setRenameValue(sc.name);
  }

  function commitRename() {
    if (renamingId) {
      const name = renameValue.trim();
      if (name.length > 0) onRename(renamingId, name);
    }
    setRenamingId(null);
  }

  return (
    <aside className="flex w-40 shrink-0 flex-col border-r border-tv-border bg-tv-panel sm:w-56">
      <div className="flex items-center justify-between border-b border-tv-border px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
          Mis scripts
        </span>
        <button
          type="button"
          onClick={onCreate}
          aria-label="Nuevo script"
          title="Nuevo script"
          className="flex h-6 w-6 items-center justify-center rounded text-tv-text-muted transition-colors hover:bg-tv-panel-hover hover:text-tv-blue"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {scripts.length === 0 && (
          <p className="px-3 py-4 text-center text-[11px] leading-relaxed text-tv-text-muted">
            Sin scripts guardados.
            <br />
            Crea uno con +
          </p>
        )}

        {scripts.map((sc) => {
          const selected = sc.id === selectedId;
          return (
            <div
              key={sc.id}
              className={cn(
                "group relative mx-1 flex items-center gap-1.5 rounded px-2 py-1.5",
                selected
                  ? "bg-tv-blue/15 text-tv-text"
                  : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
              )}
            >
              {renamingId === sc.id ? (
                <input
                  ref={renameInputRef}
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  className="w-full min-w-0 rounded border border-tv-blue bg-tv-bg px-1 py-0.5 text-xs text-tv-text outline-none"
                />
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onSelect(sc.id)}
                    onDoubleClick={() => startRename(sc)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                    title={sc.name}
                  >
                    <FileCode2
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        selected ? "text-tv-blue" : "text-tv-text-dim",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs">{sc.name}</span>
                    {sc.onChart && (
                      <span
                        title="En el chart"
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-tv-blue"
                      />
                    )}
                  </button>

                  <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                    <button
                      type="button"
                      aria-label={`Renombrar ${sc.name}`}
                      title="Renombrar"
                      onClick={() => startRename(sc)}
                      className="rounded p-0.5 text-tv-text-muted hover:text-tv-text"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Duplicar ${sc.name}`}
                      title="Duplicar"
                      onClick={() => onDuplicate(sc.id)}
                      className="rounded p-0.5 text-tv-text-muted hover:text-tv-text"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Eliminar ${sc.name}`}
                      title="Eliminar"
                      onClick={() => onDelete(sc.id)}
                      className="rounded p-0.5 text-tv-text-muted hover:text-tv-red"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
