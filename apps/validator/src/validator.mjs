import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUDIO_FIXTURES,
  AUDIO_FIXTURE_SET_VERSION,
  REFERENCE_SCRIPT_VERSION,
} from "./assets.mjs";
import { difference, median, pixels, variance } from "./metrics.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const referencePath = path.join(
  here,
  "..",
  "assets",
  "reference-scripts",
  `${REFERENCE_SCRIPT_VERSION}.vdsl`,
);

async function render(page, source, config) {
  await page.goto("/harness.html");
  await page.waitForFunction(() => window.validatorHarness);
  await page.evaluate((script) => window.validatorHarness.load(script), source);

  const fixtures = [];
  for (const fixture of AUDIO_FIXTURES) {
    const durations = [];
    const frames = [];
    for (let frameIndex = 0; frameIndex < config.framesPerFixture; frameIndex += 1) {
      const audio = fixture.frames[frameIndex % fixture.frames.length];
      durations.push(
        await page.evaluate((frame) => window.validatorHarness.frame(frame), audio),
      );
      const canvas = page.locator("#visamp-stage canvas");
      frames.push(pixels(await canvas.screenshot({ type: "png" })));
    }
    fixtures.push({ key: fixture.key, durations, frames });
  }
  return fixtures;
}

export async function validate(browser, source, config) {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4319",
    viewport: { width: config.width, height: config.height },
  });
  const page = await context.newPage();
  const reference = await fs.readFile(referencePath, "utf8");

  try {
    const referenceRuns = await render(page, reference, config);
    const candidateRuns = await render(page, source, config);
    const candidateDurations = candidateRuns.flatMap((run) => run.durations);
    const referenceDurations = referenceRuns.flatMap((run) => run.durations);
    const frameCostRatio = median(candidateDurations) / Math.max(median(referenceDurations), 0.001);
    const minimumVariance = Math.min(
      ...candidateRuns.flatMap((run) => run.frames.map((frame) => variance(frame))),
    );
    const minimumFrameDifference = Math.min(
      ...candidateRuns.flatMap((run) =>
        run.frames.slice(1).map((frame, index) => difference(run.frames[index], frame)),
      ),
    );
    const lastFrames = candidateRuns.map((run) => run.frames.at(-1));
    const minimumAudioDifference = Math.min(
      ...lastFrames.slice(1).map((frame, index) => difference(lastFrames[index], frame)),
    );

    const checks = {
      runtime: { enabled: true, passed: true },
      uniform: {
        enabled: config.checks.uniform,
        passed: minimumVariance >= config.thresholds.pixelVariance,
        value: minimumVariance,
        threshold: config.thresholds.pixelVariance,
      },
      frameVariation: {
        enabled: config.checks.frameVariation,
        passed: minimumFrameDifference >= config.thresholds.frameDifference,
        value: minimumFrameDifference,
        threshold: config.thresholds.frameDifference,
      },
      audioResponse: {
        enabled: config.checks.audioResponse,
        passed: minimumAudioDifference >= config.thresholds.audioDifference,
        value: minimumAudioDifference,
        threshold: config.thresholds.audioDifference,
      },
      frameCost: {
        enabled: config.checks.frameCost,
        passed: frameCostRatio <= config.thresholds.frameCostRatio,
        value: frameCostRatio,
        threshold: config.thresholds.frameCostRatio,
      },
    };
    return {
      ok: Object.values(checks).every((check) => !check.enabled || check.passed),
      compilerVersion: await page.evaluate(() => window.validatorHarness.version),
      audioFixtureSetVersion: AUDIO_FIXTURE_SET_VERSION,
      referenceScriptVersion: REFERENCE_SCRIPT_VERSION,
      checks,
    };
  } finally {
    await context.close();
  }
}
