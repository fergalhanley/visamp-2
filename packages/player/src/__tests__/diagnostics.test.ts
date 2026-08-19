import { describe, expect, it } from "vitest";

import { parseDiagnostics, toCompileResult } from "../diagnostics";

describe("parseDiagnostics", () => {
  it("reads line and column out of a single report", () => {
    const raw = "Parse error:  --> 4:11\n  |\n  = draw::cube: unknown argument 'radius'";
    const [diagnostic] = parseDiagnostics(raw);

    expect(diagnostic).toMatchObject({
      severity: "error",
      line: 4,
      column: 11,
      message: "draw::cube: unknown argument 'radius'",
    });
  });

  it("splits a compile that found several problems", () => {
    // The resolver checks the whole script, so one compile can turn up more
    // than one mistake. Reporting only the first would mean a recompile per
    // fix, with the rest invisible until then.
    const raw = [
      "Parse error:  --> 3:3\n  |\n  = camera::orbit is only available in 3d mode (add `context 3d`)",
      "Parse error:  --> 5:14\n  |\n  = draw::rect: argument 'z' requires `context 3d`",
    ].join("\n\n");

    const diagnostics = parseDiagnostics(raw);

    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0]).toMatchObject({ line: 3, column: 3 });
    expect(diagnostics[1]).toMatchObject({ line: 5, column: 14 });
    expect(diagnostics[1]!.message).toContain("requires `context 3d`");
  });

  it("keeps a multi-line syntax error as one report", () => {
    // pest renders its own errors across several lines with a caret diagram.
    // That is one problem, not four.
    const raw =
      "Parse error:  --> 2:9\n  |\n2 |   let a = \n  |         ^---\n  |\n  = expected expression";
    expect(parseDiagnostics(raw)).toHaveLength(1);
  });

  it("still reports something when there is no location marker", () => {
    const diagnostics = parseDiagnostics("Engine is not initialised");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.line).toBeUndefined();
    expect(diagnostics[0]!.message).toBe("Engine is not initialised");
  });

  it("treats empty output as a clean compile", () => {
    expect(parseDiagnostics("")).toEqual([]);
    expect(parseDiagnostics("   \n ")).toEqual([]);
    expect(toCompileResult("").ok).toBe(true);
  });

  it("marks a compile with any diagnostic as failed", () => {
    expect(toCompileResult("Parse error:  --> 1:1\n  |\n  = nope").ok).toBe(false);
  });
});
