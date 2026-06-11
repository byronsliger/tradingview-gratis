"use client";

import { useRef, useState, type RefObject } from "react";
import { CircleCheck, TriangleAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useChartStore } from "@/lib/store/chart-store";
import { compile } from "@/lib/pine";
import { PineEditor } from "./PineEditor";
import { ScriptList } from "./ScriptList";
import { cn } from "@/lib/utils";

const TEMPLATE = `//@version=5
indicator("Mi indicador", overlay=true)
plot(ta.ema(close, 21), color=color.orange)
`;

interface StatusMessage {
  kind: "ok" | "warn";
  text: string;
}

/**
 * Dialog "Editor Pine": lista lateral de scripts guardados + CodeMirror 6 con
 * highlighting y lint en línea. Se carga con next/dynamic (ssr: false) desde
 * page.tsx — CodeMirror no soporta SSR.
 *
 * El cuerpo se monta keyed por target y solo mientras está abierto, así cada
 * apertura inicializa su estado con useState lazy (sin setState en efectos).
 */
export function PineEditorDialog() {
  const open = useChartStore((s) => s.pineEditorOpen);
  const target = useChartStore((s) => s.pineEditorTarget);
  const setOpen = useChartStore((s) => s.setPineEditorOpen);

  // El body reporta aquí si hay cambios sin guardar (para el confirm al cerrar)
  const dirtyRef = useRef(false);

  function handleOpenChange(v: boolean) {
    if (!v && dirtyRef.current) {
      if (!window.confirm("Tienes cambios sin guardar. ¿Descartarlos?")) return;
    }
    setOpen(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "flex h-[94dvh] max-w-none flex-col gap-0 overflow-hidden bg-tv-panel p-0",
          "sm:h-[90vh] sm:w-[90vw] sm:max-w-none sm:rounded-xl sm:pb-0",
        )}
      >
        {open && (
          <PineEditorBody
            key={target ?? "__nuevo__"}
            initialTarget={target}
            dirtyRef={dirtyRef}
            onRequestClose={() => handleOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface PineEditorBodyProps {
  initialTarget: string | null;
  dirtyRef: RefObject<boolean>;
  onRequestClose: () => void;
}

function PineEditorBody({ initialTarget, dirtyRef, onRequestClose }: PineEditorBodyProps) {
  const scripts = useChartStore((s) => s.scripts);
  const theme = useChartStore((s) => s.theme);
  const addScript = useChartStore((s) => s.addScript);
  const updateScript = useChartStore((s) => s.updateScript);
  const removeScript = useChartStore((s) => s.removeScript);

  /** id del script cargado en el editor (null = borrador nuevo) */
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const sc = useChartStore.getState().scripts.find((s) => s.id === initialTarget);
    return sc?.id ?? null;
  });
  const [name, setName] = useState(() => {
    const sc = useChartStore.getState().scripts.find((s) => s.id === initialTarget);
    return sc?.name ?? "";
  });
  const [source, setSource] = useState(() => {
    const sc = useChartStore.getState().scripts.find((s) => s.id === initialTarget);
    return sc?.source ?? TEMPLATE;
  });
  const [baseline, setBaseline] = useState(() => ({ name, source }));
  const [status, setStatus] = useState<StatusMessage | null>(null);

  const dirty = name !== baseline.name || source !== baseline.source;
  // eslint-disable-next-line react-hooks/refs
  dirtyRef.current = dirty;

  const selectedScript = scripts.find((sc) => sc.id === selectedId) ?? null;

  function confirmDiscard(): boolean {
    return !dirty || window.confirm("Tienes cambios sin guardar. ¿Descartarlos?");
  }

  function loadScript(id: string | null) {
    const sc = id
      ? useChartStore.getState().scripts.find((s) => s.id === id) ?? null
      : null;
    setSelectedId(sc?.id ?? null);
    setName(sc?.name ?? "");
    setSource(sc?.source ?? TEMPLATE);
    setBaseline({ name: sc?.name ?? "", source: sc?.source ?? TEMPLATE });
    setStatus(null);
  }

  function handleSelect(id: string) {
    if (id === selectedId || !confirmDiscard()) return;
    loadScript(id);
  }

  function handleCreate() {
    if (!confirmDiscard()) return;
    loadScript(null);
  }

  function handleRename(id: string, newName: string) {
    updateScript(id, { name: newName });
    if (id === selectedId) {
      setName(newName);
      setBaseline((b) => ({ ...b, name: newName }));
    }
  }

  function handleDuplicate(id: string) {
    const sc = useChartStore.getState().scripts.find((s) => s.id === id);
    if (!sc) return;
    const newId = addScript(`${sc.name} (copia)`, sc.source, { onChart: false });
    if (confirmDiscard()) loadScript(newId);
  }

  function handleDelete(id: string) {
    const sc = useChartStore.getState().scripts.find((s) => s.id === id);
    if (!sc) return;
    if (!window.confirm(`¿Eliminar "${sc.name}"? Esta acción no se puede deshacer.`)) return;
    removeScript(id);
    if (id === selectedId) loadScript(null);
  }

  function handleSourceChange(v: string) {
    setSource(v);
    setStatus(null);
  }

  function handleSave(addToChart: boolean) {
    const result = compile(source);
    const fallbackTitle = result.ok ? result.script.meta.title : "";
    const finalName = name.trim() || fallbackTitle || "Script sin título";
    const allowChart = addToChart && result.ok;

    let id = selectedId;
    if (id === null) {
      id = addScript(finalName, source, { onChart: allowChart });
      setSelectedId(id);
    } else {
      updateScript(id, {
        name: finalName,
        source,
        ...(allowChart ? { onChart: true, hidden: false } : {}),
      });
    }
    setName(finalName);
    setBaseline({ name: finalName, source });

    if (addToChart && !result.ok) {
      const n = result.diagnostics.length;
      setStatus({
        kind: "warn",
        text: `Guardado, pero no añadido al chart: el script tiene ${n} ${n === 1 ? "error" : "errores"} de compilación.`,
      });
    } else {
      setStatus({
        kind: "ok",
        text: allowChart ? "Guardado y añadido al chart." : "Guardado.",
      });
    }
  }

  return (
    <>
      <DialogHeader className="shrink-0 border-b border-tv-border px-4 py-3">
        <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
          Editor Pine
          {dirty && (
            <span
              title="Cambios sin guardar"
              className="h-1.5 w-1.5 rounded-full bg-tv-yellow"
            />
          )}
        </DialogTitle>
      </DialogHeader>

      <div className="flex min-h-0 flex-1">
        <ScriptList
          scripts={scripts}
          selectedId={selectedId}
          onSelect={handleSelect}
          onCreate={handleCreate}
          onRename={handleRename}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
        />

        <div className="flex min-w-0 flex-1 flex-col bg-tv-bg">
          <div className="flex shrink-0 items-center gap-2 border-b border-tv-border bg-tv-panel px-3 py-2">
            <label
              htmlFor="pine-editor-name"
              className="shrink-0 text-xs text-tv-text-muted"
            >
              Nombre
            </label>
            <input
              id="pine-editor-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Se usa el título de indicator() si lo dejas vacío"
              className="w-full min-w-0 max-w-sm rounded border border-tv-border bg-tv-bg px-2 py-1 text-xs text-tv-text outline-none placeholder:text-tv-text-muted focus:border-tv-blue"
            />
            {selectedScript?.onChart && (
              <span className="ml-auto hidden shrink-0 items-center gap-1.5 rounded bg-tv-blue/15 px-2 py-0.5 text-[10px] font-semibold text-tv-blue sm:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-tv-blue" />
                En el chart
              </span>
            )}
          </div>

          <PineEditor
            value={source}
            onChange={handleSourceChange}
            theme={theme}
            className="min-h-0 flex-1"
          />

          <div className="flex shrink-0 flex-col gap-2 border-t border-tv-border bg-tv-panel px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-[11px] leading-snug">
              {status && (
                <span
                  className={cn(
                    "flex items-center gap-1.5",
                    status.kind === "ok" ? "text-tv-green" : "text-tv-yellow",
                  )}
                >
                  {status.kind === "ok" ? (
                    <CircleCheck className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="min-w-0">{status.text}</span>
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onRequestClose}
                className="text-tv-text-muted hover:text-tv-text"
              >
                Cerrar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSave(false)}
                className="border-tv-border text-tv-text hover:bg-tv-panel-hover"
              >
                Guardar
              </Button>
              <Button
                size="sm"
                onClick={() => handleSave(true)}
                className="bg-tv-blue text-white hover:bg-tv-blue/90"
              >
                Guardar y añadir al chart
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
