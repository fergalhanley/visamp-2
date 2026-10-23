// Executes the real WASM interpreter against a recording Canvas2D stub. These
// tests verify command parity and lifecycle, not browser pixels or physical HDR.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

test('live WASM records all HDR drawing operations, rotation, assets and reloads', async () => {
  const dom = new JSDOM('<div id="visamp-stage"></div>', { url: 'http://localhost/' });
  const { window } = dom;
  for (const key of ['window', 'document', 'Window', 'Document', 'HTMLCanvasElement', 'HTMLElement', 'Element']) globalThis[key] = key === 'window' ? window : window[key];
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { get: () => 640 });
  Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { get: () => 360 });
  const frames = [], paints = [];
  window.requestAnimationFrame = cb => (frames.push(cb), frames.length);
  class CanvasRenderingContext2D {
    constructor(canvas) { this.canvas = canvas; }
    save() {} restore() {} resetTransform() {} setTransform() {} translate() {} rotate() {}
    clearRect() {} fillRect() { paints.push('background'); }
    beginPath() {} moveTo() {} lineTo() {} closePath() {}
    fill() { paints.push('fill'); } stroke() { paints.push('stroke'); }
    fillText() { paints.push('text'); } drawImage() { paints.push('image'); }
    putImageData() {}
    createLinearGradient() { return { addColorStop() {} }; }
    createRadialGradient() { return { addColorStop() {} }; }
  }
  class ImageData { constructor(data, width, height) { Object.assign(this, { data, width, height }); } }
  globalThis.ImageData = window.ImageData = ImageData;
  globalThis.CanvasRenderingContext2D = window.CanvasRenderingContext2D = CanvasRenderingContext2D;
  window.HTMLCanvasElement.prototype.getContext = function(kind) {
    assert.equal(kind, '2d');
    return this.ctx ??= new CanvasRenderingContext2D(this);
  };
  try {
    const bindings = await import('../../../packages/engine/pkg/visamp_2_bg.js');
    const { instance } = await WebAssembly.instantiate(readFileSync(new URL('../../../packages/engine/pkg/visamp_2_bg.wasm', import.meta.url)), { './visamp_2_bg.js': bindings });
    bindings.__wbg_set_wasm(instance.exports);
    instance.exports.__wbindgen_start();
    const lines = readFileSync(new URL('../../../dev/hdr-2d-lines.viscript', import.meta.url), 'utf8');
    assert.equal(bindings.validate_script(lines), '');
    // This stub has no WebGL. Exercise the exact drawing loop in real WASM;
    // renderer tests separately verify the four-effect chain and GPU pass count.
    const drawing = lines.replace(/^\s*effect::.*$/gm, '');
    const sdr = drawing.replaceAll(', intensity: hdr_intensity', '');
    assert.equal(bindings.load_script(sdr), '');
    assert.equal(bindings.get_hdr_2d_requested(), false);
    bindings.set_animation_time(Math.PI / 2 / 0.0001);
    frames.shift()(0);
    assert.equal(bindings.get_last_error(), '');
    assert.equal(paints.filter(p => p === 'stroke').length, 640);
    assert.equal(JSON.parse(bindings.get_hdr_2d_snapshot()).sequence, 0);
    assert.equal(bindings.load_script(drawing), '');
    assert.equal(bindings.get_hdr_2d_requested(), true);
    bindings.set_hdr_2d_recording(true);
    frames.shift()(16);
    const dense = JSON.parse(bindings.get_hdr_2d_snapshot());
    assert.equal(dense.commands.length, 641);
    assert.equal(dense.clearScene, false);
    for (const c of dense.commands.slice(1)) {
      assert.equal(c.kind, 'path'); assert.equal(c.points.length, 2);
      assert.equal(c.stroke.cap, 'butt'); assert.ok(c.stroke.width < 1);
      assert.equal(c.intensity, 3);
    }
    bindings.set_hdr_2d_recording(false);
    frames.shift()(32);
    assert.equal(JSON.parse(bindings.get_hdr_2d_snapshot()).sequence, 0);
    bindings.set_animation_time(undefined);
    bindings.set_hdr_2d_recording(true);
    const source = readFileSync(new URL('../../../dev/hdr-2d-coverage.viscript', import.meta.url), 'utf8');
    assert.equal(bindings.validate_script(source), '');
    assert.equal(bindings.load_script(source), '');
    assert.equal(JSON.parse(bindings.get_hdr_2d_snapshot()).sequence, 0);
    for (let i = 0; i < 3; i++) { assert.ok(frames.length); frames.shift()(i * 16); assert.equal(bindings.get_last_error(), ''); }
    const frame = JSON.parse(bindings.get_hdr_2d_snapshot());
    assert.equal(frame.version, 2);
    assert.ok(frame.sequence > 0);
    assert.equal(frame.commands.length, 12);
    assert.equal(frame.commands[2].kind, 'path');
    assert.notDeepEqual(frame.commands[2].transform, [1, 0, 0, 1, 0, 0]);
    assert.deepEqual(frame.commands[3].transform, [1, 0, 0, 1, 0, 0]);
    assert.equal(frame.commands[3].stroke.width, 6);
    assert.ok(frame.commands[4].rotation > 0);
    assert.equal(frame.commands[4].gradient.stops.length, 2);
    assert.equal(frame.commands[10].blend, 'additive');
    assert.equal(frame.commands[11].kind, 'text');
    assert.equal(frame.commands[11].gradient.radius, 280);
    assert.ok(paints.includes('text'));
    assert.equal(bindings.set_asset_texture('hdr-test', 1, 1, new Uint8Array([255, 128, 0, 128])), true);
    assert.equal(bindings.load_script('render { draw::image(asset: asset::bitmap(id: "hdr-test"), x: 10, y: 20, width: 30, height: 40, opacity: 0.4, intensity: 5) }'), '');
    assert.equal(JSON.parse(bindings.get_hdr_2d_snapshot()).sequence, 0);
    frames.shift()(64);
    assert.equal(bindings.get_last_error(), '');
    const image = JSON.parse(bindings.get_hdr_2d_snapshot()).commands[0];
    assert.equal(image.kind, 'image'); assert.equal(image.intensity, 5); assert.equal(image.opacity, 0.4);
    assert.deepEqual(image.rect, [10, 20, 30, 40]);
    for (const value of ['-1', '7', '1.0 / 0.0']) {
      assert.equal(bindings.load_script(`render { draw::text(content: "bad", intensity: ${value}) }`), '');
      frames.shift()(80);
      assert.match(bindings.get_last_error(), /intensity|finite|division|zero/i);
      assert.throws(() => bindings.get_hdr_2d_snapshot());
    }
  } finally { dom.window.close(); }
});
