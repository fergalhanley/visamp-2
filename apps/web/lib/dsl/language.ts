import {
  HighlightStyle,
  StreamLanguage,
  indentService,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/** Line comment to end of line. Checked first, or `/` would match as an operator. */
const COMMENT = /^\/\/.*/;
const KEYWORDS = /^(prop|fn|let|if|else|for|in|while|return|context|step)\b/;
const NAMESPACES = /^(draw|math|color)::[A-Za-z0-9_]+/;
/** Longest-first, matching the grammar, so `webgl` can't shadow `webgl2`. */
const CONTEXT_KIND = /^(experimental-webgl|webgl2|webgl|webgpu|2d)\b/;
const BLOCK_NAME = /^(on_[A-Za-z0-9]+|render\b)/;
const SYSTEM_VALUE = /^\$[A-Za-z0-9_]+/;
const FLOAT = /^-?\d+\.\d+/;
const INTEGER = /^-?\d+/;
const STRING = /^"(?:[^"\\]|\\.)*"/;
const BOOLEAN = /^(true|false)\b/;
/** An identifier acting as a named argument, e.g. the `radius` in `radius: 10.0`. */
const ARG_LABEL = /^[A-Za-z_][A-Za-z0-9_]*(?=\s*:)/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*/;
/** `..=` before `..` so the inclusive form is not split. */
const OPERATOR = /^(\.\.=|\.\.|==|!=|<=|>=|[+\-*/%<>!=\\])/;

/** Two spaces per level, everywhere: the editor never inserts a tab. */
export const INDENT_WIDTH = 2;
export const INDENT_STRING = " ".repeat(INDENT_WIDTH);

export const visampLanguage = StreamLanguage.define({
  name: "visamp",

  languageData: {
    // Gives Cmd+/ line commenting for free via the default keymap.
    commentTokens: { line: "//" },
    // Re-indents the line the moment a closing brace is typed, so `}` snaps
    // back a level instead of sitting where the auto-indent left it.
    indentOnInput: /^\s*\}$/,
  },

  token(stream) {
    if (stream.eatSpace()) return null;

    // Before everything else: `//` must not be read as a division operator.
    if (stream.match(COMMENT)) return "comment";

    if (stream.match(SYSTEM_VALUE)) return "atom";
    if (stream.match(NAMESPACES)) return "builtin";
    if (stream.match(BLOCK_NAME)) return "def";
    if (stream.match(KEYWORDS)) return "keyword";
    // Only meaningful straight after `context`, but the kinds are reserved
    // enough that always colouring them reads fine.
    if (stream.match(CONTEXT_KIND)) return "atom";
    if (stream.match(BOOLEAN)) return "atom";
    if (stream.match(FLOAT) || stream.match(INTEGER)) return "number";
    if (stream.match(STRING)) return "string";
    if (stream.match(ARG_LABEL)) return "property";
    if (stream.match(IDENTIFIER)) return "variable";
    if (stream.match(OPERATOR)) return "operator";

    stream.next();
    return null;
  },
});

/**
 * Indentation for a brace-delimited DSL, derived from the text rather than a
 * parse tree.
 *
 * The syntax here is a `StreamLanguage`, which carries no nesting information,
 * so there is nothing to ask about block depth. Reading the previous non-blank
 * line covers what this grammar actually does: bodies open with a trailing `{`
 * and close with a `}` on its own line.
 */
const visampIndent = indentService.of((context, pos) => {
  // On Enter, CodeMirror asks about the position *before* a simulated line
  // break, so `lineAt(pos, -1)` is the line being left rather than the one
  // being created. When re-indenting after a typed `}` there is no simulated
  // break and the same call gives the line above. Both are what we want as
  // the reference line.
  const before = context.lineAt(pos, -1);
  if (before === null) return 0;

  let previous = before.text;

  // A blank reference line must not reset indentation to column zero, so walk
  // back to the last line with content on it.
  if (!previous.trim()) {
    const doc = context.state.doc;
    for (let n = doc.lineAt(Math.max(before.from - 1, 0)).number; n >= 1; n -= 1) {
      const text = doc.line(n).text;
      if (text.trim()) {
        previous = text;
        break;
      }
    }
  }

  if (!previous.trim()) return 0;

  const base = /^\s*/.exec(previous)![0].length;
  // A trailing comment must not hide the brace that opens the block.
  const opensBlock = /\{\s*(\/\/.*)?$/.test(previous);
  const closesBlock = /^\s*\}/.test(context.state.doc.lineAt(pos).text);

  const indent = base + (opensBlock ? INDENT_WIDTH : 0) - (closesBlock ? INDENT_WIDTH : 0);
  return Math.max(indent, 0);
});

const palette = {
  keyword: "#c792ea",
  builtin: "#82aaff",
  block: "#ffcb6b",
  system: "#f78c6c",
  number: "#f78c6c",
  string: "#c3e88d",
  property: "#89ddff",
  variable: "#e0e0ff",
  operator: "#89ddff",
  comment: "#5c6370",
};

export const visampHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: palette.keyword },
  { tag: t.standard(t.variableName), color: palette.builtin },
  { tag: t.definition(t.variableName), color: palette.block, fontWeight: "600" },
  { tag: t.atom, color: palette.system },
  { tag: t.number, color: palette.number },
  { tag: t.string, color: palette.string },
  { tag: t.propertyName, color: palette.property },
  { tag: t.variableName, color: palette.variable },
  { tag: t.operator, color: palette.operator },
  { tag: t.comment, color: palette.comment, fontStyle: "italic" },
]);

export const visampSyntax = [
  visampLanguage,
  visampIndent,
  indentUnit.of(INDENT_STRING),
  syntaxHighlighting(visampHighlightStyle),
];
