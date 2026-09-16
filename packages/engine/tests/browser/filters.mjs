export async function verifyFilters(engine, load, step) {
  const checks = [];
  const assert = (ok, msg) => {
    if (!ok) throw Error(msg);
  };
  const near = (actual, expected, label, tolerance = 3) =>
    assert(
      expected.every((n, i) => Math.abs(n - actual[i]) <= tolerance),
      `${label}: ${actual} != ${expected}`,
    );
  const live = (x = 640, y = 360) => {
    const canvas = document.querySelector("#visamp-stage canvas");
    assert(
      !canvas.style.filter || canvas.style.filter === "none",
      "CSS filter still used",
    );
    const gl = canvas.getContext("webgl2");
    assert(gl && gl.getError() === gl.NO_ERROR, "WebGL error before read");
    const p = new Uint8Array(4);
    gl.readPixels(x, canvas.height - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
    assert(gl.getError() === gl.NO_ERROR, "WebGL read error");
    return [...p];
  };
  const capture = async () => {
    const b = await createImageBitmap(await engine.capture_frame());
    const c = document.createElement("canvas");
    c.width = b.width;
    c.height = b.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(b, 0, 0);
    b.close();
    return (x = 640, y = 360) => [...ctx.getImageData(x, y, 1, 1).data];
  };
  const cases = [
    ["brightness(amount: 2)", [102, 204, 255]],
    ["contrast(amount: 0.5)", [89, 115, 140]],
    ["saturate(amount: 0)", [95, 95, 95]],
    ["grayscale(amount: 1)", [95, 95, 95]],
    ["invert(amount: 1)", [204, 153, 102]],
    ["opacity(amount: 0.5)", [26, 51, 77]],
    ["sepia(amount: 1)", [127, 113, 88]],
    ["hue_rotate(deg: 180)", [138, 87, 36]],
    ["blur(radius: 4)", [51, 102, 153]],
  ];
  for (const mode of ["2d", "3d"]) {
    for (const [effect, expected] of cases) {
      load(
        `context ${mode} render {draw::background(color: color::rgb(r: 0.2,g: 0.4,b: 0.6)) effect::filter::${effect}}`,
      );
      step();
      const pixel = live();
      near(pixel, expected, `${mode} live ${effect}`);
      const shot = await capture();
      near(shot(), expected, `${mode} capture ${effect}`);
    }
    load(
      `context ${mode} render {draw::background(color: color::rgb(r: 0.8,g: 0.4,b: 0.2,a: 0.5)) effect::filter::brightness(amount: 2) effect::filter::opacity(amount: 0.5)}`,
    );
    step();
    near(live(), [64, 51, 26], `${mode} premultiplied alpha`);
    near((await capture())(), [64, 51, 26], `${mode} capture alpha`);
    for (const [effects, expected] of [
      ["brightness(amount: 2) effect::filter::invert(amount: 1)", [153, 51, 0]],
      [
        "invert(amount: 1) effect::filter::brightness(amount: 2)",
        [255, 255, 204],
      ],
    ]) {
      load(
        `context ${mode} render {draw::background(color: color::rgb(r: 0.2,g: 0.4,b: 0.6)) effect::filter::${effects}}`,
      );
      step();
      near(live(), expected, "ordered filters");
      near((await capture())(), expected, "ordered capture");
    }
    checks.push(`${mode}: all nine filters, order, alpha and capture parity`);
  }
  // Blur a transparent shape: check energy beyond its boundary, symmetry, and no dark colour fringe.
  for (const radius of [4, 24, 96]) {
    load(
      `render {draw::clear() draw::rect(x: 600,y: 320,width: 80,height: 80,color: $COLOR_RED) effect::filter::blur(radius: ${radius})}`,
    );
    step();
    const left = live(595, 360),
      right = live(684, 360);
    assert(left[0] > 0, "blur did not extend beyond shape");
    near(left, right, "blur symmetry", 5);
    near(left.slice(1, 3), [0, 0], "blur colour fringe");
    const shot = await capture();
    near(
      shot(595, 360).slice(0, 3),
      left.slice(0, 3),
      "blur capture parity",
      3,
    );
  }
  checks.push(
    "small/large Gaussian blur, transparent edges and capture parity",
  );
  // Multiple blurs and colour adjustments exercise ping-pong target reuse.
  load(
    "render {draw::background(color: $COLOR_CORAL) effect::filter::blur(radius: 3) effect::filter::invert(amount: 1) effect::filter::blur(radius: 25) effect::filter::opacity(amount: 0.5)}",
  );
  step();
  const combined = live();
  near(
    (await capture())().slice(0, 3),
    combined.slice(0, 3),
    "combined blur chain",
  );
  load(
    "context 3d render {draw::background(color: $COLOR_BLACK) gfx::overlay(enabled: true) draw::rect(x: 600,y: 320,width: 80,height: 80,color: $COLOR_RED) effect::filter::invert(amount: 1)}",
  );
  step();
  near(live(), [0, 255, 255], "overlay filtered");
  near((await capture())(), [0, 255, 255], "overlay capture filtered");
  checks.push("combined blur chain and final overlay");
  // Preserved Canvas2D source accumulates drawings, but never filtered pixels.
  load(
    "prop frame=0 on_frame {frame+=1} render {if frame==1 {draw::rect(x: 20,y: 20,width: 100,height: 100,color: color::rgb(r: 0.25))} effect::filter::brightness(amount: 2)}",
  );
  step();
  near(live(50, 50), [128, 0, 0], "first trail frame");
  for (let i = 0; i < 4; i++) step();
  near(live(50, 50), [128, 0, 0], "trail got repeatedly filtered");
  checks.push("2D accumulation remains unfiltered");
  // Compare identical scramble simulations with/without a changing final filter.
  const history = (withFilter) =>
    `prop frame=0 on_frame {frame+=1} render {effect::scramble(type: 18,refresh_color: color::rgb(a: 0)) if frame==1 {draw::rect(x: 620,y: 340,width: 40,height: 40,color: $COLOR_RED)} ${withFilter ? "if frame<3 {effect::filter::invert(amount: 1)}" : ""}}`;
  const sequence = [];
  for (const filtered of [false, true]) {
    load(history(filtered));
    for (let i = 0; i < 4; i++) step();
    sequence.push(live(640, 360));
  }
  near(sequence[0], sequence[1], "filters contaminated feedback");
  checks.push("scramble history excludes filters");
  // Conditional calls/function detection and resizing.
  load(
    "prop enabled=true fn apply(enabled: true){if enabled {effect::filter::invert(amount: 1)}} render {draw::background(color: $COLOR_RED) apply(enabled: enabled)}",
  );
  step();
  near(live(), [0, 255, 255], "function filter");
  const host = document.querySelector("#visamp-stage");
  host.style.width = "320px";
  host.style.height = "180px";
  await new Promise((r) => setTimeout(r, 70));
  step();
  near(live(160, 90), [0, 255, 255], "resized output");
  assert((await capture())(640, 360)[1] === 255, "capture after resize");
  checks.push("function detection, resize and fixed capture size");
  // Cached render targets and shaders must survive repeated frames.
  load(
    "render {draw::background(color: $COLOR_RED) effect::filter::blur(radius: 24) effect::filter::brightness(amount: 0.5)}",
  );
  step();
  const texture = WebGL2RenderingContext.prototype.createTexture,
    program = WebGL2RenderingContext.prototype.createProgram;
  let textures = 0,
    programs = 0;
  WebGL2RenderingContext.prototype.createTexture = function (...a) {
    textures++;
    return texture.apply(this, a);
  };
  WebGL2RenderingContext.prototype.createProgram = function (...a) {
    programs++;
    return program.apply(this, a);
  };
  try {
    for (let i = 0; i < 20; i++) step();
  } finally {
    WebGL2RenderingContext.prototype.createTexture = texture;
    WebGL2RenderingContext.prototype.createProgram = program;
  }
  assert(
    textures === 0 && programs === 0,
    `per-frame GPU allocation: ${textures} textures / ${programs} programs`,
  );
  checks.push("20 stable frames reuse textures and shaders");
  const gl = host.querySelector("canvas").getContext("webgl2"),
    extension = gl.getExtension("WEBGL_lose_context");
  assert(extension, "context loss extension unavailable");
  extension.loseContext();
  await new Promise((r) => setTimeout(r, 50));
  extension.restoreContext();
  await new Promise((r) => setTimeout(r, 80));
  step();
  near(live(160, 90), [128, 0, 0], "restored filtered output", 4);
  checks.push("live context loss recreates post-processing");
  // Filter operation errors preserve statement locations.
  const source =
    "render {\n effect::filter::blur(radius: math::sqrt(value: -1))\n}";
  load(source);
  let error = "";
  try {
    step();
  } catch (e) {
    error = String(e);
  }
  assert(
    error.includes("2:2") && error.includes("finite"),
    "missing located filter error",
  );
  checks.push("located invalid filter values");
  return { passed: true, checks };
}
