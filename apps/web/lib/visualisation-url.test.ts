import { expect, it } from "vitest";
import { isVisualisationId, visualisationPath } from "./visualisation-url";
it("uses the stored slug rather than deriving one from a renamed title", () => {
  expect(visualisationPath({ id: "uuid", slug: "original-name" })).toBe("/vis/original-name");
  expect(visualisationPath({ id: "fixture" })).toBe("/vis/fixture");
});
it("distinguishes exact legacy UUIDs from slugs", () => {
  expect(isVisualisationId("11111111-1111-1111-1111-111111111111")).toBe(true);
  expect(isVisualisationId("prism-velvet-otter")).toBe(false);
  expect(isVisualisationId("vis-11111111-1111-1111-1111-111111111111")).toBe(false);
});
