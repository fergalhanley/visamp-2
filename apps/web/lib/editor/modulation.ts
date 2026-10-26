import { validateModulation, type ModulationConfig } from "@visamp/player";

/** Never pass untrusted persisted JSON straight into the running engine. */
export function readStoredModulation(value: unknown): ModulationConfig | null {
  if (value === null || value === undefined) return null;
  try {
    validateModulation(value);
    return value;
  } catch {
    // Old documents, absent fields and malformed third-party writes must not
    // break the editor or the public player. The source remains independent.
    return null;
  }
}

/** Show corrupted saved data in the editor instead of discarding it on autosave. */
export function storedModulationError(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  try {
    validateModulation(value);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid stored modulation";
  }
}
