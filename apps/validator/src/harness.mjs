const callbacks = [];
window.requestAnimationFrame = (callback) => {
  callbacks.push(callback);
  return callbacks.length;
};

const engine = await import("/engine/visamp_2.js");
await engine.default("/engine/visamp_2_bg.wasm");

function step() {
  const callback = callbacks.shift();
  if (!callback) throw new Error("engine scheduled no animation frame");
  const started = performance.now();
  callback(started);
  return performance.now() - started;
}

window.validatorHarness = {
  version: engine.compiler_version(),
  load(source) {
    const diagnostic = engine.load_script(source);
    if (diagnostic) throw new Error(diagnostic);
  },
  frame(audio) {
    engine.set_audio_frame(
      Uint8Array.from(audio.timeDomain),
      Uint8Array.from(audio.frequency),
      audio.beat,
    );
    const durationMs = step();
    const runtimeError = engine.get_last_error();
    if (runtimeError) throw new Error(runtimeError);
    return durationMs;
  },
};
