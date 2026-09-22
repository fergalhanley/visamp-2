// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { setEditorShortcut } from "./editor-shortcuts";
function event(
  code: string,
  init: KeyboardEventInit = {},
  element = document.body,
) {
  const e = new KeyboardEvent("keydown", {
    code,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  element.dispatchEvent(e);
  return e;
}
describe("set editor shortcuts", () => {
  it("toggles with Space but never during input capture", () => {
    expect(setEditorShortcut(event("Space"), false)).toBe("play");
    expect(setEditorShortcut(event("Space"), true)).toBeNull();
    expect(
      setEditorShortcut(event("KeyZ", { metaKey: true }), true),
    ).toBeNull();
  });
  it.each(["input", "textarea", "select", "button"])(
    "leaves Space to native %s input",
    (tag) => {
      const node = document.createElement(tag);
      document.body.append(node);
      expect(setEditorShortcut(event("Space", {}, node), false)).toBeNull();
      node.remove();
    },
  );
  it("supports Mac and Windows history keys", () => {
    for (const modifier of [{ metaKey: true }, { ctrlKey: true }]) {
      expect(setEditorShortcut(event("KeyZ", modifier), false)).toBe("undo");
      expect(setEditorShortcut(event("KeyY", modifier), false)).toBe("redo");
      expect(
        setEditorShortcut(
          event("KeyZ", { ...modifier, shiftKey: true }),
          false,
        ),
      ).toBe("redo");
    }
  });
  it("respects handled keys and text editing", () => {
    const e = event("Space");
    e.preventDefault();
    expect(setEditorShortcut(e, false)).toBeNull();
    const node = document.createElement("input");
    expect(
      setEditorShortcut(event("KeyY", { ctrlKey: true }, node), false),
    ).toBeNull();
  });
});

it("supports timeline Space with focus on the ruler or a transport button", () => {
  const timeline = document.createElement("section");
  timeline.className = "set-timeline";
  for (const tag of ["div", "button"]) {
    const node = document.createElement(tag);
    node.setAttribute("role", "slider");
    timeline.append(node);
    expect(setEditorShortcut(event("Space", {}, node), false)).toBe("play");
  }
});
it("supports clip copy/paste without intercepting text or captured input", () => {
  for (const modifier of [{ metaKey: true }, { ctrlKey: true }]) {
    expect(setEditorShortcut(event("KeyC", modifier), false)).toBe("copy");
    expect(setEditorShortcut(event("KeyV", modifier), false)).toBe("paste");
    expect(setEditorShortcut(event("KeyV", modifier), true)).toBeNull();
    expect(
      setEditorShortcut(
        event("KeyC", modifier, document.createElement("input")),
        false,
      ),
    ).toBeNull();
  }
});

it("allows Space after adjusting timeline zoom", () => {
  const timeline = document.createElement("section");
  timeline.className = "set-timeline";
  const range = document.createElement("input");
  range.type = "range";
  timeline.append(range);
  expect(setEditorShortcut(event("Space", {}, range), false)).toBe("play");
});
