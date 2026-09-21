/** Requires an authenticated agent-browser session, a local app, public visuals
 * and at least three hosted tracks. Creates no saved content.
 * VISAMP_BROWSER_SESSION=vj-controls node scripts/verify-vj-freeplay-browser.mjs
 */
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const session = process.env.VISAMP_BROWSER_SESSION ?? "vj-controls";
const origin = process.env.VISAMP_TEST_ORIGIN ?? "http://localhost:3000";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
function b(...args) {
  const raw = execFileSync(
    "npx",
    ["--yes", "agent-browser", "--session", session, "--json", ...args],
    { encoding: "utf8", maxBuffer: 4e6 },
  );
  const result = JSON.parse(raw);
  if (!result.success) throw new Error(result.error);
  return result.data;
}
const ev = (js) => b("eval", js).result;
async function until(js) {
  for (let i = 0; i < 30; i++) {
    if (ev(js)) return;
    await pause(300);
  }
  throw new Error(js);
}
const button = (name) =>
  b("find", "role", "button", "click", "--name", name, "--exact");
b("open", origin + "/vj-mode");
await until(
  '!!document.querySelector("[aria-label=\\\"Browse\\\"] button.text-left")',
);
if (
  ev(
    '[...document.querySelectorAll("button")].some(e=>e.textContent==="Decline analytics")',
  )
)
  button("Decline analytics");
ev(
  'document.querySelector("[aria-label=\\\"Browse\\\"] button.text-left").click()',
);
await until(`document.querySelectorAll('[aria-label="Audio source"] button[aria-label^="Play "]').length >= 3`);
const titles = ev(`[...document.querySelectorAll('[aria-label="Audio source"] button[aria-label^="Play "]')].slice(0,3).map(e=>e.getAttribute("aria-label").slice(5))`);
button(titles[0]);
await until(
  'document.querySelector(".vj-performance").textContent.includes(' +
    JSON.stringify("Audio: " + titles[0]) +
    ")",
);
assert.equal(ev('!!document.querySelector(".vj-input")'), false);
assert.equal(ev('!!document.querySelector(".set-transport")'), false);
assert.equal(ev('document.querySelectorAll(".vj-performance a").length'), 0);
button("Pause");
ev(
  '(()=>{const el=document.querySelector("input[aria-label=Seek]");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(el,"42");el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));})()',
);
await until(
  'Number(document.querySelector("input[aria-label=Seek]").value)===42',
);
const before = ev(
  'document.querySelector(".vj-performance .visamp-surface p").textContent',
);
button("Manual");
button("Next");
await until(
  'document.querySelector(".vj-performance").textContent.includes(' +
    JSON.stringify("Audio: " + titles[1]) +
    ")",
);
assert.equal(
  ev('document.querySelector(".vj-performance .visamp-surface p").textContent'),
  before,
);
button("Per track");
button("Next");
await until(
  'document.querySelector(".vj-performance .visamp-surface p").textContent !== ' +
    JSON.stringify(before),
);
b("screenshot", "/tmp/vjc-freeplay.png");
const embedded =
  'document.querySelector("iframe").contentDocument.querySelector("[data-vj-output]")';
ev(
  `(()=>{const el=${embedded}; el.dispatchEvent(new PointerEvent("pointermove",{clientX:100,clientY:50}));})()`,
);
assert.equal(ev(`${embedded}.style.cursor`), "default");
ev(`${embedded}.click()`);
assert.equal(ev(`${embedded}.style.cursor`), "none");
const op = b("tab", "list").tabs.find(
  (t) => t.url.includes("/vj-mode") && !t.url.includes("/output/"),
).tabId;
button("Pop out output");
b("tab", op);
await until(
  '!!document.querySelector(".vj-input") && !document.querySelector("iframe")',
);
assert.equal(
  ev(
    '[...document.querySelectorAll("button")].some(e=>e.textContent.trim()==="Pop out output")',
  ),
  false,
);
b("screenshot", "/tmp/vjc-popped-controller.png");
const out = b("tab", "list").tabs.find((t) =>
  t.url.includes("/vj-mode/output/"),
).tabId;
b("tab", out);
await until('!!document.querySelector("[data-vj-output]")');
ev(
  'document.querySelector("[data-vj-output]").dispatchEvent(new PointerEvent("pointermove",{clientX:10,clientY:10}))',
);
assert.equal(
  ev('document.querySelector("[data-vj-output]").style.cursor'),
  "default",
);
await pause(3100);
assert.equal(
  ev('document.querySelector("[data-vj-output]").style.cursor'),
  "none",
);
ev(
  'document.querySelector("[data-vj-output]").dispatchEvent(new PointerEvent("pointermove",{clientX:20,clientY:10}))',
);
assert.equal(
  ev('document.querySelector("[data-vj-output]").style.cursor'),
  "default",
);
b("dblclick", "[data-vj-output]");
await until("!!document.fullscreenElement");
ev(
  'document.querySelector("[data-vj-output]").dispatchEvent(new PointerEvent("pointermove",{clientX:30,clientY:10}))',
);
assert.equal(
  ev('document.querySelector("[data-vj-output]").style.cursor'),
  "none",
);
b("dblclick", "[data-vj-output]");
await until("!document.fullscreenElement");
ev(
  'document.querySelector("[data-vj-output]").dispatchEvent(new PointerEvent("pointermove",{clientX:40,clientY:10}))',
);
assert.equal(
  ev('document.querySelector("[data-vj-output]").style.cursor'),
  "default",
);
b("tab", "close", out);
b("tab", op);
await until(
  '!!document.querySelector("iframe") && !document.querySelector(".vj-input")',
);
assert.equal(
  ev(
    '[...document.querySelectorAll("button")].some(e=>e.textContent.trim()==="Pop out output")',
  ),
  true,
);
button("Pause");
console.log(
  "PASS freeplay shared transport, seek, manual/per-track skip, popup input replacement, idle cursor, double-click fullscreen, recovery.",
);
