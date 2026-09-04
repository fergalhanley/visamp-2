import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BrowserPool } from "./browser-pool.mjs";
import { config } from "./config.mjs";
import { validate } from "./validator.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const engineRoot = path.resolve(here, "../../../packages/engine/pkg-validator");
const pool = new BrowserPool(config.poolSize);

function send(response, status, body, contentType = "application/json") {
  response.writeHead(status, { "content-type": contentType });
  response.end(typeof body === "string" ? body : JSON.stringify(body));
}

async function body(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("request body exceeds 1 MB");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function staticFile(response, file, contentType) {
  try {
    response.writeHead(200, { "content-type": contentType });
    response.end(await fs.readFile(file));
  } catch {
    send(response, 404, { error: "not found" });
  }
}

const assets = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  if (pathname === "/harness.html")
    return staticFile(response, path.join(here, "harness.html"), "text/html");
  if (pathname === "/harness.mjs")
    return staticFile(response, path.join(here, "harness.mjs"), "text/javascript");
  if (pathname.startsWith("/engine/")) {
    const name = path.basename(pathname);
    const type = name.endsWith(".wasm") ? "application/wasm" : "text/javascript";
    return staticFile(response, path.join(engineRoot, name), type);
  }
  send(response, 404, { error: "not found" });
});

const api = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health")
    return send(response, 200, { ok: true });
  if (request.method !== "POST" || request.url !== "/validate")
    return send(response, 404, { error: "not found" });

  let browser;
  let recycle = false;
  try {
    const payload = await body(request);
    if (typeof payload.script !== "string" || payload.script.length === 0)
      return send(response, 400, { error: "script must be a non-empty string" });
    browser = await pool.acquire();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("validation wall-clock limit exceeded")),
        config.wallClockMs,
      );
    });
    const result = await Promise.race([validate(browser, payload.script, config), timeout]).finally(
      () => clearTimeout(timer),
    );
    send(response, 200, result);
  } catch (error) {
    recycle = Boolean(browser);
    send(response, 422, { ok: false, error: error.message });
  } finally {
    if (browser) {
      if (recycle) void pool.replace(browser);
      else pool.release(browser);
    }
  }
});

await pool.start();
assets.listen(4319, "127.0.0.1");
api.listen(config.port, "127.0.0.1", () =>
  console.log(`VisAmp validator listening on http://127.0.0.1:${config.port}`),
);

async function shutdown() {
  api.close();
  assets.close();
  await pool.close();
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
