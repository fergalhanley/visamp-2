import { expect, it } from "vitest";
import { publicMetadata, SITE_URL, staticSearchPaths } from "./seo";

it("gives each public page its own canonical and matching social URL", () => {
  const metadata = publicMetadata("/creators/Some%20Name", "Some Name", "A creator");
  expect(metadata.alternates?.canonical).toBe(`${SITE_URL}/creators/Some%20Name`);
  expect(metadata.openGraph).toMatchObject({ url: `${SITE_URL}/creators/Some%20Name`, images: [{ url: "/share-image" }] });
  expect(publicMetadata("/vis/one", "One", "Work", "https://cdn.example/one.png").twitter).toMatchObject({ images: ["https://cdn.example/one.png"] });
});

it("does not advertise utility or unfinished pages for indexing", () => {
  for (const path of ["/account", "/upload", "/site/contact", "/site/terms-and-conditions"]) {
    expect(staticSearchPaths).not.toContain(path);
  }
  expect(staticSearchPaths).toContain("/site/about");
  expect(staticSearchPaths).toContain("/site/news");
});
