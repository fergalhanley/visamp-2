/** Real Chromium flow using an already authenticated agent-browser session.
 * Run: VISAMP_BROWSER_SESSION=vis-sets node scripts/verify-sets-browser.mjs
 * Requires a running local app and two playable public visuals/hosted tracks.
 * Creates only its own temporary set; deletes it after success. No fixture secrets.
 */
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const session = process.env.VISAMP_BROWSER_SESSION ?? "vis-sets";
const origin = process.env.VISAMP_TEST_ORIGIN ?? "http://localhost:3000";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
function browser(...args) {
  if (args[0] !== "eval")
    console.log(`[${new Date().toISOString()}] ${args.join(" ")}`);
  const raw = execFileSync(
    "npx",
    ["--yes", "agent-browser", "--session", session, "--json", ...args],
    { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
  );
  const result = JSON.parse(raw);
  if (!result.success) throw new Error(result.error ?? raw);
  return result.data;
}
const evaluate = (js) => browser("eval", js).result;
async function until(js, message, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (evaluate(js)) return;
    await pause(250);
  }
  throw new Error(message);
}
const button = (name) =>
  browser("find", "role", "button", "click", "--name", name, "--exact");
const field = (label, value) =>
  evaluate(`(() => {
  const label = ${JSON.stringify(label)};
  const input = [...document.querySelectorAll('input')].find(e => e.getAttribute('aria-label') === label || [...e.labels ?? []].some(l => l.textContent.replace(/\\s+/g, ' ').trim() === label));
  if (!input) throw new Error('Missing labelled field: ' + label);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(String(value))});
  input.dispatchEvent(new Event('input', {bubbles: true}));
  input.dispatchEvent(new Event('change', {bubbles: true}));
})()`);
const performanceText =
  '(document.querySelector(".set-performance")?.innerText ?? "")';
let id;
browser("open", `${origin}/sets/new`);
await until(
  'location.pathname.endsWith("/edit") && !!document.querySelector(".set-editor-bar")',
  "Authenticated editor did not open",
);
id = evaluate('location.pathname.split("/")[2]');
const name = `Browser verification ${Date.now()}`;
field("Set name", name);
await until(
  'document.querySelectorAll(".set-catalogue article").length >= 2',
  "Need two public visualisations",
);
for (let i = 0; i < 2; i++) {
  evaluate(
    `document.querySelectorAll('.set-catalogue article')[${i}].querySelector('button').click()`,
  );
  await until(
    '!!document.querySelector(".set-inspector input")',
    "No selected clip inspector",
  );
  field("Duration (ms)", 30000);
  field("Start (ms)", i * 25000);
}
button("Audio");
await until(
  '[...document.querySelectorAll(".set-catalogue button")].filter(x=>x.textContent==="Add").length >= 2',
  "Need two hosted tracks",
);
for (let i = 0; i < 2; i++) {
  evaluate(
    `[...document.querySelectorAll('.set-catalogue button')].filter(x=>x.textContent==='Add')[${i}].click()`,
  );
  field("Duration (ms)", 30000);
  field("Start (ms)", i * 25000);
}
await until(
  'document.querySelector(".set-inspector").innerText.includes("Ready") && document.querySelector(".set-editor-bar").innerText.includes("Saved")',
  "Set is not ready/saved",
);
// Retain edits on a failed save, then retry without reloading the document.
evaluate(
  `window.savedFetch=window.fetch;window.fetch=(input,init)=>init?.method==='PUT'&&String(input).startsWith('/api/sets/')?Promise.reject(new Error('Verification save failure')):window.savedFetch(input,init)`,
);
field("Set name", name + " retry");
await until(
  'document.querySelector(".set-editor-bar").innerText.includes("Save failed")',
  "Failed save was not visible",
);
evaluate("window.fetch=window.savedFetch");
button("Retry");
await until(
  'document.querySelector(".set-editor-bar").innerText.includes("Saved")',
  "Retry did not save",
);
let stored = await evaluate(`fetch('/api/sets/${id}').then(r=>r.json())`);
assert.equal(stored.name, name + " retry");
assert.equal(stored.audioClips.length, 2);
assert.equal(stored.visualClips.length, 2);
for (const lane of [stored.audioClips, stored.visualClips]) {
  assert.equal(lane[0].fadeOutMs, 5000);
  assert.equal(lane[1].fadeInMs, 5000);
}
button("Preview");
await until(`${performanceText}.includes('Pause')`, "Preview did not start");
await pause(1200);
assert.ok(
  Number(
    evaluate(
      'document.querySelector("[aria-label=\\\"Set playhead\\\"]").value',
    ),
  ) > 500,
);
button("Pause");
// Seek through the real range input, including React's native value tracker.
evaluate(
  `(()=>{const e=document.querySelector('[aria-label="Set playhead"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'27000');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`,
);
await until(
  'Number(document.querySelector("[aria-label=\\\"Set playhead\\\"]").value) === 27000',
  "Seek did not stick",
);
button("Open in VJ Mode");
await until(
  'location.pathname === "/vj-mode" && document.querySelector(".set-now")?.innerText.includes("Audio:")',
  "VJ route did not load",
);
await until(
  `${performanceText}.includes('55.000')`,
  "Saved set was not loaded",
);
browser("find", "role", "checkbox", "check", "--name", "Loop");
button("Play");
const tabs = browser("tab", "list");
const operatorTab = tabs.tabs.find((t) => t.url.includes("/vj-mode?")).tabId;
button("Pop out output");
await pause(1500);
const outputTab = browser("tab", "list").tabs.find((t) =>
  t.url.includes("/vj-mode/output/"),
).tabId;
browser("tab", operatorTab);
await until(
  'document.querySelectorAll("iframe").length === 0 && !!document.querySelector(".set-output-status")',
  "Embedded output was not fully detached",
);
browser("tab", outputTab);
browser("reload");
await until(
  '!!document.querySelector("canvas")',
  "Refreshed output did not reconstruct",
);
await pause(3500);
if (
  evaluate(
    '[...document.querySelectorAll("button")].some(b=>b.textContent.includes("Enable audio"))',
  )
)
  button("Enable audio");
browser("tab", operatorTab);
await until(
  'document.querySelectorAll("iframe").length === 0 && !!document.querySelector(".set-output-status")',
  "Refreshed output did not reconnect",
);
await until(
  '!!document.querySelector("[aria-label=\\\"Visualisations catalogue\\\"] article button")',
  "Visual catalogue unavailable",
);
evaluate(
  'document.querySelector("[aria-label=\\\"Visualisations catalogue\\\"] article button").click()',
);
await until(
  `${performanceText}.includes('LIVE OVERRIDE')`,
  "Visual override did not start",
);
browser("scrollintoview", '[aria-label="Input Controller"]');
browser("click", '[aria-label="Input Controller"]');
await until("!!document.pointerLockElement", "Pointer lock was not acquired");
const eventCount =
  'Number(document.querySelector(".vj-input").innerText.match(/Events: (\\d+)/)?.[1] ?? 0)';
const beforeInput = evaluate(eventCount);
browser("press", "a");
await until(
  `${eventCount} >= ${beforeInput + 2}`,
  "Key events were not forwarded",
);
browser("press", "Escape");
assert.equal(evaluate("!!document.pointerLockElement"), false);
button("Return visual to Set");
await until(
  `!(${performanceText}).includes('LIVE OVERRIDE')`,
  "Return to Set did not clear override",
);
await pause(500);
assert.equal(evaluate(`(${performanceText}).includes('LIVE OVERRIDE')`), false);
const beforeClose = Number(
  evaluate('document.querySelector("[aria-label=\\\"Set playhead\\\"]").value'),
);
browser("tab", "close", outputTab);
browser("tab", operatorTab);
await until(
  'document.querySelectorAll("iframe").length === 1 && !document.querySelector(".set-output-status")',
  "Embedded output did not recover",
);
assert.equal(evaluate(`(${performanceText}).includes('LIVE OVERRIDE')`), false);
const afterClose = Number(
  evaluate('document.querySelector("[aria-label=\\\"Set playhead\\\"]").value'),
);
assert.ok(
  afterClose >= beforeClose || beforeClose > 50000,
  "Set position was lost",
);
button("Stop");
assert.equal(
  await evaluate(
    `fetch('/api/sets/${id}', {method:'DELETE'}).then(r=>r.status)`,
  ),
  200,
);
browser("open", `${origin}/sets`);
console.log(
  "PASS: create, add 2+2, overlaps, autosave/retry, preview/seek, VJ, pop-out detach/refresh, override, input, return and embedded recovery. Temporary set deleted.",
);
