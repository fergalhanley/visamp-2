import type { VisualInputEvent } from "./protocol";
/** Same runtime packets used by the existing DOM input bridge. */
export function runtimeInput(
  e: VisualInputEvent,
  width: number,
  height: number,
  position: { x: number; y: number },
) {
  const modifiers =
    e.type === "key"
      ? Object.fromEntries(
          ["shift", "control", "alt", "meta"].map((k) => [
            k,
            e.modifiers.includes(k),
          ]),
        )
      : {};
  if (e.type === "key")
    return {
      kind: e.action === "down" ? "key_down" : "key_up",
      code: e.code,
      key:
        e.key ??
        (e.code.startsWith("Key")
          ? e.modifiers.includes("shift")
            ? e.code.slice(3)
            : e.code.slice(3).toLowerCase()
          : e.code),
      repeat: e.repeat,
      ...modifiers,
    };
  if (e.type === "wheel")
    return { kind: "scroll", delta_x: e.dx, delta_y: e.dy };
  position.x = Math.max(
    0,
    Math.min(1, e.x ?? position.x + e.dx / Math.max(width, 1)),
  );
  position.y = Math.max(
    0,
    Math.min(1, e.y ?? position.y + e.dy / Math.max(height, 1)),
  );
  return {
    kind:
      e.action === "move"
        ? "pointer_move"
        : e.action === "down"
          ? "pointer_down"
          : "pointer_up",
    x: position.x * width,
    y: position.y * height,
    inside: true,
    buttons: e.buttons,
    button:
      ["primary", "auxiliary", "secondary", "back", "forward"][
        e.button ?? -1
      ] ?? "",
  };
}
