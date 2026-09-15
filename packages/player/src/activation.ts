import { registerAsset } from "./assets";
import type { EngineModule, ResolvedAsset } from "./types";

/** One synchronous commit: no animation frame can run between assets and init. */
export function activateScript(
  engine: EngineModule,
  source: string,
  assets: ResolvedAsset[],
  previous: ResolvedAsset[],
) {
  engine.clear_assets();
  try {
    for (const asset of assets) registerAsset(engine, asset);
  } catch (error) {
    engine.clear_assets();
    for (const asset of previous) registerAsset(engine, asset);
    throw error;
  }
  return engine.load_script(source);
}
