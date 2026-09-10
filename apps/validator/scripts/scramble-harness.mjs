import { shiftFilter } from "/reference.js";
const callbacks = [];
const realRAF = window.requestAnimationFrame.bind(window);
window.requestAnimationFrame = (cb) => callbacks.push(cb);
const realNow = performance.now.bind(performance);
let clock = 0;
Object.defineProperty(performance, "now", { value: () => clock });
const engine = await import("/engine/visamp_2.js");
await engine.default({ module_or_path: "/engine/visamp_2_bg.wasm" });
const host = document.querySelector("#visamp-stage");
let playing = false;

function pixels(canvas) {
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  const ctx = copy.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0);
  return ctx.getImageData(0, 0, copy.width, copy.height);
}
function step(dt = 1000 / 60, capture = true) {
  clock += dt;
  callbacks.shift()(clock);
  const error = engine.get_last_error();
  if (error) throw new Error(error);
  const canvas = host.querySelector("canvas");
  const gl = canvas.getContext("webgl2");
  if (gl && !gl.isContextLost() && gl.getError() !== gl.NO_ERROR)
    throw new Error("WebGL error after frame");
  return capture ? pixels(canvas) : null;
}
function load(script) {
  playing = false;
  const error = engine.load_script(script);
  if (error) throw new Error(error);
}
function sample(context, type, refresh) {
  const effect = `effect::scramble(type: ${type}, refresh_color: ${refresh})`;
  const shape =
    context === "2d"
      ? `draw::circle(x: $WIDTH / 2.0 + math::sin(radians: phase) * $WIDTH * 0.3, y: $HEIGHT / 2.0, radius: 24.0, color: $COLOR_TURQUOISE)`
      : `draw::cube(x: math::sin(radians: phase) * 3.0, rot_x: phase * 25.0, rot_y: phase * 40.0, size: 1.5, color: $COLOR_TURQUOISE)\n draw::sphere(x: 0.5, z: 0.4, radius: 0.65, color: $COLOR_ORANGE)`;
  return `context ${context}\nprop phase = 0.0\non_frame {\n phase += 0.04\n}\nrender {\n ${effect}\n ${shape}\n}\n`;
}
window.scrambleHarness = {
  engine,
  step,
  load,
  pixels,
  sample,
  shiftFilter,
  realNow,
  async resize(width, height) {
    host.style.width = `${width}px`;
    host.style.height = `${height}px`;
    await new Promise((resolve) => setTimeout(resolve, 40));
  },
  reference(source, type) {
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.putImageData(source, 0, 0);
    shiftFilter(ctx, type);
    return ctx.getImageData(0, 0, source.width, source.height);
  },
  gallery(type, reference, actual, comparison = "reference / GPU") {
    const card = document.createElement("div");
    const label = document.createElement("p");
    label.textContent = `Type ${type} · ${comparison}`;
    card.append(label);
    for (const data of [reference, actual]) {
      const canvas = document.createElement("canvas");
      canvas.width = data.width;
      canvas.height = data.height;
      canvas.getContext("2d").putImageData(data, 0, 0);
      card.append(canvas);
    }
    document.querySelector("#gallery").append(card);
  },
};
const newNames = [
  "Vertical RGB split",
  "RGB prism",
  "Chromatic zoom",
  "Channel carousel",
  "Horizontal wave",
  "Vertical wave",
  "Cross waves",
  "Expansion",
  "Contraction",
  "Clockwise swirl",
  "Counterclockwise swirl",
  "Radial ripple",
  "Pinch lens",
  "Bulge lens",
  "Tile rotation",
  "Tile mirrors",
  "Mosaic",
  "Scanline slip",
  "Block scatter",
  "Four-way split",
];
for (let type = 1; type <= 40; type++) {
  document
    .querySelector("#preset")
    .add(
      new Option(
        `Type ${type}${type >= 21 ? ` · ${newNames[type - 21]}` : ""}`,
        type,
      ),
    );
}
document.querySelector("#play").onclick = () => {
  const context = document.querySelector("#context").value;
  load(
    sample(
      context,
      document.querySelector("#preset").value,
      document.querySelector("#refresh").value,
    ),
  );
  playing = true;
};
function animate() {
  if (playing) step(1000 / 60, false);
  realRAF(animate);
}
realRAF(animate);
document.querySelector("#status").textContent =
  "Ready · same feedback pipeline for 2D and 3D";
document.querySelector("#play").click();
