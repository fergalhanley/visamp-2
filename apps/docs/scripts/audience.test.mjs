import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { filterInternal, includeInternal, prepare } from "./audience.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
test("public by default; only explicit true includes internal docs", () => {
  assert.equal(includeInternal(), false);
  assert.equal(includeInternal("false"), false);
  assert.equal(includeInternal("true"), true);
  for (const value of ["", "0", "FALSE", "yes"]) assert.throws(() => includeInternal(value));
});
test("internal sections are removed and malformed boundaries fail closed", () => {
  const text = "Public\n<!-- internal:start -->\nPrivate\n<!-- internal:end -->\nMore\n";
  assert.equal(filterInternal(text, false), "Public\nMore\n");
  assert.equal(filterInternal(text, true), "Public\nPrivate\nMore\n");
  for (const source of ["<!-- internal:start -->", "<!-- internal:end -->", "<!-- internal:typo -->", "<!-- internal:start -->\n<!-- internal:start -->"]) {
    assert.throws(() => filterInternal(source, false));
    assert.throws(() => filterInternal(source, true));
  }
});
test("staging publishes only listed chapters and approved assets", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "visamp-docs-test-"));
  const stage = join(fixture, "stage");
  try {
    const files = {
      "src/SUMMARY.md": "[Public](public.md)\n<!-- internal:start -->\n- [Private](private.md)\n<!-- internal:end -->\n",
      "src/public.md": "# Public\n<!-- internal:start -->\nPRIVATE_FRAGMENT\n<!-- internal:end -->\n",
      "src/private.md": "PRIVATE_CHAPTER",
      "src/unlisted.md": "UNLISTED_DRAFT",
      "src/assets/private.json": "PRIVATE_ASSET",
      "src/assets/visamp-logo.svg": "logo",
      "src/assets/visript.js": "highlight",
      "theme/header.hbs": ">Docs</span>",
      "book.toml": "[book]\n",
    };
    for (const [path, content] of Object.entries(files)) {
      await mkdir(join(fixture, path, ".."), { recursive: true });
      await writeFile(join(fixture, path), content);
    }
    await prepare(fixture, stage, true);
    assert.equal(await readFile(join(stage, "src/private.md"), "utf8"), "PRIVATE_CHAPTER");
    await prepare(fixture, stage, false);
    assert.equal(await readFile(join(stage, "src/public.md"), "utf8"), "# Public\n");
    for (const path of ["private.md", "unlisted.md", "assets/private.json"]) await assert.rejects(access(join(stage, "src", path)));
    await writeFile(join(fixture, "src/SUMMARY.md"), "[Private](private.md)\n");
    await writeFile(join(fixture, "src/private.md"), "<!-- audience: internal -->\nSecret");
    await assert.rejects(prepare(fixture, stage, false), /Internal chapter appears/);
    await prepare(fixture, stage, true);

  } finally { await rm(fixture, { recursive: true, force: true }); }
});
test("real public and internal builds enforce the publishing boundary", async () => {
  function build(value) {
    const env = { ...process.env };
    if (value === undefined) delete env.DOCS_INCLUDE_INTERNAL;
    else env.DOCS_INCLUDE_INTERNAL = value;
    const result = spawnSync(process.execPath, [join(root, "scripts/mdbook.mjs"), "build"], { env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  build("true");
  assert.match(await readFile(join(root, "book-internal/getting-started/quick-start.html"), "utf8"), /Running the repository locally/);
  await access(join(root, "book-internal/design/drawing-expansion.html"));
  await access(join(root, "book-internal/examples/sample-packs.html"));
  await mkdir(join(root, "book/design"), { recursive: true });
  await writeFile(join(root, "book/design/stale-private.html"), "STALE_PRIVATE");
  build();
  async function scan(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await scan(path);
      else {
        const content = await readFile(path, "utf8");
        assert.doesNotMatch(content, /Running the repository locally|Contributor Notes|Contributor checklist|STALE_PRIVATE|fergalhanley\/visamp-2|linear\.app\/visamp|import\.sql|VisampCanvas interactive/, path);
      }
    }
  }
  await scan(join(root, "book"));
  for (const path of ["design/drawing-expansion.html", "examples/sample-packs.html", "internal/api-conventions.html", "design/stale-private.html"]) await assert.rejects(access(join(root, "book", path)));
  build("false");
  await scan(join(root, "book"));
});
