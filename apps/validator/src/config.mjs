function number(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive`);
  return value;
}

function integer(name, fallback, minimum = 1) {
  const value = number(name, fallback);
  if (!Number.isInteger(value) || value < minimum)
    throw new Error(`${name} must be an integer of at least ${minimum}`);
  return value;
}

function toggle(name, fallback = true) {
  const value = process.env[name];
  return value === undefined ? fallback : value !== "false";
}

export const config = Object.freeze({
  port: integer("VALIDATOR_PORT", 4318),
  poolSize: integer("VALIDATOR_BROWSER_POOL_SIZE", 2),
  wallClockMs: integer("VALIDATOR_WALL_CLOCK_MS", 15_000),
  width: integer("VALIDATOR_WIDTH", 320),
  height: integer("VALIDATOR_HEIGHT", 180),
  framesPerFixture: integer("VALIDATOR_FRAMES_PER_FIXTURE", 8, 2),
  thresholds: Object.freeze({
    pixelVariance: number("VALIDATOR_MIN_PIXEL_VARIANCE", 8),
    frameDifference: number("VALIDATOR_MIN_FRAME_DIFFERENCE", 0.5),
    audioDifference: number("VALIDATOR_MIN_AUDIO_DIFFERENCE", 0.5),
    frameCostRatio: number("VALIDATOR_MAX_FRAME_COST_RATIO", 8),
  }),
  checks: Object.freeze({
    uniform: toggle("VALIDATOR_CHECK_UNIFORM"),
    frameVariation: toggle("VALIDATOR_CHECK_FRAME_VARIATION"),
    audioResponse: toggle("VALIDATOR_CHECK_AUDIO_RESPONSE"),
    frameCost: toggle("VALIDATOR_CHECK_FRAME_COST"),
  }),
});
