"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useChartStore } from "@/lib/store/chart-store";
import { compile, type Diagnostic } from "@/lib/pine";

const PLACEHOLDER = `//@version=5
indicator("Mi EMA", overlay=true)
plot(ta.ema(close, 21), color=color.orange)`;

/**
 * Dialog provisional (Fase 2) para pegar un script Pine.
 * Será reemplazado por el editor CodeMirror en la Fase 3.
 */
export function AddScriptDialog() {
  const open = useChartStore((s) => s.addScriptDialogOpen);
  const setOpen = useChartStore((s) => s.setAddScriptDialogOpen);
  const addScript = useChartStore((s) => s.addScript);

  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) setDiagnostics([]);
  }

  function handleAdd() {
    if (source.trim().length === 0) {
      setDiagnostics([
        { severity: "error", message: "El script está vacío", line: 1, col: 1, start: 0, end: 0 },
      ]);
      return;
    }
    const result = compile(source);
    if (!result.ok) {
      setDiagnostics(result.diagnostics);
      return;
    }
    const finalName = name.trim() || result.script.meta.title || "Script sin título";
    addScript(finalName, source);
    setName("");
    setSource("");
    setDiagnostics([]);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-none bg-tv-panel sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Nuevo script Pine</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="pine-script-name" className="text-xs text-tv-text-muted">
              Nombre
            </label>
            <input
              id="pine-script-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Se usa el título de indicator() si lo dejas vacío"
              className="rounded border border-tv-border bg-tv-bg px-2 py-1.5 text-xs text-tv-text outline-none placeholder:text-tv-text-muted focus:border-tv-blue"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="pine-script-source" className="text-xs text-tv-text-muted">
              Código Pine Script
            </label>
            <textarea
              id="pine-script-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              rows={14}
              spellCheck={false}
              placeholder={PLACEHOLDER}
              className="resize-y rounded border border-tv-border bg-tv-bg px-2 py-1.5 font-mono text-xs leading-relaxed text-tv-text outline-none placeholder:text-tv-text-muted focus:border-tv-blue"
            />
          </div>

          {diagnostics.length > 0 && (
            <div className="max-h-28 overflow-y-auto rounded border border-tv-red/40 bg-tv-red/10 px-2 py-1.5">
              {diagnostics.map((d, i) => (
                <p key={i} className="font-mono text-[11px] leading-relaxed text-tv-red">
                  {d.line}:{d.col} {d.message}
                </p>
              ))}
            </div>
          )}

          <div className="mt-1 flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleOpenChange(false)}
              className="text-tv-text-muted hover:text-tv-text"
            >
              Cancelar
            </Button>
            <Button size="sm" onClick={handleAdd} className="bg-tv-blue hover:bg-tv-blue/90">
              Añadir al chart
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
