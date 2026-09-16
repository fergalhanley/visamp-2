import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
const root = fileURLToPath(new URL(process.env.DOCS_INCLUDE_INTERNAL === "true" ? "../book-internal/" : "../book/", import.meta.url));
const pages = new Map();
async function visit(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await visit(path);
    else if (entry.name.endsWith(".html")) pages.set(path, await readFile(path, "utf8"));
  }
}
await visit(root);
let failed = 0;
for (const [path, html] of pages) {
  for (const match of html.matchAll(/\b(?:href|src)="([^"<>]+)"/g)) {
    const href = match[1].replaceAll("&amp;", "&");
    if (/^(?:[a-z]+:|\/\/)/i.test(href)) continue;
    const url = new URL(href, `https://docs.example/${relative(root, path)}`);
    let target = join(root, decodeURIComponent(url.pathname));
    try {
      if ((await stat(target)).isDirectory()) target = join(target, "index.html");
      await stat(target);
      if (url.hash && pages.has(target)) {
        const id = decodeURIComponent(url.hash.slice(1));
        const ids = [...pages.get(target).matchAll(/\bid=["']([^"']+)["']/g)].map(m => m[1]);
        if (!ids.includes(id)) throw Error(`missing anchor ${id}`);
      }
    } catch (error) {
      failed++;
      console.error(`${relative(root, path)} -> ${href}: ${error.code || error.message}`);
    }
  }
}
console.log(`Checked ${pages.size} generated pages; ${failed} broken local references.`);
process.exitCode = failed ? 1 : 0;
