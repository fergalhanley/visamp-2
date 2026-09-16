export async function verifyEffects(engine, load, step) {
  const checks = [];
  const assert = (ok, message) => {
    if (!ok) throw Error(message);
  };
  const near = (a, b, message, tolerance = 3) =>
    assert(
      a.every((n, i) => Math.abs(n - b[i]) <= tolerance),
      `${message}: ${a} != ${b}`,
    );
  const live = () => {
    const c = document.querySelector("#visamp-stage canvas"),
      gl = c.getContext("webgl2");
    assert(gl && gl.getError() === gl.NO_ERROR, "WebGL valid");
    const bytes = new Uint8Array(c.width * c.height * 4);
    gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    assert(gl.getError() === gl.NO_ERROR, "read pixels");
    return (x, y) => [
      ...bytes.slice(
        ((c.height - 1 - y) * c.width + x) * 4,
        ((c.height - 1 - y) * c.width + x) * 4 + 4,
      ),
    ];
  };
  const capture = async () => {
    const image = await createImageBitmap(await engine.capture_frame()),
      c = document.createElement("canvas");
    c.width = image.width;
    c.height = image.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(image, 0, 0);
    image.close();
    const bytes = ctx.getImageData(0, 0, c.width, c.height).data;
    return (x, y) => [
      ...bytes.slice((y * c.width + x) * 4, (y * c.width + x) * 4 + 4),
    ];
  };
  const pattern = `draw::background(color: color::rgb(r: 0.03,g: 0.04,b: 0.06))
    for i in 0..17 {draw::rect(x: i * 77, y: i * 13, width: 35, height: $HEIGHT, color: color::hsl(h: i / 17, s: 0.8, l: 0.55))}
    draw::circle(x: 300,y: 200,radius: 91,color: $COLOR_WHITE)
    draw::rect(x: 700,y: 93,width: 311,height: 19,color: $COLOR_TURQUOISE)`;
  const script = (mode, effect, body = pattern) =>
    `context ${mode} render {${mode === "3d" ? "gfx::overlay(enabled: true)" : ""} ${body} ${effect}}`;
  const probes = [];
  for (let y = 11; y < 720; y += 37)
    for (let x = 13; x < 1280; x += 41) probes.push([x, y]);
  engine.set_asset_texture(
    "effect-map",
    2,
    2,
    new Uint8Array([
      255, 128, 0, 255, 0, 128, 0, 255, 128, 255, 0, 255, 128, 0, 0, 255,
    ]),
  );
  const cases = [
    "kaleidoscope(segments: 8)",
    "kaleidoscope(segments: 8,branches: 4,rad: 0.3)",
    "swirl(radius: 500,rad: 2)",
    "pixelate(size: 31)",
    "pixelate_rect(width: 37,height: 19,deg: 17)",
    "pixelate_circle(size: 23,gap: 7,gap_color: color::rgb(b: 0.2))",
    "pixelate_triangle(side_length: 39,rad: 0.2,gap: 3)",
    "pixelate_pentagon(side_length: 24,gap: 3,rad: 0.4)",
    "pixelate_hexagon(side_length: 21,gap: 4,rad: 0.1)",
    "pixelate_pentagram(size: 37,gap: 3,rad: 0.2)",
    "pixelate_hexagram(size: 37,gap: 3,rad: 0.2)",
    'mirror(axis: "both")',
    "posterize(levels: 3)",
    "chromatic_aberration(amount: 13,deg: 30)",
    "vignette(amount: 0.8)",
    "ripple(wavelength: 73,amplitude: 18,phase: 0.2)",
    "scanlines(spacing: 13,amount: 0.7,deg: 4)",
    "bloom(threshold: 0.3,intensity: 2,radius: 18)",
    'displace(map: asset::bitmap(id: "effect-map"),amount: 85)',
  ];
  for (const mode of ["2d", "3d"]) {
    load(script(mode, "effect::filter::brightness(amount: 1)"));
    step();
    const base = live();
    for (const call of cases) {
      load(script(mode, `effect::${call}`));
      step();
      const actual = live(),
        png = await capture();
      let changed = 0;
      for (const [x, y] of probes) {
        const p = actual(x, y);
        near(
          p.map((v, i) => (i === 3 ? 255 : v)),
          png(x, y),
          `${mode} capture ${call} at ${x},${y}`,
        );
        if (p.some((v, i) => v !== base(x, y)[i])) changed++;
      }
      assert(changed > 3, `${mode} effect did not change image: ${call}`);
    }
    checks.push(
      `${mode}: all new effects change pixels and match PNG captures`,
    );
  }
  for (const call of [
    "swirl(rad: 0)",
    "ripple(amplitude: 0)",
    "chromatic_aberration(amount: 0)",
    "bloom(intensity: 0)",
    'displace(map: asset::bitmap(id: "effect-map"),amount: 0)',
  ]) {
    load(script("2d", "effect::filter::brightness(amount: 1)"));
    step();
    const base = live();
    load(script("2d", `effect::${call}`));
    step();
    const actual = live();
    for (const [x, y] of probes)
      near(actual(x, y), base(x, y), `identity ${call}`, 0);
  }
  checks.push("neutral effects are identity transforms");
  for (const call of [
    "pixelate_triangle(side_length: 37)",
    "pixelate_hexagon(side_length: 23)",
  ]) {
    load(
      script("2d", `effect::${call}`, "draw::background(color: $COLOR_WHITE)"),
    );
    step();
    const p = live();
    for (const [x, y] of probes)
      near(p(x, y), [255, 255, 255, 255], `gapless tiling ${call}`, 0);
  }
  load(
    script(
      "2d",
      "effect::pixelate_circle(size: 20,gap: 10,gap_color: color::rgb(b: 1,a: 0.5))",
      "draw::background(color: $COLOR_RED)",
    ),
  );
  step();
  near(live()(0, 0), [0, 0, 128, 128], "gap premultiplied colour");
  near(live()(15, 15), [255, 0, 0, 255], "cell centre");
  checks.push("gapless triangle/hexagon tilings and translucent circle gaps");
  const solid = "draw::background(color: color::rgb(r: 0.4,g: 0.4,b: 0.4))";
  load(
    script(
      "2d",
      "effect::posterize(levels: 2) effect::filter::brightness(amount: 2)",
      solid,
    ),
  );
  step();
  near(live()(500, 300), [0, 0, 0, 255], "posterize then brighten");
  load(
    script(
      "2d",
      "effect::filter::brightness(amount: 2) effect::posterize(levels: 2)",
      solid,
    ),
  );
  step();
  near(live()(500, 300), [255, 255, 255, 255], "brighten then posterize");
  for (const radius of [0, 4, 32, 96]) {
    load(
      script(
        "2d",
        `effect::bloom(threshold: 0,intensity: 2,radius: ${radius}) effect::bloom(radius: 4) effect::filter::blur(radius: 2)`,
        "draw::rect(x: 600,y: 300,width: 40,height: 80,color: $COLOR_WHITE)",
      ),
    );
    step();
    assert(live()(620, 340)[0] > 240, `bloom retains base at radius ${radius}`);
    if (radius > 0)
      assert(live()(595, 340)[0] > 0, `bloom spreads at radius ${radius}`);
  }
  checks.push("mixed ordering, repeated bloom and blur, transparent glow");
  load(
    script(
      "2d",
      'effect::displace(map: asset::bitmap(id: "effect-map"),amount: 100)',
    ),
  );
  step();
  const before = live();
  engine.clear_assets();
  engine.set_asset_texture("effect-map", 1, 1, new Uint8Array([0, 0, 0, 255]));
  step();
  const after = live();
  assert(
    probes.some(([x, y]) => before(x, y).some((n, i) => n !== after(x, y)[i])),
    "map refreshed after clear/re-register",
  );
  engine.set_asset_texture(
    "effect-map",
    1,
    1,
    new Uint8Array([255, 255, 0, 255]),
  );
  step();
  const updated = live();
  assert(
    probes.some(([x, y]) => updated(x, y).some((n, i) => n !== after(x, y)[i])),
    "map refreshed after version change",
  );
  load(
    script(
      "2d",
      'effect::displace(map: asset::bitmap(id: "effect-map"),amount: 10) effect::bloom(radius: 24)',
    ),
  );
  step();
  const gl = document
    .querySelector("#visamp-stage canvas")
    .getContext("webgl2");
  const create = gl.createTexture;
  let allocations = 0;
  gl.createTexture = function (...a) {
    allocations++;
    return create.apply(this, a);
  };
  try {
    for (let i = 0; i < 10; i++) step();
  } finally {
    gl.createTexture = create;
  }
  assert(allocations === 0, "stable effects reuse GPU textures");
  checks.push(
    "displacement version/clear invalidation and steady GPU resource reuse",
  );
  load(script("2d", "effect::filter::brightness(amount: 1)"));
  step();
  const original = live();
  load(script("2d", 'effect::mirror(axis: "both")'));
  step();
  const mirrored = live();
  near(
    mirrored(1000, 600),
    original(279, 119),
    "mirror reads top-left quadrant",
    0,
  );
  engine.set_asset_texture(
    "effect-map",
    1,
    1,
    new Uint8Array([255, 0, 0, 255]),
  );
  load(
    script(
      "2d",
      'effect::displace(map: asset::bitmap(id: "effect-map"),amount: 20)',
    ),
  );
  step();
  near(
    live()(300, 220),
    original(320, 200),
    "map red/green coordinate direction",
  );
  load(script("2d", "effect::swirl(x: 640,y: 360,radius: 100,rad: 3)"));
  step();
  near(
    live()(300, 220),
    original(300, 220),
    "swirl outside radius unchanged",
    0,
  );
  for (const branches of [1, 2, 3, 4, 5, 6]) {
    load(
      script("2d", `effect::kaleidoscope(segments: 8,branches: ${branches})`),
    );
    step();
    const p = live();
    near(p(900, 400), p(900, 319), "kaleidoscope reflection symmetry");
    near(p(900, 400), p(599, 620), "kaleidoscope rotational symmetry");
  }
  for (const segments of [2, 3, 64]) {
    load(
      script("2d", `effect::kaleidoscope(segments: ${segments},branches: 6)`),
    );
    step();
    live();
  }
  checks.push(
    "mirror/displacement direction, swirl boundary, kaleidoscope symmetry and count boundaries",
  );
  load(
    script(
      "3d",
      'effect::displace(map: asset::bitmap(id: "effect-map"),amount: 10) effect::bloom(radius: 24)',
      "draw::background(color: $COLOR_RED)",
    ),
  );
  step();
  const host = document.querySelector("#visamp-stage");
  host.style.width = "641px";
  host.style.height = "359px";
  window.dispatchEvent(new Event("resize"));
  await new Promise((r) => setTimeout(r, 100));
  step();
  near(
    live()(320, 179),
    [255, 0, 0, 255],
    "bloom/displacement after odd resize",
  );
  const canvas = document.querySelector("#visamp-stage canvas");
  const context = canvas.getContext("webgl2"),
    loss = context.getExtension("WEBGL_lose_context");
  assert(loss, "context loss available");
  const lost = new Promise((r) =>
    canvas.addEventListener("webglcontextlost", r, { once: true }),
  );
  loss.loseContext();
  await lost;
  await new Promise((r) => setTimeout(r, 100));
  const restored = new Promise((r) =>
    canvas.addEventListener("webglcontextrestored", r, { once: true }),
  );
  loss.restoreContext();
  await Promise.race([
    restored,
    new Promise((_, reject) =>
      setTimeout(() => reject(Error("restore timeout")), 5000),
    ),
  ]);
  step();
  near(
    live()(320, 179),
    [255, 0, 0, 255],
    "bloom/displacement after context recreation",
  );
  near(
    (await capture())(640, 360),
    [255, 0, 0, 255],
    "capture after effect context recreation",
  );
  checks.push("bloom/displacement resize and context recovery");
  return { passed: true, checks };
}
