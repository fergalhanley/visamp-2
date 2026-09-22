import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Clip } from "@/lib/sets/model";
import { ClipProperties } from "./clip-properties";
import { TitleOverlayLayer } from "./title-overlay";
const clip: Clip = {
  id: "visual",
  media: {
    id: "visual",
    kind: "visual",
    source: "visual",
    title: "Spectrohex",
    attribution: "Kreoli",
  },
  startMs: 1000,
  durationMs: 30000,
  sourceOffsetMs: 0,
  fadeInMs: 0,
  fadeOutMs: 0,
};
afterEach(cleanup);
it("reveals settings, applies exact seconds as milliseconds and includes nine positions", () => {
  const onApply = vi.fn(),
    onClose = vi.fn();
  render(<ClipProperties clip={clip} onApply={onApply} onClose={onClose} />);
  expect(screen.queryByLabelText("Position")).toBeNull();
  fireEvent.click(screen.getByLabelText("Show title"));
  expect(
    screen.getByLabelText("Position").querySelectorAll("option"),
  ).toHaveLength(9);
  fireEvent.change(screen.getByLabelText("Position"), {
    target: { value: "Mid Right" },
  });
  fireEvent.change(screen.getByLabelText("Start (seconds)"), {
    target: { value: "1.125" },
  });
  fireEvent.change(screen.getByLabelText("Duration (seconds)"), {
    target: { value: "2.5" },
  });
  fireEvent.change(screen.getByLabelText("Size"), {
    target: { value: "large" },
  });
  fireEvent.click(screen.getByLabelText("Show creator"));
  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
  expect(onApply).toHaveBeenCalledWith({
    enabled: true,
    position: "Mid Right",
    startMs: 1125,
    durationMs: 2500,
    size: "large",
    showAttribution: false,
  });
  expect(onClose).toHaveBeenCalled();
});
it("cancels without changing the clip", () => {
  const apply = vi.fn();
  render(<ClipProperties clip={clip} onApply={apply} onClose={vi.fn()} />);
  fireEvent.click(screen.getByLabelText("Show title"));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(apply).not.toHaveBeenCalled();
});
it("stacks co-positioned audio and visual titles and escapes authored text", () => {
  const { container } = render(
    <TitleOverlayLayer
      titles={[
        {
          id: "a",
          kind: "audio",
          title: "<script>Music</script>",
          attribution: "Artist",
          position: "Bottom Left",
          size: "small",
        },
        {
          id: "v",
          kind: "visual",
          title: "Visual",
          attribution: "",
          position: "Bottom Left",
          size: "large",
        },
      ]}
    />,
  );
  const titles = container.querySelectorAll("[data-clip-title]");
  expect(titles).toHaveLength(2);
  expect(titles[0]!.parentElement).toBe(titles[1]!.parentElement);
  expect(container.querySelector("script")).toBeNull();
  expect(screen.getByText("Artist")).toBeTruthy();
});
