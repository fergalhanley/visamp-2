// Build first: pnpm --filter @visamp/engine build:validator
// --serve leaves the interactive review page available; otherwise runs checks.
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";

import assert from "node:assert/strict";
import { chromium } from "playwright";

const root = new URL("../../../", import.meta.url);
const reference = (
  await readFile(
    new URL("packages/engine/tests/fixtures/shiftFilter.ts", root),
    "utf8",
  )
)
  .replace(": CanvasRenderingContext2D", "")
  .replace(": number", "");
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    if (path === "/favicon.ico") {
      res.writeHead(204).end();
      return;
    }
    const files = {
      "/": new URL("scramble-harness.html", import.meta.url),
      "/scramble-harness.mjs": new URL("scramble-harness.mjs", import.meta.url),
      "/engine/visamp_2.js": new URL(
        "packages/engine/pkg-validator/visamp_2.js",
        root,
      ),
      "/engine/visamp_2_bg.wasm": new URL(
        "packages/engine/pkg-validator/visamp_2_bg.wasm",
        root,
      ),
    };
    if (path !== "/reference.js" && !files[path]) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader(
      "Content-Type",
      path.endsWith(".wasm")
        ? "application/wasm"
        : path === "/"
          ? "text/html"
          : "text/javascript",
    );
    res.end(path === "/reference.js" ? reference : await readFile(files[path]));
  } catch (error) {
    res.writeHead(500).end(String(error));
  }
});
await new Promise((resolve) =>
  server.listen(process.env.PORT || 4171, "127.0.0.1", resolve),
);
const address = `http://127.0.0.1:${server.address().port}`;
console.log(`Scramble review: ${address}`);
if (!process.argv.includes("--serve")) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
      if (message.text().startsWith("CHECK:")) console.log(message.text());
    });
    await page.goto(address);
    await page.waitForFunction(() => window.scrambleHarness);
    if (!process.argv.includes("--benchmark")) {
      const results = await page.evaluate(async () => {
        const h = window.scrambleHarness;
        const checks = [];
        const base = `render {\n draw::background(color: color::rgb(r: 0.2, g: 0.4, b: 0.6))\n for y in 0..8 {\n for x in 0..16 {\n draw::rect(x: x * $WIDTH / 16.0, y: y * $HEIGHT / 8.0, width: $WIDTH / 16.0, height: $HEIGHT / 8.0, color: color::rgb(r: x / 16.0, g: y / 8.0, b: (x + y) / 24.0))\n }\n }\n EFFECT\n}\n`;
        for (const width of [128, 26, 8, 1]) {
          await h.resize(width, 80);
          h.load(base.replace("EFFECT", ""));
          const source = h.step();
          for (let type = 1; type <= 17; type++) {
            h.load(base.replace("EFFECT", `effect::scramble(type: ${type})`));
            const actual = h.step();
            const reference = h.reference(source, type);
            let max = 0,
              differing = 0;
            for (let i = 0; i < actual.data.length; i++) {
              const delta = Math.abs(actual.data[i] - reference.data[i]);
              max = Math.max(max, delta);
              if (delta > 2) differing++;
            }
            checks.push({
              name: `preset ${type}, ${width}x80`,
              max,
              differing,
            });
            if (width === 128) h.gallery(type, reference, actual);
          }
        }
        await h.resize(640, 360);
        return checks;
      });
      console.log(
        `Preset comparisons: ${results.length}; maximum channel difference: ${Math.max(...results.map((r) => r.max))}`,
      );
      await mkdir("/tmp/vis71-results", { recursive: true });
      await page.screenshot({
        path: "/tmp/vis71-results/preset-parity.png",
        fullPage: true,
      });
      assert.deepEqual(errors, [], "browser errors");
      assert.equal(
        results.filter((r) => r.differing).length,
        0,
        "preset parity (2-byte tolerance for Canvas alpha rounding)",
      );
      console.log(
        "PASS: original preset/channel/boundary parity, including narrow canvases",
      );
      const extended = await page.evaluate(async () => {
        const h = window.scrambleHarness;
        document.querySelector("#gallery").replaceChildren();
        // An asymmetric colour grid exposes channel cycling and every spatial transform.
        const scene = `render {\n for y in 0..16 {\n for x in 0..24 {\n draw::rect(x: x * $WIDTH / 24.0, y: y * $HEIGHT / 16.0, width: $WIDTH / 24.0, height: $HEIGHT / 16.0, color: color::rgb(r: ((x * 7 + y * 3) % 17) / 16.0, g: ((x * 3 + y * 11) % 19) / 18.0, b: ((x * 13 + y * 5) % 23) / 22.0))\n }\n }\n EFFECT\n}\n`;
        let checked = 0;
        for (const [width, height] of [
          [128, 80],
          [129, 81],
          [7, 5],
          [1, 1],
        ]) {
          await h.resize(width, height);
          h.load(scene.replace("EFFECT", ""));
          const source = h.step();
          const outputs = new Set();
          for (let type = 21; type <= 40; type++) {
            const script = scene.replace(
              "EFFECT",
              `effect::scramble(type: ${type})`,
            );
            h.load(script);
            const first = h.step();
            h.load(script);
            const repeat = h.step();
            if (first.data.some((value, i) => value !== repeat.data[i]))
              throw new Error(
                `Nondeterministic preset ${type}, ${width}x${height}`,
              );
            if (first.data.some((value, i) => i % 4 === 3 && value !== 255))
              throw new Error(
                `Opaque edge lost for preset ${type}, ${width}x${height}`,
              );
            if (width >= 128) {
              if (first.data.every((value, i) => value === source.data[i]))
                throw new Error(`Identity preset ${type}`);
              const signature = first.data.join(",");
              if (outputs.has(signature))
                throw new Error(`Duplicate preset ${type}`);
              outputs.add(signature);
            }
            if (width === 128) h.gallery(type, source, first, "input / effect");
            checked++;
          }
        }
        await h.resize(640, 360);
        return { checked, distinct: 20 };
      });
      console.log(
        "PASS: new presets are distinct, deterministic and handle tiny/odd canvases",
        extended,
      );
      await page.screenshot({
        path: "/tmp/vis71-results/new-presets.png",
        fullPage: true,
      });
      const accumulated = await page.evaluate(async () => {
        const h = window.scrambleHarness;
        await h.resize(128, 80);
        let max = 0,
          visibleMax = 0,
          alphaMax = 0,
          totalDelta = 0,
          channels = 0;
        for (let type = 1; type <= 17; type++) {
          h.load(
            `prop t = 0\non_frame {\n t += 1\n}\nrender {\n effect::scramble(type: ${type}, refresh_color: color::rgb(transparent: 0.93))\n draw::rect(x: t * 3, y: 40, width: 12, height: 12, color: $COLOR_RED)\n}\n`,
          );
          const reference = document.createElement("canvas");
          reference.width = 128;
          reference.height = 80;
          const ctx = reference.getContext("2d", { willReadFrequently: true });
          for (let frame = 0; frame < 8; frame++) {
            ctx.fillStyle = "rgba(0,0,0,0.07)";
            ctx.fillRect(0, 0, 128, 80);
            ctx.fillStyle = "red";
            ctx.fillRect((frame + 1) * 3, 40, 12, 12);
            h.shiftFilter(ctx, type);
            const expected = ctx.getImageData(0, 0, 128, 80).data;
            const actual = h.step().data;
            for (let i = 0; i < actual.length; i++) {
              const delta = Math.abs(actual[i] - expected[i]);
              max = Math.max(max, delta);
              totalDelta += delta;
              channels++;
              const pixel = i - (i % 4);
              if (i % 4 === 3) alphaMax = Math.max(alphaMax, delta);
              else
                visibleMax = Math.max(
                  visibleMax,
                  Math.abs(
                    (actual[i] * actual[pixel + 3]) / 255 -
                      (expected[i] * expected[pixel + 3]) / 255,
                  ),
                );
            }
          }
        }
        return { max, visibleMax, alphaMax, mean: totalDelta / channels };
      });
      console.log("Accumulating Canvas2D reference comparison:", accumulated);
      assert(
        accumulated.max <= 2 && accumulated.mean < 0.001,
        "accumulating reference parity (8-bit alpha rounding)",
      );
      const behaviour = await page.evaluate(async () => {
        const h = window.scrambleHarness;
        const ensure = (ok, message) => {
          if (!ok) throw new Error(message);
        };
        const at = (data, x, y) => [
          ...data.data.slice(
            (y * data.width + x) * 4,
            (y * data.width + x) * 4 + 4,
          ),
        ];
        const colours = [
          null,
          "$COLOR_BLACK",
          "color::rgb(transparent: 0.93)",
          "color::rgb(b: 0.2, transparent: 0.93)",
          "color::rgb(transparent: 1.0)",
        ];
        const effect = (type, refresh) =>
          `effect::scramble(type: ${type}${refresh ? `, refresh_color: ${refresh}` : ""})`;
        const moving = (context, type, refresh) =>
          `context ${context}\nprop t = 0\non_frame {\n t += 1\n}\nrender {\n${effect(type, refresh)}\n${context === "3d" ? "camera::orthographic(height: $HEIGHT)\n" : ""}${context === "2d" ? "draw::rect(x: t * 3, y: 40, width: 12, height: 12, color: $COLOR_RED)" : 'draw::sprite(x: t * 3 + 6 - $WIDTH / 2.0, y: $HEIGHT / 2.0 - 46, w: 12, h: 12, color: $COLOR_RED, shading: "unlit")'}\n}\n`;
        await h.resize(128, 80);
        let parityMax = 0;
        for (let type = 1; type <= 40; type++) {
          for (const colour of colours) {
            h.load(moving("2d", type, colour));
            const frames = Array.from({ length: 8 }, () => h.step());
            h.load(moving("3d", type, colour));
            for (let f = 0; f < 8; f++) {
              const actual = h.step();
              for (let i = 0; i < actual.data.length; i++) {
                const delta = Math.abs(actual.data[i] - frames[f].data[i]);
                parityMax = Math.max(parityMax, delta);
                ensure(
                  delta <= 2,
                  `2D/3D mismatch type ${type}, colour ${colour}, frame ${f}, byte ${i}: ${delta}`,
                );
              }
            }
          }
        }
        for (const type of [1, 3, 12, 16]) {
          h.load(
            moving("2d", type, "color::rgb(transparent: 1.0)").replace(
              "$COLOR_RED",
              "color::rgb(r: 1.0, transparent: 0.5)",
            ),
          );
          const frames = Array.from({ length: 8 }, () => h.step());
          h.load(
            moving("3d", type, "color::rgb(transparent: 1.0)").replace(
              "$COLOR_RED",
              "color::rgb(r: 1.0, transparent: 0.5)",
            ),
          );
          for (let f = 0; f < frames.length; f++) {
            const actual = h.step();
            for (let i = 0; i < actual.data.length; i++) {
              ensure(
                Math.abs(actual.data[i] - frames[f].data[i]) <= 2,
                "translucent scene parity",
              );
            }
          }
        }
        console.log("CHECK: moving scenes passed");
        // Measure fade in the untouched top-left boundary, isolated from displacement.
        const fades = [];
        for (const context of ["2d", "3d"]) {
          for (const colour of colours) {
            const values = [];
            for (const fps of [30, 60, 120]) {
              const background =
                context === "2d"
                  ? "draw::background(color: $COLOR_WHITE)"
                  : "gfx::clear(color: $COLOR_WHITE)";
              h.load(
                `context ${context}\nprop t = 0\non_frame {\n t += 1\n}\nrender {\n${effect(3, colour)}\nif t == 1 {\n${background}\n}\n}\n`,
              );
              h.step();
              let data;
              for (let f = 0; f < fps / 2; f++) data = h.step(1000 / fps);
              values.push(at(data, 0, 0));
            }
            const ranges = [0, 1, 2, 3].map(
              (c) =>
                Math.max(...values.map((v) => v[c])) -
                Math.min(...values.map((v) => v[c])),
            );
            ensure(
              Math.max(...ranges) <= 5,
              `fade timing ${context}/${colour}: ${JSON.stringify(values)}`,
            );
            if (!colour || colour === "$COLOR_BLACK")
              ensure(
                values.every((v) => v[0] === 0),
                "opaque refresh clears history",
              );
            else if (colour.includes("1.0"))
              ensure(
                values.every((v) => v[0] === 255 && v[3] === 255),
                "transparent refresh retains history",
              );
            else
              ensure(
                values.every((v) => v[0] > 10 && v[0] < 50),
                "translucent refresh fades history",
              );
            if (colour?.includes("b:"))
              ensure(
                values.every((v) => v[2] > v[0] + 30),
                "coloured refresh fades towards blue",
              );
            fades.push({ context, colour, values });
          }
        }
        console.log("CHECK: fade timing passed");
        // New depth every frame, even if the previous frame ended with depth writes disabled.
        h.load(
          `context 3d\nprop t = 0\non_frame {\n t += 1\n}\nrender {\n${effect(3, "color::rgb(transparent: 1.0)")}\ncamera::orthographic(height: 80)\nif t == 1 {\n draw::sprite(w: 30, h: 30, z: 2, color: $COLOR_RED, shading: "unlit")\n} else {\n draw::sprite(w: 30, h: 30, z: 1, color: $COLOR_GREEN, shading: "unlit")\n draw::sprite(w: 30, h: 30, z: 0, color: $COLOR_BLUE, shading: "unlit")\n}\ngfx::depth(write: false)\ndraw::sprite(x: 50, w: 1, h: 1)\n}\n`,
        );
        h.step();
        ensure(
          at(h.step(), 64, 40)[1] === 255,
          "fresh scene depth and front geometry",
        );
        console.log("CHECK: depth passed");
        // Disable/re-enable, reload, resize and context recreation must discard history.
        for (const context of ["2d", "3d"]) {
          const background =
            context === "2d"
              ? "draw::background(color: $COLOR_RED)"
              : "gfx::clear(color: $COLOR_RED)";
          const script = `context ${context}\nprop t = 0\non_frame {\n t += 1\n}\nrender {\nif t != 2 {\n${effect(3, "color::rgb(transparent: 1.0)")}\n}\nif t == 1 {\n${background}\n}\n}\n`;
          h.load(script);
          h.step();
          h.step();
          ensure(at(h.step(), 0, 0)[3] === 0, "re-enable history reset");
          h.load(script);
          h.step();
          h.load(
            `context ${context}\nrender {\n${effect(3, "color::rgb(transparent: 1.0)")}\n}\n`,
          );
          ensure(at(h.step(), 0, 0)[3] === 0, "reload history reset");
          h.load(script);
          h.step();
          await h.resize(130, 82);
          h.step();
          ensure(at(h.step(), 0, 0)[3] === 0, "resize history reset");
          h.load(script);
          h.step();
          const canvas = document.querySelector("#visamp-stage canvas");
          const gl = canvas.getContext("webgl2");
          const extension = gl.getExtension("WEBGL_lose_context");
          ensure(extension, "context loss extension available");
          const lost = new Promise((resolve) =>
            canvas.addEventListener("webglcontextlost", resolve, {
              once: true,
            }),
          );
          extension.loseContext();
          await lost;
          await new Promise((resolve) => setTimeout(resolve, 100));
          h.step(1000 / 60, false);
          const restored = new Promise((resolve) =>
            canvas.addEventListener("webglcontextrestored", resolve, {
              once: true,
            }),
          );
          extension.restoreContext();
          await Promise.race([
            restored,
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("context restore timeout")),
                5000,
              ),
            ),
          ]);
          h.step();
          ensure(at(h.step(), 0, 0)[3] === 0, "restored context history reset");
          await h.resize(128, 80);
        }
        return {
          movingSceneComparisons: 1600,
          parityMax,
          fades,
          depth: "pass",
          lifecycle: "pass",
        };
      });
      console.log(
        `Moving-scene comparisons: ${behaviour.movingSceneComparisons}; max difference: ${behaviour.parityMax}; fade/depth/lifecycle: pass`,
      );
      assert.deepEqual(errors, [], "browser errors during behaviour checks");
      console.log("PASS: 2D/3D refresh, presets, timing, depth and lifecycle");
      await writeFile(
        "/tmp/vis71-results/checks.json",
        JSON.stringify({ presets: results, accumulated, behaviour }, null, 2),
      );
    }
    const benchmark = [];
    for (const context of ["2d", "3d"]) {
      benchmark.push(
        await page.evaluate(async (context) => {
          const h = window.scrambleHarness;
          document.querySelector("#context").value = context;
          document.querySelector("#preset").value = "3";
          await h.resize(1920, 1080);
          h.load(h.sample(context, 3, "color::rgb(transparent: 0.93)"));
          h.step(1000 / 60, false);
          const gl = document
            .querySelector("#visamp-stage canvas")
            .getContext("webgl2");
          const debug = gl.getExtension("WEBGL_debug_renderer_info");
          const renderer = debug
            ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
            : gl.getParameter(gl.RENDERER);
          let readbacks = 0;
          const readPixels = gl.readPixels;
          const getImageData = CanvasRenderingContext2D.prototype.getImageData;
          gl.readPixels = function (...args) {
            readbacks++;
            return readPixels.apply(this, args);
          };
          CanvasRenderingContext2D.prototype.getImageData = function (...args) {
            readbacks++;
            return getImageData.apply(this, args);
          };
          const durations = [];
          try {
            for (let i = 0; i < 70; i++) {
              const start = h.realNow();
              h.step(1000 / 60, false);
              const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
              gl.flush();
              for (;;) {
                await new Promise((resolve) => setTimeout(resolve, 0));
                const status = gl.clientWaitSync(fence, 0, 0);
                if (
                  status === gl.ALREADY_SIGNALED ||
                  status === gl.CONDITION_SATISFIED
                )
                  break;
                if (status === gl.WAIT_FAILED || h.realNow() - start > 5000)
                  throw new Error("GPU fence failed");
              }
              gl.deleteSync(fence);
              if (i >= 10) durations.push(h.realNow() - start);
            }
          } finally {
            gl.readPixels = readPixels;
            CanvasRenderingContext2D.prototype.getImageData = getImageData;
          }
          durations.sort((a, b) => a - b);
          return {
            context,
            resolution: "1920x1080",
            frames: durations.length,
            renderer,
            measurement: "GPU-fenced frame latency, includes timer polling",
            medianMs: durations[Math.floor(durations.length / 2)],
            p95Ms: durations[Math.floor(durations.length * 0.95)],
            readbacks,
          };
        }, context),
      );
      await page.evaluate(async () => {
        const h = window.scrambleHarness;
        await h.resize(640, 360);
        for (let i = 0; i < 40; i++) h.step(1000 / 60, false);
      });
      await mkdir("/tmp/vis71-results", { recursive: true });
      await page.screenshot({
        path: `/tmp/vis71-results/scramble-${context}.png`,
      });
    }
    console.log(JSON.stringify(benchmark, null, 2));
    await writeFile(
      "/tmp/vis71-results/benchmark.json",
      JSON.stringify(benchmark, null, 2),
    );
    assert(
      benchmark.every((result) => result.readbacks === 0),
      "no steady-state CPU pixel readbacks",
    );
    assert.deepEqual(errors, [], "browser errors");
  } finally {
    await browser.close();
    server.close();
  }
}
