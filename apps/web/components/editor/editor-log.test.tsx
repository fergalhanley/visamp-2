import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EditorLog, type LogLine } from "./editor-log";
afterEach(cleanup);
it("scrolls when messages change even at the 200-line limit", () => {
  const props = {
    collapsed: false,
    onToggle: vi.fn(),
    onClear: vi.fn(),
    onJumpToLine: vi.fn(),
  };
  const lines: LogLine[] = Array.from({ length: 200 }, (_, id) => ({
    id,
    level: "info",
    message: `Message ${id}`,
    at: id,
  }));
  const { rerender } = render(<EditorLog {...props} lines={lines} />);
  const viewport = screen.getByRole("log");
  Object.defineProperty(viewport, "scrollHeight", { value: 500 });
  viewport.scrollTop = 0;
  rerender(
    <EditorLog
      {...props}
      lines={[
        ...lines.slice(1),
        { id: 200, level: "info", message: "Newest", at: 200 },
      ]}
    />,
  );
  expect(viewport.scrollTop).toBe(500);
});
