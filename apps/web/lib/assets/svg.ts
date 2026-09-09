/**
 * VIS-51: SVG admission.
 *
 * SVG is the one accepted format that can execute, fetch, or exfiltrate once it
 * reaches a page, so it gets the strictest treatment. The file is rejected
 * rather than rewritten: we store the original bytes, and a sanitiser that
 * silently alters artwork is both harder to trust and harder to explain to the
 * person who uploaded it.
 *
 * This is an allowlist over a real tokenizer, not a search for bad substrings.
 * Pattern matching over raw text let several things through — `<s:script>` is
 * not `<script`, `&#104;ttps://…` is not `https://`, and `../x.png` is not
 * `scheme://x`. Anything this parser does not positively recognise is refused,
 * so the failure mode is a rejected file rather than an admitted one.
 */

import { AssetRejected } from "./rules.ts";

/** Drawing, grouping, text and paint-server elements. Local names, no prefixes. */
const ELEMENTS = new Set([
  "svg", "g", "defs", "symbol", "use", "switch", "title", "desc", "metadata",
  "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "text", "tspan", "textPath", "image", "clipPath", "mask", "pattern", "marker",
  "linearGradient", "radialGradient", "stop", "style",
  "filter", "feBlend", "feColorMatrix", "feComponentTransfer", "feComposite",
  "feConvolveMatrix", "feDiffuseLighting", "feDisplacementMap", "feDistantLight",
  "feDropShadow", "feFlood", "feFuncA", "feFuncB", "feFuncG", "feFuncR",
  "feGaussianBlur", "feImage", "feMerge", "feMergeNode", "feMorphology",
  "feOffset", "fePointLight", "feSpecularLighting", "feSpotLight", "feTile",
  "feTurbulence",
]);

/**
 * Elements deliberately absent, and why: script and handler execute; animate,
 * animateTransform, animateMotion and set can rewrite an attribute after load,
 * which would defeat every check below; foreignObject, iframe, embed, object,
 * audio, video and a embed or navigate to other content.
 */

/**
 * Attributes that name something to fetch. Deliberately just these two: the
 * animation attributes that can also hold a URL (`from`, `to`, `values`) belong
 * to elements this parser refuses outright, and `path` on textPath is geometry.
 */
const URL_ATTRIBUTES = new Set(["href", "src"]);

/** Attributes whose value is CSS and can therefore carry a url(). */
const STYLE_ATTRIBUTES = new Set([
  "style", "fill", "stroke", "filter", "clip-path", "mask",
  "marker-start", "marker-mid", "marker-end",
]);

export function inspectSvg(bytes: Uint8Array): void {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new AssetRejected("This SVG is not valid UTF-8 text.");
  }

  // <style> contents are text to the tag walk, so they are checked separately.
  inspectSvgStyleBlocks(text);

  const open: string[] = [];
  let sawSvg = false;
  let index = 0;

  while (index < text.length) {
    const next = text.indexOf("<", index);
    if (next === -1) break;

    if (text.startsWith("<!--", next)) {
      const end = text.indexOf("-->", next + 4);
      if (end === -1) throw new AssetRejected("This SVG has an unterminated comment.");
      index = end + 3;
      continue;
    }
    if (text.startsWith("<![CDATA[", next)) {
      const end = text.indexOf("]]>", next + 9);
      if (end === -1) throw new AssetRejected("This SVG has an unterminated CDATA section.");
      index = end + 3;
      continue;
    }
    if (text.startsWith("<!", next)) {
      const end = text.indexOf(">", next);
      if (end === -1) throw new AssetRejected("This SVG has an unterminated declaration.");
      // Entity declarations are how a small file becomes a very large one.
      if (/<!DOCTYPE[^>]*\[/i.test(text.slice(next, end + 1)))
        throw new AssetRejected(
          "This SVG was rejected because it declares XML entities, which can be used to exhaust the parser.",
        );
      index = end + 1;
      continue;
    }
    if (text.startsWith("<?", next)) {
      const end = text.indexOf("?>", next + 2);
      if (end === -1) throw new AssetRejected("This SVG has an unterminated processing instruction.");
      index = end + 2;
      continue;
    }

    const tag = readTag(text, next);
    if (tag.closing) {
      const expected = open.pop();
      if (expected !== tag.localName)
        throw new AssetRejected("This SVG is not well-formed XML.");
    } else {
      if (!ELEMENTS.has(tag.localName))
        throw new AssetRejected(
          `This SVG was rejected because it contains a <${tag.rawName}> element, which is not an allowed drawing element.`,
        );
      if (!sawSvg && tag.localName !== "svg")
        throw new AssetRejected("This file does not start with an <svg> element.");
      sawSvg = true;
      checkAttributes(tag);
      if (!tag.selfClosing) open.push(tag.localName);
    }
    index = tag.end;
  }

  if (!sawSvg) throw new AssetRejected("This file does not contain an <svg> element.");
  // A truncated file is not renderable, and half-parsed markup is not something
  // to reason about the safety of.
  if (open.length > 0)
    throw new AssetRejected("This SVG is truncated: not every element is closed.");
}

interface Tag {
  rawName: string;
  localName: string;
  closing: boolean;
  selfClosing: boolean;
  attributes: { name: string; value: string }[];
  end: number;
}

function readTag(text: string, start: number): Tag {
  let index = start + 1;
  const closing = text[index] === "/";
  if (closing) index += 1;

  const nameStart = index;
  while (index < text.length && !/[\s/>]/.test(text[index]!)) index += 1;
  const rawName = text.slice(nameStart, index);
  if (!rawName) throw new AssetRejected("This SVG is not well-formed XML.");

  const attributes: { name: string; value: string }[] = [];
  let selfClosing = false;

  for (;;) {
    while (index < text.length && /\s/.test(text[index]!)) index += 1;
    if (index >= text.length) throw new AssetRejected("This SVG has an unterminated tag.");

    if (text[index] === "/") {
      selfClosing = true;
      index += 1;
      continue;
    }
    if (text[index] === ">") {
      index += 1;
      break;
    }

    const attrStart = index;
    while (index < text.length && !/[\s=/>]/.test(text[index]!)) index += 1;
    const name = text.slice(attrStart, index);
    if (!name) throw new AssetRejected("This SVG is not well-formed XML.");

    while (index < text.length && /\s/.test(text[index]!)) index += 1;
    let value = "";
    if (text[index] === "=") {
      index += 1;
      while (index < text.length && /\s/.test(text[index]!)) index += 1;
      const quote = text[index];
      if (quote === '"' || quote === "'") {
        const end = text.indexOf(quote, index + 1);
        if (end === -1) throw new AssetRejected("This SVG has an unterminated attribute.");
        value = text.slice(index + 1, end);
        index = end + 1;
      } else {
        const valueStart = index;
        while (index < text.length && !/[\s>]/.test(text[index]!)) index += 1;
        value = text.slice(valueStart, index);
      }
    }
    attributes.push({ name, value });
  }

  return {
    rawName,
    localName: localName(rawName),
    closing,
    selfClosing,
    attributes,
    end: index,
  };
}

/** `s:script` and `script` are the same element; the prefix carries no safety. */
function localName(name: string): string {
  const colon = name.lastIndexOf(":");
  return colon === -1 ? name : name.slice(colon + 1);
}

function checkAttributes(tag: Tag): void {
  for (const attribute of tag.attributes) {
    const name = localName(attribute.name).toLowerCase();
    const value = decodeEntities(attribute.value);

    if (name.startsWith("on"))
      throw new AssetRejected(
        "This SVG was rejected because it contains event-handler attributes.",
      );

    if (URL_ATTRIBUTES.has(name)) assertLocalReference(value);
    if (STYLE_ATTRIBUTES.has(name)) assertInertCss(value);
  }
}

/**
 * Character and entity references are decoded before anything is compared, or
 * `&#106;avascript:` reads as harmless text. Numeric forms are what an attacker
 * reaches for; the five named entities are what real files contain.
 */
function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);?/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

/**
 * The asset must be self-contained. Only a same-document fragment or inline
 * data is allowed — not a relative path, which would resolve against whatever
 * page displays the asset, and not a protocol-relative `//host/…`, which is
 * simply an external URL wearing a disguise.
 */
function assertLocalReference(value: string): void {
  const target = value.trim();
  if (!target || target.startsWith("#")) return;

  // Inline data is allowed only for raster images. Notably not
  // data:image/svg+xml, which would nest a document this parser never saw.
  if (target.toLowerCase().startsWith("data:")) {
    if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(target)) return;
    throw new AssetRejected(
      "This SVG was rejected because it embeds a data: URL that is not a raster image.",
    );
  }

  throw new AssetRejected(
    "This SVG was rejected because it references an external file. Embed what it needs, or reference it within the same file.",
  );
}

function assertInertCss(value: string): void {
  const css = decodeEntities(value);

  if (/@import/i.test(css))
    throw new AssetRejected(
      "This SVG was rejected because it imports an external stylesheet.",
    );
  if (/expression\s*\(/i.test(css))
    throw new AssetRejected(
      "This SVG was rejected because it contains a CSS expression.",
    );

  for (const match of css.matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi)) {
    assertLocalReference(match[2] ?? "");
  }
}

/** The contents of a <style> element, which the tag walk sees only as text. */
function inspectSvgStyleBlocks(text: string): void {
  for (const match of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/\s*style\s*>/gi)) {
    assertInertCss(match[1] ?? "");
  }
}
