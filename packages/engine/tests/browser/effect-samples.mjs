export async function verifySamples(engine, load, step) {
  const root = "../../examples/effects/";
  const names = await (await fetch(root + "manifest.json")).json();
  const bitmap = await createImageBitmap(
    await (await fetch(root + "displacement-map.png")).blob(),
  );
  const source = document.createElement("canvas");
  source.width = bitmap.width;
  source.height = bitmap.height;
  const ctx = source.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  engine.set_asset_texture(
    "081c271e-67d9-4a75-aff2-5a1bb88e4daa",
    source.width,
    source.height,
    ctx.getImageData(0, 0, source.width, source.height).data,
  );
  const checks = [];
  for (const name of names) {
    load(await (await fetch(root + name)).text());
    for (let i = 0; i < 3; i++) step();
    const canvas = document.querySelector("#visamp-stage canvas"),
      gl = canvas.getContext("webgl2");
    if (!gl || gl.getError() !== gl.NO_ERROR) throw Error(`GL error: ${name}`);
    const blob = await engine.capture_frame();
    const figure = document.createElement("figure"),
      image = document.createElement("img"),
      caption = document.createElement("figcaption");
    image.src = URL.createObjectURL(blob);
    await image.decode();
    caption.textContent = name;
    figure.append(image, caption);
    document.querySelector("#gallery").append(figure);
    checks.push(name);
  }
  return { passed: true, checks };
}
