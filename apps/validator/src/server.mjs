import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BrowserPool, PoolCapacityError } from "./browser-pool.mjs";
import { config } from "./config.mjs";
import { validate } from "./validator.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const engineRoot = path.resolve(here, "../../../packages/engine/pkg-validator");
const pool = new BrowserPool(config.poolSize, {
  maxQueue: config.maxQueue,
  queueWaitMs: config.queueWaitMs,
});

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(response, status, body, contentType = "application/json") {
  response.writeHead(status, { "content-type": contentType });
  response.end(typeof body === "string" ? body : JSON.stringify(body));
}

async function body(request) {
  const contentLength = Number(request.headers["content-length"] ?? 0);
  if (contentLength > 400_000)
    throw new RequestError(413, "request body exceeds 400 KB");
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 400_000)
      throw new RequestError(413, "request body exceeds 400 KB");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestError(400, "request body must be valid JSON");
  }
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
    return staticFile(
      response,
      path.join(here, "harness.mjs"),
      "text/javascript",
    );
  if (pathname.startsWith("/engine/")) {
    const name = path.basename(pathname);
    const type = name.endsWith(".wasm")
      ? "application/wasm"
      : "text/javascript";
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
      throw new RequestError(400, "script must be a non-empty string");
    if (payload.script.length > 200_000)
      throw new RequestError(413, "script exceeds 200,000 characters");
    browser = await pool.acquire();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("validation wall-clock limit exceeded")),
        config.wallClockMs,
      );
    });
    const result = await Promise.race([
      validate(browser, payload.script, config),
      timeout,
    ]).finally(() => clearTimeout(timer));
    send(response, 200, result);
  } catch (error) {
    recycle = Boolean(browser);
    const status =
      error instanceof RequestError
        ? error.status
        : error instanceof PoolCapacityError
          ? 503
          : 422;
    if (error instanceof PoolCapacityError)
      response.setHeader("retry-after", "5");
    send(response, status, { ok: false, error: error.message });
  } finally {
    if (browser) {
      if (recycle) void pool.replace(browser);
      else pool.release(browser);
    }
  }
});

api.headersTimeout = 5_000;
api.requestTimeout = 5_000;
api.maxConnections = config.poolSize + config.maxQueue + 4;

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
