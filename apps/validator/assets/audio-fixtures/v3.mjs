// Synthetic fixture snapshots; frequency retains the historical byte test data.
import { AUDIO_FIXTURES as normalized } from './v2.mjs';
import { AUDIO_FIXTURES as original } from './v1.mjs';
export const REFERENCE_SCRIPT_VERSION = "v3";
export const AUDIO_FIXTURE_SET_VERSION = "v3";
export const AUDIO_FIXTURES = normalized.map((fixture, i) => ({
  ...fixture,
  frames: fixture.frames.map((frame, j) => ({...frame, frequency: original[i].frames[j].frequency})),
}));
