"use client";

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching, indentOnInput } from "@codemirror/language";
import { setDiagnostics, type Diagnostic as CmDiagnostic } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { useEffect, useRef } from "react";

import type { Diagnostic } from "@visamp/player";

import { visampSyntax } from "@/lib/dsl/language";

const editorTheme = EditorView.theme(
  {
    "&": { height: "100%", fontSize: "13px", backgroundColor: "transparent" },
    ".cm-scroller": {
      fontFamily: "var(--font-mono), ui-monospace, monospace",
      lineHeight: "1.6",
    },
    ".cm-gutters": {
      backgroundColor: "transparent",
      border: "none",
      color: "color-mix(in oklab, var(--foreground) 30%, transparent)",
    },
    ".cm-activeLine": {
      backgroundColor: "color-mix(in oklab, var(--foreground) 4%, transparent)",
    },
    ".cm-activeLineGutter": { backgroundColor: "transparent" },
    ".cm-content": { caretColor: "var(--foreground)" },
    "&.cm-focused": { outline: "none" },
    ".cm-lintRange-error": {
      // Default lint underline is a background image; this reads better on dark.
      textDecoration: "underline wavy var(--destructive)",
      textDecorationSkipInk: "none",
    },
  },
  { dark: true },
);

/** Diagnostics carry 1-based line/column; CodeMirror wants document offsets. */
function toCodeMirrorDiagnostics(
  state: EditorState,
  diagnostics: Diagnostic[],
): CmDiagnostic[] {
  return diagnostics.map((diagnostic) => {
    if (!diagnostic.line) {
      return {
        from: 0,
        to: Math.min(state.doc.length, 1),
        severity: diagnostic.severity,
        message: diagnostic.message,
      };
    }

    const lineNumber = Math.min(Math.max(diagnostic.line, 1), state.doc.lines);
    const line = state.doc.line(lineNumber);
    const from = Math.min(line.from + Math.max((diagnostic.column ?? 1) - 1, 0), line.to);

    return {
      from,
      // Underline to the end of the line: pest reports a point, not a span.
      to: line.to > from ? line.to : from,
      severity: diagnostic.severity,
      message: diagnostic.message,
    };
  });
}

export interface CodeEditorHandle {
  goToLine: (line: number) => void;
}

interface CodeEditorProps {
  initialValue: string;
  onChange: (value: string) => void;
  diagnostics: Diagnostic[];
  handleRef?: React.RefObject<CodeEditorHandle | null>;
}

/**
 * E6.4 — CodeMirror 6 with DSL highlighting and error squiggles.
 *
 * Uncontrolled by design: the document lives in CodeMirror and changes flow
 * out through `onChange`. Feeding every keystroke back in would fight the
 * editor's own undo history and cursor handling.
 */
export function CodeEditor({
  initialValue,
  onChange,
  diagnostics,
  handleRef,
}: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);

  // Kept in a ref so an inline arrow from the parent never tears down the view.
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          visampSyntax,
          editorTheme,
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
        ],
      }),
    });

    viewRef.current = view;

    if (handleRef) {
      handleRef.current = {
        goToLine(line: number) {
          const target = Math.min(Math.max(line, 1), view.state.doc.lines);
          const { from } = view.state.doc.line(target);
          view.dispatch({
            selection: { anchor: from },
            scrollIntoView: true,
          });
          view.focus();
        },
      };
    }

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Mount once; `initialValue` is the seed, not a binding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch(
      setDiagnostics(view.state, toCodeMirrorDiagnostics(view.state, diagnostics)),
    );
  }, [diagnostics]);

  return <div ref={hostRef} className="h-full overflow-hidden" />;
}
