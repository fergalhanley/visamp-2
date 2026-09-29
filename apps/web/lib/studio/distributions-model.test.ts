import { expect, it } from "vitest";
import {
  defaultMasterSettings,
  parseMasterSettings,
} from "./distributions-model";
it("normalises filenames and rejects invalid file settings", () => {
  expect(defaultMasterSettings("My / release 🎵").filename).toBe("My  release");
  expect(
    parseMasterSettings({
      ...defaultMasterSettings("Test"),
      filename: " Master ",
    }).filename,
  ).toBe("Master");
  for (const input of [
    null,
    [],
    { ...defaultMasterSettings("Test"), filename: "../bad" },
    { ...defaultMasterSettings("Test"), filename: " " },
    { ...defaultMasterSettings("Test"), format: "gif" },
    { ...defaultMasterSettings("Test"), frameRate: 0 },
    { ...defaultMasterSettings("Test"), resolution: "4k" },
  ])
    expect(() => parseMasterSettings(input)).toThrow();
});
