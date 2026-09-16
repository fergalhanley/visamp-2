// Serve the repository after building engine build:validator; open capture.html.
export async function verifyCapture(engine, step, load) {
  const checks = [];
  const assert = (ok, message) => {
    if (!ok) throw Error(message);
  };
  const near = (actual, expected, label) =>
    assert(
      expected.every((v, i) => Math.abs(actual[i] - v) <= 2),
      `${label}: ${actual}, expected ${expected}`,
    );
  const contexts = new Set();
  const capture = async () => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      const context = original.call(this, kind, ...args);
      if (kind === "webgl2" && context) contexts.add(context);
      return context;
    };
    let blob;
    try {
      blob = await engine.capture_frame();
    } finally {
      HTMLCanvasElement.prototype.getContext = original;
    }
    assert(blob instanceof Blob && blob.type === "image/png", "PNG Blob");
    const bitmap = await createImageBitmap(blob);
    assert(
      bitmap.width === 1280 && bitmap.height === 720,
      "fixed capture dimensions",
    );
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return {
      canvas,
      pixel: (x = 640, y = 360) => [...ctx.getImageData(x, y, 1, 1).data],
    };
  };
  load(`context 2d
render {
 effect::filter::brightness(amount: 2.0)
 draw::rect(x: 0, y: 0, width: $WIDTH, height: $HEIGHT, color: color::rgb(r: 0.25))
}`);
  step();
  let shot = await capture();
  near(shot.pixel(1200, 600), [128, 0, 0, 255], "2D dimensions and filters");
  checks.push("2D PNG, dimensions, filters");

  load(`context 3d
prop frames = 0
prop writes = 0
prop values = [0]
on_frame { frames += 1 }
render {
 writes += 1
 values[0] += 1
 camera::orthographic(height: 4.0)
 effect::filter::brightness(amount: 2.0)
 draw::cube(size: 2.0, color: color::rgb(r: 0.25))
}`);
  step();
  const liveCanvas = document.querySelector("#visamp-stage canvas");
  const before = engine.get_properties();
  for (let i = 0; i < 20; i++) {
    shot = await capture();
    near(shot.pixel(), [128, 0, 0, 255], "3D mesh and filter");
    near(shot.pixel(0, 0), [0, 0, 0, 255], "opaque black background");
  }
  assert(
    contexts.size === 1,
    `expected one shared capture WebGL context, got ${contexts.size}`,
  );
  assert(
    engine.get_properties() === before,
    "capture changed live script properties",
  );
  assert(
    document.querySelector("#visamp-stage canvas") === liveCanvas,
    "live canvas replaced",
  );
  assert(
    liveCanvas.width === 640 && liveCanvas.height === 480,
    "live dimensions changed",
  );
  step();
  assert(engine.get_properties() !== before, "animation did not resume");
  const gl = liveCanvas.getContext("webgl2");
  assert(
    !gl.isContextLost() && gl.getError() === gl.NO_ERROR,
    "live WebGL damaged",
  );
  const livePixel = new Uint8Array(4);
  gl.readPixels(320, 240, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, livePixel);
  near(
    [...livePixel],
    [128, 0, 0, 255],
    "live mesh includes the same filter as capture",
  );
  checks.push(
    "3D meshes, filters, opaque background; 20 captures reuse one context; live state/playback preserved",
  );

  engine.set_asset_points(
    "capture-model",
    new Float32Array([-1, 0, 0, 0, 0, 0, 1, 0, 0]),
  );
  engine.set_asset_texture(
    "capture-sprite",
    1,
    1,
    new Uint8Array([0, 255, 0, 128]),
  );
  load(`context 3d
render {
 camera::orthographic(height: 4.0)
 draw::point_cloud(model: asset::model(id: "capture-model"), texture: asset::bitmap(id: "capture-sprite"), size: 40.0)
}`);
  step();
  shot = await capture();
  near(shot.pixel(460), [0, 128, 0, 255], "model point and sprite alpha");
  near(shot.pixel(820), [0, 128, 0, 255], "model point position");
  checks.push("registered model points and textured sprites");

  // A lost offscreen context is recreated on the next capture.
  [...contexts][0].getExtension("WEBGL_lose_context").loseContext();
  shot = await capture();
  near(shot.pixel(), [0, 128, 0, 255], "capture recovered from context loss");
  checks.push("capture context loss recovery");

  load(`context 3d
render {
 for i in 0..1.5 { draw::cube() }
}`);
  let failure;
  try {
    await engine.capture_frame();
  } catch (error) {
    failure = error;
  }
  assert(
    failure instanceof Error,
    "capture rejection must be a JavaScript Error",
  );
  assert(
    failure.message.includes("range end") && failure.message.includes("--> 3:"),
    "capture error lacks reason/location",
  );
  checks.push("failure has Error.message with source location");

  load(
    "context 2d\nrender { draw::rect(width: $WIDTH, height: $HEIGHT, color: $COLOR_CYAN) }",
  );
  step();
  shot = await capture();
  near(shot.pixel(), [0, 255, 255, 255], "2D capture after switching context");
  shot.canvas.style.width = "640px";
  document.body.append(shot.canvas);
  checks.push("2D capture after switching back");
  return { passed: true, checks };
}
