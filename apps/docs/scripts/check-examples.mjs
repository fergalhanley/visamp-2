import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
const root = fileURLToPath(new URL("../src/", import.meta.url));
const validator = process.env.VISRIPT_VALIDATOR || fileURLToPath(new URL("../../../target/release/visamp-validate", import.meta.url));
let checked = 0;
let failed = 0;
async function visit(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== "design") await visit(path); continue; }
    if (!entry.name.endsWith(".md")) continue;
    const markdown = await readFile(path, "utf8");
    for (const match of markdown.matchAll(/^```visript\n([\s\S]*?)^```/gm)) {
      if (!/^render\s*\{/m.test(match[1])) continue;
      const result = spawnSync(validator, [], { input: match[1], encoding: "utf8" });
      if (result.error) throw result.error;
      checked++;
      if (result.status !== 0) {
        failed++;
        const line = markdown.slice(0, match.index).split("\n").length;
        console.error(`${relative(root, path)}:${line}\n${result.stdout}${result.stderr}`);
      }
    }
  }
}
await visit(root);
console.log(`Compiled ${checked} complete examples; ${failed} failures.`);
process.exitCode = failed ? 1 : 0;
