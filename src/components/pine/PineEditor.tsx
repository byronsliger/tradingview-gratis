"use client";

import { useEffect, useRef } from "react";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { lintGutter, lintKeymap } from "@codemirror/lint";
import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { pineCompletions } from "@/lib/pine/editor/pine-complete";
import type { Theme } from "@/lib/store/chart-store";
import {
  pineHighlightDark,
  pineHighlightLight,
  pineLanguage,
} from "@/lib/pine/editor/pine-language";
import { pineLinter } from "@/lib/pine/editor/pine-lint";
import { cn } from "@/lib/utils";

interface PineEditorProps {
  value: string;
  onChange: (value: string) => void;
  theme: Theme;
  className?: string;
}

/** Chrome del editor: usa las variables --tv-* (cambian solas con el tema). */
function editorChrome(dark: boolean): Extension {
  return EditorView.theme(
    {
      "&": {
        backgroundColor: "var(--tv-bg)",
        color: "var(--tv-text)",
        fontSize: "13px",
        height: "100%",
      },
      ".cm-scroller": {
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
        lineHeight: "1.6",
        overflow: "auto",
      },
      ".cm-content": { caretColor: "var(--tv-text)", padding: "8px 0" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--tv-text)" },
      "&.cm-focused": { outline: "none" },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
        backgroundColor: dark ? "rgba(41, 98, 255, 0.30)" : "rgba(41, 98, 255, 0.18)",
      },
      ".cm-gutters": {
        backgroundColor: "var(--tv-bg)",
        color: "var(--tv-text-dim)",
        border: "none",
        borderRight: "1px solid var(--tv-border)",
      },
      ".cm-activeLine": {
        backgroundColor: dark ? "rgba(41, 98, 255, 0.07)" : "rgba(41, 98, 255, 0.05)",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "transparent",
        color: "var(--tv-text)",
      },
      ".cm-lineNumbers .cm-gutterElement": { padding: "0 8px 0 12px" },
      ".cm-tooltip": {
        backgroundColor: "var(--tv-panel)",
        color: "var(--tv-text)",
        border: "1px solid var(--tv-border)",
        borderRadius: "6px",
      },
      ".cm-tooltip.cm-tooltip-lint": { padding: "2px 0" },
      ".cm-diagnostic": { borderLeft: "none", padding: "3px 8px" },
      ".cm-diagnostic-error": { borderLeft: "3px solid #ef5350" },
      ".cm-diagnostic-warning": { borderLeft: "3px solid #ffb74d" },
      ".cm-lint-marker": { width: "0.9em", height: "0.9em" },
      ".cm-gutter-lint": { width: "1.2em" },
      ".cm-matchingBracket": {
        backgroundColor: dark ? "rgba(38, 166, 154, 0.25)" : "rgba(38, 166, 154, 0.20)",
        outline: "none",
      },
    },
    { dark },
  );
}

function themeExtensions(theme: Theme): Extension {
  const dark = theme === "dark";
  return [
    editorChrome(dark),
    syntaxHighlighting(dark ? pineHighlightDark : pineHighlightLight),
  ];
}

/**
 * Wrapper controlado de CodeMirror 6 para Pine Script.
 * Crea el EditorView una sola vez (cleanup con view.destroy()) y sincroniza
 * `value` externo y `theme` (vía Compartment) sin recrearlo.
 */
export function PineEditor({ value, onChange, theme, className }: PineEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartmentRef = useRef(new Compartment());

  // Mantener el callback y los valores iniciales frescos sin recrear el view
  const onChangeRef = useRef(onChange);
  // eslint-disable-next-line react-hooks/refs
  onChangeRef.current = onChange;
  const initialValueRef = useRef(value);
  // eslint-disable-next-line react-hooks/refs
  initialValueRef.current = value;
  const initialThemeRef = useRef(theme);
  // eslint-disable-next-line react-hooks/refs
  initialThemeRef.current = theme;

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: initialValueRef.current,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        drawSelection(),
        dropCursor(),
        bracketMatching(),
        indentUnit.of("    "),
        autocompletion({ override: [pineCompletions], icons: false }),
        keymap.of([
          ...completionKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...lintKeymap,
          indentWithTab,
        ]),
        pineLanguage,
        pineLinter(),
        lintGutter(),
        themeCompartmentRef.current.of(themeExtensions(initialThemeRef.current)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Sincronizar cambios externos de `value` (cargar otro script, etc.)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (value !== current) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  // Sincronizar el tema con el store
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartmentRef.current.reconfigure(themeExtensions(theme)),
    });
  }, [theme]);

  return (
    <div
      ref={containerRef}
      className={cn("min-h-0 overflow-hidden bg-tv-bg text-left", className)}
    />
  );
}
