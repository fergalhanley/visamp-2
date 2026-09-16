import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, copyFile, chmod, rm, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const version = "0.5.4";
const root = fileURLToPath(new URL("../", import.meta.url));
// Official release assets: https://github.com/rust-lang/mdBook/releases/tag/v0.5.4
const releases = {
  "darwin-arm64": ["aarch64-apple-darwin", "03e8a6d8b13a2971e0b3280affd03b388373c1485e26f73407c3a76b0b1838df"],
  "darwin-x64": ["x86_64-apple-darwin", "a47d7bf0d5d670cff9ee6cce95537cbeb62dc10704d9e7131ffbd13e2b59a5de"],
  "linux-x64": ["x86_64-unknown-linux-musl", "5222beabd3e37dc5be0d18ff99b79058469354db5c220153a1b92db5ba12be89"],
  "linux-arm64": ["aarch64-unknown-linux-musl", "753e5c5c363ee8a56972344dcf91466f005a51db84a7aeffe427ae3ef83d6d44"],
};
const matches = (binary) => {
  const result = spawnSync(binary, ["--version"], { encoding: "utf8" });
  return result.status === 0 && result.stdout.trim() === `mdbook v${version}`;
};
async function binary() {
  if (process.env.MDBOOK_BIN) {
    if (!matches(process.env.MDBOOK_BIN)) throw Error(`MDBOOK_BIN must be mdbook v${version}`);
    return process.env.MDBOOK_BIN;
  }
  if (!process.env.MDBOOK_DOWNLOAD && matches("mdbook")) return "mdbook";
  const release = releases[`${process.platform}-${process.arch}`];
  if (!release) throw Error(`Install mdbook v${version} and set MDBOOK_BIN for ${process.platform}/${process.arch}`);
  const [target, digest] = release;
  const cache = join(root, ".cache", `mdbook-${version}-${target}`);
  const executable = join(cache, "mdbook");
  if (matches(executable)) return executable;
  const temporary = await mkdtemp(join(tmpdir(), "visamp-mdbook-"));
  try {
    const url = `https://github.com/rust-lang/mdBook/releases/download/v${version}/mdbook-v${version}-${target}.tar.gz`;
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw Error(`mdBook download failed: HTTP ${response.status}`);
    const archive = join(temporary, "mdbook.tar.gz");
    await writeFile(archive, Buffer.from(await response.arrayBuffer()));
    if (createHash("sha256").update(await readFile(archive)).digest("hex") !== digest) throw Error("mdBook archive checksum mismatch");
    const unpack = spawnSync("tar", ["-xzf", archive, "-C", temporary], { stdio: "inherit" });
    if (unpack.status !== 0) throw Error("Could not extract mdBook; install tar");
    await mkdir(cache, { recursive: true });
    await copyFile(join(temporary, "mdbook"), executable);
    await chmod(executable, 0o755);
    if (!matches(executable)) throw Error("Downloaded mdBook could not run");
    return executable;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
try {
  const executable = await binary();
  const command = process.argv.slice(2);
  const child = spawn(executable, command.length ? command : ["build"], { cwd: root, stdio: "inherit" });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
  child.on("exit", (code) => { process.exitCode = code ?? 1; });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
