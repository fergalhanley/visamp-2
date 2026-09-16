import { mkdir, readFile, writeFile, copyFile, cp, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export function includeInternal(value) {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw Error("DOCS_INCLUDE_INTERNAL must be true or false");
}

export function filterInternal(source, internal) {
  let inside = false;
  let output = "";
  for (const line of source.split(/(?<=\n)/)) {
    const marker = line.trim();
    if (marker === "<!-- internal:start -->") {
      if (inside) throw Error("Nested internal section");
      inside = true;
    } else if (marker === "<!-- internal:end -->") {
      if (!inside) throw Error("Unmatched internal:end");
      inside = false;
    } else {
      if (line.includes("<!-- internal:")) throw Error("Malformed internal marker");
      if (!inside || internal) output += line;
    }
  }
  if (inside) throw Error("Unclosed internal section");
  return output;
}

// Only chapters explicitly listed in the filtered SUMMARY are published.
// No recursive source-directory copy: unlisted drafts and private assets stay out.
export async function prepare(root, destination, internal) {
  const summary = filterInternal(await readFile(join(root, "src/SUMMARY.md"), "utf8"), internal);
  const files = new Map([["SUMMARY.md", summary]]);
  for (const match of summary.matchAll(/\]\(([^)]+\.md)\)/g)) {
    const path = match[1].replace(/^\.\//, "");
    if (path.includes("..") || path.startsWith("/")) throw Error(`Invalid chapter path: ${path}`);
    const content = filterInternal(await readFile(join(root, "src", path), "utf8"), internal);
    if (!internal && (path.startsWith("internal/") || content.includes("<!-- audience: internal -->"))) {
      throw Error(`Internal chapter appears in public SUMMARY: ${path}`);
    }
    // Includes bypass chapter selection; require explicit chapters instead.
    if (/\{\{\s*#(?:include|rustdoc_include|playground)/.test(content)) throw Error(`Source includes are unsupported: ${path}`);
    files.set(path, content);
  }
  // Validate everything before replacing the staged source tree.
  await rm(join(destination, "src"), { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  for (const [path, content] of files) {
    const target = join(destination, "src", path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  // Public asset allowlist. Internal assets must never be added here.
  for (const asset of ["visamp-logo.svg", "visript.js"]) {
    const target = join(destination, "src/assets", asset);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(root, "src/assets", asset), target);
  }
  await copyFile(join(root, "book.toml"), join(destination, "book.toml"));
  await rm(join(destination, "theme"), { recursive: true, force: true });
  await cp(join(root, "theme"), join(destination, "theme"), { recursive: true });
  if (internal) {
    const header = join(destination, "theme/header.hbs");
    await writeFile(header, (await readFile(header, "utf8")).replace('>Docs</span>', '>Internal Docs</span>'));
  }
  return resolve(destination);
}
