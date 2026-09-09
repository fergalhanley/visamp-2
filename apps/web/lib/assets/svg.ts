/**
 * VIS-51: SVG admission.
 *
 * SVG is the one accepted format that can execute, fetch, or exfiltrate once it
 * reaches a page, so it gets the strictest treatment. The file is rejected
 * rather than rewritten: we store the original bytes, and a sanitiser that
 * silently alters artwork is both harder to trust and harder to explain to the
 * person who uploaded it.
 */

import { AssetRejected } from "./rules.ts";

interface Rule {
  pattern: RegExp;
  reason: string;
}

const RULES: Rule[] = [
  { pattern: /<\s*script\b/i, reason: "it contains a <script> element" },
  {
    pattern: /<\s*(foreignObject|iframe|embed|object|audio|video)\b/i,
    reason: "it embeds external or interactive content",
  },
  {
    // `on…=` attributes are the other half of script execution.
    pattern: /\son[a-z]+\s*=/i,
    reason: "it contains event-handler attributes",
  },
  {
    pattern: /<!ENTITY\b/i,
    reason: "it declares XML entities, which can be used to exhaust the parser",
  },
  {
    pattern: /javascript\s*:/i,
    reason: "it contains a javascript: URL",
  },
  {
    // Anything the renderer would have to fetch: the asset must be
    // self-contained, or a public asset becomes a tracking beacon and a
    // withdrawal cannot actually remove what it displays.
    pattern: /(?:href|xlink:href|src)\s*=\s*["']\s*(?!#|data:)[a-z]*:?\/\//i,
    reason: "it references an external file",
  },
  {
    pattern: /@import\b/i,
    reason: "it imports an external stylesheet",
  },
  {
    pattern: /url\(\s*["']?\s*(?!#|data:)[a-z]+:/i,
    reason: "it references an external resource from CSS",
  },
];

/** Throws `AssetRejected` unless the bytes are a self-contained, inert SVG. */
export function inspectSvg(bytes: Uint8Array): void {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new AssetRejected("This SVG is not valid UTF-8 text.");
  }

  if (!/<\s*svg\b/i.test(text))
    throw new AssetRejected("This file does not contain an <svg> element.");

  for (const rule of RULES) {
    if (rule.pattern.test(text))
      throw new AssetRejected(`This SVG was rejected because ${rule.reason}.`);
  }
}
