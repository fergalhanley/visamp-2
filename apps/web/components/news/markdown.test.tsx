import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NewsMarkdown } from "./markdown";
afterEach(cleanup);
describe("News Markdown", () => {
  it("renders formatting and demotes article headings", () => {
    render(
      <NewsMarkdown
        body={
          "# Update\n\n**Welcome** to *VisAmp*.\n\n- One\n- Two\n\n[Listen](/player)"
        }
      />,
    );
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "Update",
    );
    expect(screen.getByText("Welcome").tagName).toBe("STRONG");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/player");
  });
  it("does not execute HTML, unsafe links or remote tracking images", () => {
    const { container } = render(
      <NewsMarkdown
        body={
          '<script>alert(1)</script>\n\n<iframe src="https://example.com"></iframe>\n\n[bad](javascript:alert%281%29)\n\n![tracker](https://example.com/pixel.png)'
        }
      />,
    );
    expect(container.querySelector("script,iframe,img")).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
  });
  it("renders uploaded images with alt text through the access-controlled route", () => {
    render(
      <NewsMarkdown body="![Colourful waves](/api/news/images/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002.webp)" />,
    );
    expect(
      screen.getByAltText("Colourful waves").getAttribute("src"),
    ).toContain("/api/news/images/");
  });
});
