import { it, expect, vi } from "vitest";
import { activateScript } from "./activation";
import type { EngineModule, ResolvedAsset } from "./types";
const texture: ResolvedAsset = {
  id: "sprite",
  kind: "texture",
  width: 1,
  height: 1,
  rgba: new Uint8Array(4),
};
it("registers all assets before initialisation", () => {
  const calls: string[] = [];
  const engine = {
    clear_assets: () => calls.push("clear"),
    set_asset_texture: () => {
      calls.push("texture");
      return true;
    },
    load_script: () => {
      calls.push("init");
      return "";
    },
  } as unknown as EngineModule;
  activateScript(engine, "render {}", [texture], []);
  expect(calls).toEqual(["clear", "texture", "init"]);
});
it("restores prior assets and does not initialise on registration failure", () => {
  const register = vi.fn().mockReturnValueOnce(false).mockReturnValue(true),
    init = vi.fn();
  const engine = {
    clear_assets: vi.fn(),
    set_asset_texture: register,
    load_script: init,
  } as unknown as EngineModule;
  expect(() =>
    activateScript(engine, "new", [texture], [{ ...texture, id: "previous" }]),
  ).toThrow("sprite");
  expect(init).not.toHaveBeenCalled();
  expect(register.mock.calls[1]![0]).toBe("previous");
});
