// Real WASM plus a recording Canvas2D context: verifies values consumed by
// actual drawing, not inspector changes. Physical GPU/pixel output is separate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { defaultModulationConfig, resolveModulatedProperties, configureModulation } from '../../../packages/player/src/lfo-modulation.ts';
import { source, modulation } from '../../../dev/lfo-phase1.ts';

test('LFO configuration reaches real SDR/HDR draws on the engine clock', async () => {
  const dom = new JSDOM('<div id="visamp-stage"></div>', { url: 'http://localhost/' });
  const { window } = dom;
  for (const key of ['window', 'document', 'Window', 'Document', 'HTMLCanvasElement', 'HTMLElement', 'Element']) globalThis[key] = key === 'window' ? window : window[key];
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { get: () => 640 });
  Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { get: () => 360 });
  const frames = [], rotations = [];
  window.requestAnimationFrame = cb => (frames.push(cb), frames.length);
  class CanvasRenderingContext2D {
    constructor(canvas) { this.canvas = canvas; }
    save() {} restore() {} resetTransform() {} setTransform() {} translate() {}
    rotate(angle) { rotations.push(angle); }
    clearRect() {} fillRect() {} strokeRect() {} rect() {} drawImage() {}
    beginPath() {} moveTo() {} lineTo() {} closePath() {} fill() {} stroke() {}
  }
  globalThis.CanvasRenderingContext2D = window.CanvasRenderingContext2D = CanvasRenderingContext2D;
  window.HTMLCanvasElement.prototype.getContext = function(kind) { assert.equal(kind, '2d'); return this.ctx ??= new CanvasRenderingContext2D(this); };
  window.HTMLCanvasElement.prototype.toBlob = function(callback) { callback(new window.Blob(['stub'], { type: 'image/png' })); };
  try {
    const engine = await import('../../../packages/engine/pkg/visamp_2_bg.js');
    const { instance } = await WebAssembly.instantiate(readFileSync(new URL('../../../packages/engine/pkg/visamp_2_bg.wasm', import.meta.url)), { './visamp_2_bg.js': engine });
    engine.__wbg_set_wasm(instance.exports); instance.exports.__wbindgen_start();
    const tick = (time) => {
      engine.set_animation_time(time); rotations.length = 0; frames.shift()(0);
      assert.equal(engine.get_last_error(), ''); return rotations.at(-1);
    };
    const properties = () => Object.fromEntries(JSON.parse(engine.get_properties()).map(p => [p.name, Number(p.value)]));
    for (const hdr of [false, true]) {
      const script = hdr ? source.replace('color: $COLOR_TURQUOISE)', 'color: $COLOR_TURQUOISE, intensity: 3)') : source;
      assert.equal(engine.load_script(script), '');
      engine.set_hdr_2d_recording(hdr);
      configureModulation(engine, modulation);
      for (const time of [0, 500, 1500, 2000, -500, 500]) {
        const expected = resolveModulatedProperties({ rotation: 0, zoom: 1 }, modulation, time);
        assert.ok(Math.abs(tick(time) - expected.rotation) < 1e-12);
        assert.deepEqual(properties(), { rotation: 0, zoom: 1 });
        if (hdr) {
          const rect = JSON.parse(engine.get_hdr_2d_snapshot()).commands[1];
          assert.equal(rect.rotation, expected.rotation);
          assert.equal(rect.intensity, 3);
          assert.ok(Math.abs(rect.points[1][0] - rect.points[0][0] - 180 * expected.zoom) < 1e-6);
        }
      }
      engine.set_animation_paused(true); engine.set_animation_time(undefined);
      rotations.length = 0; frames.shift()(0); frames.shift()(0);
      assert.equal(rotations.at(-1), 0.8);
      rotations.length = 0;
      await engine.capture_frame();
      assert.equal(rotations.at(-1), 0.8);
      assert.deepEqual(properties(), { rotation: 0, zoom: 1 });
      configureModulation(engine, null); assert.equal(tick(500), 0);
      configureModulation(engine, modulation);
      assert.equal(engine.load_script(script), ''); assert.equal(tick(500), 0); // reload clears bank
    }
    // Cross-language parity across waveforms, phase, seed and negative/boundary times.
    const c = defaultModulationConfig(); c.lfos[0].enabled = true;
    c.routes = [{ lfoId: 'lfo-1', property: 'rotation', min: -1, max: 1, enabled: true }];
    for (const waveform of ['sine', 'triangle', 'square', 'saw-up', 'saw-down', 'sample-hold']) {
      c.lfos[0].waveform = waveform;
      for (const polarity of ['bipolar', 'unipolar']) {
        c.lfos[0].polarity = polarity;
        for (const phase of [0, 0.25, -0.75]) {
          c.lfos[0].phase = phase; configureModulation(engine, c);
          for (const time of [-4000, -2001, -2000, -1, 0, 125, 500, 1999, 2000, 120000]) {
            const expected = resolveModulatedProperties({ rotation: 0, zoom: 1 }, c, time).rotation;
            assert.ok(Math.abs(tick(time) - expected) < 1e-12, `${waveform} ${polarity} ${phase} ${time}`);
          }
        }
      }
    }
    // WASM validates independently of the typed/validated player wrapper.
    c.lfos[0].waveform = 'square'; configureModulation(engine, c);
    const before = tick(500);
    for (const invalid of ['{}', '{', JSON.stringify({ ...c, version: 2 }), JSON.stringify({ ...c, routes: [{ ...c.routes[0], property: 'missing' }] })]) {
      assert.throws(() => engine.set_modulation_config(invalid)); assert.equal(tick(500), before);
    }
    assert.equal(engine.load_script('prop rotation = true render {}'), '');
    assert.throws(() => configureModulation(engine, c), /numeric property/);
  } finally { dom.window.close(); }
});
