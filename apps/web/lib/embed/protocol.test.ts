import { describe, expect, it } from "vitest";
import {
  embedParentOrigins,
  exactOrigin,
  isHostState,
  readEmbedOptions,
} from "./protocol";

describe("embed origin boundary", () => {
  it("accepts exact origins, rejecting credentials, paths and executable schemes", () => {
    expect(exactOrigin("https://fergalflix.com")).toBe(
      "https://fergalflix.com",
    );
    for (const value of [
      "https://fergalflix.com/",
      "https://user@fergalflix.com",
      "javascript:alert(1)",
      "null",
      "https://fergalflix.com/path",
    ])
      expect(exactOrigin(value)).toBeNull();
    expect(
      embedParentOrigins(" http://localhost:3000,https://bad.test/path "),
    ).toContain("http://localhost:3000");
    expect(embedParentOrigins("https://bad.test/path")).not.toContain(
      "https://bad.test/path",
    );
  });
  it("cannot expand the parent allowlist through query parameters", () => {
    expect(
      readEmbedOptions(
        { parentOrigin: "https://fergalflix.com.evil.test" },
        embedParentOrigins(),
      ).parentOrigin,
    ).toBeNull();
    expect(
      readEmbedOptions(
        { mode: "editor", parentOrigin: "https://fergalflix.com" },
        embedParentOrigins(),
      ),
    ).toMatchObject({
      mode: "showcase",
      parentOrigin: "https://fergalflix.com",
    });
  });
  it("rejects malformed and future protocol messages", () => {
    const message = {
      channel: "visamp:embed",
      version: 1,
      type: "host-state",
      instance: "one",
      active: true,
      userInitiated: false,
    };
    expect(isHostState(message)).toBe(true);
    for (const change of [
      { version: 2 },
      { type: "run-script" },
      { active: "true" },
      { channel: "other" },
      { userInitiated: null },
    ])
      expect(isHostState({ ...message, ...change })).toBe(false);
  });
});
