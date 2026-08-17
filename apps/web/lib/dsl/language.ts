import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

const KEYWORDS = /^(prop|fn|let|if|else|for|in|while|return)\b/;
const NAMESPACES = /^(draw|math|color)::[A-Za-z0-9_]+/;
const BLOCK_NAME = /^(on_|layer_)[A-Za-z0-9]+/;
const SYSTEM_VALUE = /^\$[A-Za-z0-9_]+/;
const FLOAT = /^-?\d+\.\d+/;
const INTEGER = /^-?\d+/;
const STRING = /^"(?:[^"\\]|\\.)*"/;
const BOOLEAN = /^(true|false)\b/;
/** An identifier acting as a named argument, e.g. the `radius` in `radius: 10.0`. */
const ARG_LABEL = /^[A-Za-z_][A-Za-z0-9_]*(?=\s*:)/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*/;
const OPERATOR = /^(==|!=|<=|>=|[+\-*/%<>!=])/;

/**
 * Note: the grammar has no comment rule, so there is deliberately no comment
 * token here — a `//` in a script is a parse error, not a comment.
 */
export const visampLanguage = StreamLanguage.define({
  name: "visamp",

  token(stream) {
    if (stream.eatSpace()) return null;

    if (stream.match(SYSTEM_VALUE)) return "atom";
    if (stream.match(NAMESPACES)) return "builtin";
    if (stream.match(BLOCK_NAME)) return "def";
    if (stream.match(KEYWORDS)) return "keyword";
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
]);

export const visampSyntax = [
  visampLanguage,
  syntaxHighlighting(visampHighlightStyle),
];
