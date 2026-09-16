// Run from point-clouds.html after building the web-target WASM package.
export function verifyPoints(engine, step, load, canvas) {
  const gl = canvas.getContext('webgl2');
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  const pixel = (x = 0, y = 0) => {
    const value = new Uint8Array(4);
    // Tests use an orthographic camera with height 4.
    gl.readPixels(Math.floor(canvas.width/2 + x*canvas.height/4), Math.floor(canvas.height/2 + y*canvas.height/4), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, value);
    return [...value];
  };
  const near = (actual, expected, label) => assert(expected.every((v, i) => Math.abs(actual[i]-v) <= 2), `${label}: ${actual}, expected ${expected}`);
  const render = body => {
    load(`context 3d\nrender {\n camera::orthographic(height: 4.0)\n gfx::clear(color: $COLOR_BLACK)\n ${body}\n}`);
    step();
    assert(gl.getError() === gl.NO_ERROR, 'WebGL error');
  };
  const redCube = 'draw::cube(size: 2.0, color: color::rgb(r: 1.0))';
  render(`${redCube}\n draw::point_cloud(count: 1, z: 1.0, color: color::rgb(g: 1.0), size: 20.0)\n draw::cube(z: -1.0, size: 2.0, color: color::rgb(b: 1.0))`);
  near(pixel(), [0,255,0,255], 'mesh/point/mesh depth');
  render(`gfx::depth(enabled: false, write: false)\n ${redCube}\n draw::point_cloud(count: 1, color: color::rgb(g: 1.0), size: 20.0)\n draw::cube(size: 2.0, color: color::rgb(b: 1.0))`);
  near(pixel(), [0,0,255,255], 'mesh program restored after points');
  render(`${redCube}\n draw::point_cloud(count: 1, z: 1.0, color: color::rgb(g: 1.0, a: 0.5), size: 20.0)`);
  near(pixel(), [128,128,0], 'alpha blending');
  for (const color of ['color::rgb(g: 1.0, a: 1.0 - ($POINT_INDEX + 0.5))', 'color::hsl(h: 1.0 / 3.0, s: 1.0, l: 0.5, a: 1.0 - ($POINT_INDEX + 0.5))']) {
    render(`${redCube}\n draw::point_cloud(count: 1, z: 1.0, color: ${color}, size: 20.0)`);
    near(pixel(), [128,128,0], 'dependent alpha matches scalar blending');
  }

  render(`draw::point_cloud(count: 3, x: $POINT_INDEX - 1.0, color: color::hsl(h: $POINT_INDEX / 3.0, s: 1.0, l: 0.5), size: 20.0)`);
  near(pixel(-1), [255,0,0,255], 'HSL red');
  near(pixel(0), [0,255,0,255], 'HSL green');
  near(pixel(1), [0,0,255,255], 'HSL blue');
  render(`let a = [0.5]\n draw::point_cloud(count: 1, color: color::rgb(r: a[$POINT_INDEX], g: a[$POINT_INDEX - 1], b: a[$POINT_INDEX + 0.5]), size: 20.0)`);
  near(pixel(), [128,0,0,255], 'numeric arrays and invalid indices');
  render(`transform::translate(x: 1.0)\n draw::point_cloud(count: 1, size: 20.0)`);
  near(pixel(0), [0,0,0,255], 'point moved from origin');
  near(pixel(1), [255,255,255,255], 'point transform');
  render(`draw::point_cloud(count: 1, x: 1.0 / ($POINT_INDEX - $POINT_INDEX), size: 20.0)`);
  near(pixel(), [0,0,0,255], 'nonfinite point culled');
  render(`draw::point_cloud(count: 1, size: 0.0)`);
  near(pixel(), [0,0,0,255], 'zero size');

  render(`camera::perspective(fov_deg: 60.0)\n draw::point_cloud(count: 1, size: 1.0, size_attenuation: true)`);
  const row = new Uint8Array(canvas.width * 4);
  gl.readPixels(0, Math.floor(canvas.height/2), canvas.width, 1, gl.RGBA, gl.UNSIGNED_BYTE, row);
  let litPixels = 0;
  for (let x=0; x<canvas.width; x++) if (row[x*4] > 0) litPixels++;
  const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
  const expectedSize = Math.max(range[0], Math.min(range[1], canvas.height / 20));
  assert(Math.abs(litPixels - expectedSize) <= 1, `attenuated size: ${litPixels}, expected ${expectedSize}`);

  const arrayScene = `context 3d
prop bands = []
on_init { bands = array::filled(count: 1, value: -1) }
on_frame {
 if $FREQUENCY_DATA[0] > 0 { bands[0] = $FREQUENCY_DATA[0] }
}
render {
 camera::orthographic(height: 4.0)
 draw::point_cloud(count: 1, size: 20.0, color: color::rgb(r: bands[$POINT_INDEX] / 255.0))
}`;
  load(arrayScene);
  engine.set_audio_frame(new Uint8Array(), new Uint8Array([100]), false);
  step();
  near(pixel(), [100,0,0,255], 'array state reaches GPU');
  engine.set_audio_frame(new Uint8Array(), new Uint8Array([0]), false);
  step();
  near(pixel(), [100,0,0,255], 'array state survives silence');
  load(arrayScene);
  step();
  near(pixel(), [0,0,0,255], 'on_init resets array on reload');

  engine.set_asset_points('model', new Float32Array([-1,0,0, 0,0,0, 1,0,0]));
  const model = 'model: asset::model(id: "model")';
  render(`draw::point_cloud(${model}, size: 20.0)`);
  near(pixel(-1), [255,255,255,255], 'model default positions');
  near(pixel(1), [255,255,255,255], 'model default count');
  render(`draw::point_cloud(${model}, x: $MODEL_X[($POINT_INDEX+1)%$POINT_COUNT], y: $POINT_Y, z: $POINT_Z, size: $POINT_INDEX * 10.0, color: color::rgb(g: 1.0))`);
  near(pixel(0), [0,0,0,255], 'zero per-point size culled');
  near(pixel(1), [0,255,0,255], 'neighbour lookup and per-point size');
  render(`draw::point_cloud(${model}, size: 1.0/($POINT_INDEX-$POINT_INDEX))`);
  near(pixel(-1), [0,0,0,255], 'nonfinite per-point size culled');

  // Transparent texels must leave depth untouched, so the later cube is visible.
  engine.set_asset_texture('sprite', 1, 1, new Uint8Array([255,255,255,0]));
  render(`draw::point_cloud(count: 1, texture: asset::bitmap(id: "sprite"), z: 1.0, size: 20.0)\n ${redCube}`);
  near(pixel(), [255,0,0,255], 'transparent sprite does not write depth');
  engine.set_asset_texture('sprite', 1, 1, new Uint8Array([255,255,255,128]));
  render(`${redCube}\n draw::point_cloud(count: 1, texture: asset::bitmap(id: "sprite"), z: 1.0, size: 20.0, color: color::rgb(g: 1.0))`);
  near(pixel(), [127,128,0], 'sprite alpha and tint');
  render(`draw::point_cloud(count: 1, texture: asset::bitmap(id: "sprite"), alpha_test: 0.6, z: 1.0, size: 20.0)\n ${redCube}`);
  near(pixel(), [255,0,0,255], 'alpha test does not write depth');

  let modelUploads = 0, deletes = 0;
  const upload = gl.texImage2D.bind(gl), remove = gl.deleteTexture.bind(gl);
  gl.texImage2D = (...args) => { if (args[2] === gl.RGBA32F) modelUploads++; upload(...args); };
  gl.deleteTexture = texture => { deletes++; remove(texture); };
  try {
    load(`context 3d\nrender { camera::orthographic(height: 4.0)\n gfx::clear(color: $COLOR_BLACK)\n draw::point_cloud(${model}, size: 20.0, y: math::sin(rad: $TIME_SEC)*0.01) }`);
    for (let i=0; i<20; i++) step();
    assert(modelUploads === 1, `model should upload once, got ${modelUploads}`);
    engine.set_asset_points('model', new Float32Array([1,0,0]));
    step();
    near(pixel(-1), [0,0,0,255], 'replaced model removes old points');
    near(pixel(1), [255,255,255,255], 'replacement model renders');
    assert(modelUploads === 2 && deletes > 0, 'model replacement must replace GPU texture');
    engine.clear_assets();
    step();
    near(pixel(1), [0,0,0,255], 'clear_assets removes points');
    render(`draw::point_cloud(count: 1, texture: asset::bitmap(id: "sprite"), size: 20.0)`);
    near(pixel(), [0,0,0,255], 'missing sprite skips draw');
  } finally {
    gl.texImage2D = upload;
    gl.deleteTexture = remove;
  }

  let draws = [], links = 0;
  const draw = gl.drawArrays.bind(gl), link = gl.linkProgram.bind(gl);
  gl.drawArrays = (mode, first, count) => { draws.push({mode, count}); draw(mode, first, count); };
  gl.linkProgram = p => { links++; link(p); };
  try {
    load(`context 3d\nrender {\n draw::point_cloud(count: 147456, x: ($POINT_INDEX % 384) / 38.4 - 5.0, y: math::sin(rad: $POINT_INDEX / 384.0 + $FRAME_COUNT / 60.0), z: $POINT_INDEX / 147456.0, color: color::rgb(r: $FREQUENCY_DATA[$POINT_INDEX % 384] / 255.0))\n}`);
    engine.set_audio_frame(new Uint8Array(), new Uint8Array(384).fill(128), false);
    step();
    const initialLinks = links;
    for (let i=0; i<20; i++) {
      draws = [];
      engine.set_audio_frame(new Uint8Array(), new Uint8Array(384).fill(i*10), false);
      step();
      assert(draws.length === 1 && draws[0].mode === gl.POINTS && draws[0].count === 147456, 'full density must be one POINTS draw');
    }
    assert(links === initialLinks, 'frame/audio changes recompiled the shader');
    assert(gl.getError() === gl.NO_ERROR, 'full-density WebGL error');
    return {passed: true, pixelCases: 21, animatedFrames: 21, pointsPerDraw: 147456, shaderRecompiles: 0, modelUploadsAcross20Frames: 1};
  } finally {
    gl.drawArrays = draw;
    gl.linkProgram = link;
  }
}
