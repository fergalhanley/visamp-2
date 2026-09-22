/** Keep editor shortcuts away from input capture and native text/control input. */
export function setEditorShortcut(e: KeyboardEvent, captured: boolean) {
  if (captured || e.defaultPrevented || e.altKey) return null;
  const target = e.target;
  if (
    e.code === "Space" &&
    !e.metaKey &&
    !e.ctrlKey &&
    target instanceof HTMLElement &&
    target.matches("input[type='range']") &&
    target.closest(".set-timeline")
  )
    return "play";
  if (
    target instanceof HTMLElement &&
    target.closest(
      "input,textarea,select,[contenteditable]:not([contenteditable='false'])",
    )
  )
    return null;
  if (e.metaKey || e.ctrlKey) {
    if (e.code === "KeyZ") return e.shiftKey ? "redo" : "undo";
    if (e.code === "KeyY") return "redo";
    if (e.code === "KeyC") return "copy";
    if (e.code === "KeyV") return "paste";
    return null;
  }
  if (e.code === "Space") {
    if (
      target instanceof HTMLElement &&
      !target.closest(".set-timeline") &&
      target.closest("button,a,summary,[role='tab'],[role='slider']")
    )
      return null;
    return "play";
  }
  if (["ArrowLeft", "ArrowRight", "Delete", "Backspace"].includes(e.key))
    return "edit";
  return null;
}
