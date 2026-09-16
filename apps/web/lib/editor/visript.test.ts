import { createRequire } from "node:module";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { extractScript } from "../ai/server";
import { visriptLanguage } from "../visript/language";
import config from "../../next.config";

it("extracts Visript responses and legacy language fences", () => {
  const source = 'render { draw::text(content: "hello") }';
  for (const language of [
    "visript",
    "Visript",
    "viscript",
    "vdsl",
    "visamp",
    "",
  ]) {
    expect(
      extractScript(`Example:\n\`\`\`${language}\n${source}\n\`\`\``),
    ).toBe(source);
  }
  expect(extractScript(source)).toBe(source);
});

it("bundles all supported source extensions without altering code", () => {
  const require = createRequire(import.meta.url);
  const loader = require("../visript/source-loader.cjs");
  const source =
    '// Quotes, Unicode and newlines must survive bundling.\nrender { draw::text(content: "Visript • \\n") }';
  const cacheable = vi.fn();
  const output = loader.call({ cacheable }, source);
  expect(
    new Function(output.replace("export default source;", "return source;"))(),
  ).toBe(source);
  expect(cacheable).toHaveBeenCalledOnce();
  for (const extension of ["viscript", "vdsl"]) {
    expect(config.turbopack?.rules?.[`*.${extension}`]).toMatchObject({
      as: "*.js",
    });
  }
  const webpack = {
    module: { rules: [] as { test: RegExp }[] },
    experiments: {},
  };
  config.webpack?.(
    webpack,
    {} as Parameters<NonNullable<typeof config.webpack>>[1],
  );
  for (const extension of ["viscript", "vdsl"]) {
    expect(webpack.module.rules[0]!.test.test(`source.${extension}`)).toBe(
      true,
    );
  }
  expect(webpack.module.rules[0]!.test.test("source.ts")).toBe(false);
  expect(visriptLanguage.name).toBe("visript");
});
