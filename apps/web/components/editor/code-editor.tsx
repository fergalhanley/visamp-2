"use client";

import {
  copyLineDown,
  defaultKeymap,
  deleteLine,
  history,
  historyKeymap,
  indentLess,
  indentMore,
} from "@codemirror/commands";
import { bracketMatching, indentOnInput } from "@codemirror/language";
import { setDiagnostics, type Diagnostic as CmDiagnostic } from "@codemirror/lint";
import { EditorSelection, EditorState, countColumn } from "@codemirror/state";
import {
  EditorView,
  type Command,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { useEffect, useRef } from "react";

import type { Diagnostic } from "@visamp/player";

import { INDENT_WIDTH, visampSyntax } from "@/lib/dsl/language";

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

/**
 * Tab: indent the selected lines, or advance to the next tab stop.
 *
 * With a selection this is ordinary block indentation. With a bare cursor it
 * inserts spaces up to the next multiple of `INDENT_WIDTH` rather than a flat
 * two, so a cursor sitting at an odd column lands back on the grid instead of
 * carrying the offset down the file.
 */
const indentOrInsert: Command = (view) => {
  const { state } = view;
  if (state.selection.ranges.some((range) => !range.empty)) return indentMore(view);

  view.dispatch(
    state.changeByRange((range) => {
      const line = state.doc.lineAt(range.head);
      const column = countColumn(
        line.text.slice(0, range.head - line.from),
        state.tabSize,
      );
      const width = INDENT_WIDTH - (column % INDENT_WIDTH);
      const insert = " ".repeat(width);

      return {
        changes: { from: range.head, insert },
        range: EditorSelection.cursor(range.head + width),
      };
    }),
    { scrollIntoView: true, userEvent: "input" },
  );

  return true;
};

/**
 * Editing keys layered ahead of the defaults, so these win where they overlap.
 *
 * Binding Tab does trap it inside the editor, which normally costs keyboard
 * users their way out of the field. Escape then Tab still moves focus on, and
 * the editor is a code surface where indentation is the more useful default.
 */
const editingKeymap = [
  { key: "Mod-d", run: deleteLine, preventDefault: true },
  { key: "Shift-Mod-d", run: copyLineDown, preventDefault: true },
  { key: "Tab", run: indentOrInsert, preventDefault: true },
  { key: "Shift-Tab", run: indentLess, preventDefault: true },
];

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
  replaceDocument: (source: string) => void;
  /** Drops text in at the cursor, replacing any selection. */
  insertAtCursor: (text: string) => void;
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
          keymap.of([...editingKeymap, ...defaultKeymap, ...historyKeymap]),
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
        replaceDocument(source: string) {
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: source },
            selection: { anchor: 0 },
            scrollIntoView: true,
            userEvent: "input.ai",
          });
          view.focus();
        },
        insertAtCursor(text: string) {
          const { from, to } = view.state.selection.main;
          view.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: from + text.length },
            scrollIntoView: true,
            userEvent: "input.paste",
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
