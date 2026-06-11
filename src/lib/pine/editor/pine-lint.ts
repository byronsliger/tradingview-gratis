import { linter, type Diagnostic as CMDiagnostic, type LintSource } from "@codemirror/lint";
import type { Extension } from "@codemirror/state";
import { compile } from "@/lib/pine";

/**
 * Linter de CodeMirror que compila el fuente con el motor Pine y mapea los
 * `Diagnostic { line, col, start, end }` (start/end son offsets absolutos del
 * lexer) a diagnostics de CM. Incluye también los warnings de analyze()
 * cuando la compilación tiene éxito.
 */
const pineLintSource: LintSource = (view) => {
  const source = view.state.doc.toString();
  if (source.trim().length === 0) return [];

  const result = compile(source);
  const diags = result.ok ? result.script.warnings : result.diagnostics;
  const docLen = view.state.doc.length;

  return diags.map((d): CMDiagnostic => {
    const from = Math.max(0, Math.min(d.start, docLen));
    let to = Math.min(Math.max(d.end, from), docLen);
    // Garantizar un rango visible (subrayado de al menos 1 carácter)
    if (to === from && from < docLen) to = from + 1;
    return { from, to, severity: d.severity, message: d.message };
  });
};

/** Extensión de lint con debounce de ~300 ms. */
export function pineLinter(): Extension {
  return linter(pineLintSource, { delay: 300 });
}
