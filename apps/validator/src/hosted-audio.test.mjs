import assert from "node:assert/strict";
import test from "node:test";

import { chromium } from "playwright";

const trackId = process.env.HOSTED_AUDIO_TEST_TRACK_ID;
const baseUrl =
  process.env.HOSTED_AUDIO_TEST_BASE_URL ?? "http://localhost:3000";

test(
  "hosted audio supports ranges, CORS and Web Audio analysis",
  {
    skip: trackId ? false : "HOSTED_AUDIO_TEST_TRACK_ID is not configured",
    timeout: 30_000,
  },
  async () => {
    const playbackResponse = await fetch(
      `${baseUrl}/api/tracks/${trackId}/playback`,
      {
        cache: "no-store",
      },
    );
    assert.equal(playbackResponse.status, 200);
    assert.match(
      playbackResponse.headers.get("cache-control") ?? "",
      /no-store/,
    );
    const playback = await playbackResponse.json();
    assert.ok(playback.sources?.length >= 2);

    const source =
      playback.sources.find((item) => item.format === "opus") ??
      playback.sources[0];
    const rangeResponse = await fetch(source.url, {
      headers: { Origin: baseUrl, Range: "bytes=0-1023" },
    });
    assert.equal(rangeResponse.status, 206);
    assert.equal(
      rangeResponse.headers.get("access-control-allow-origin"),
      baseUrl,
    );
    assert.match(
      rangeResponse.headers.get("content-range") ?? "",
      /^bytes 0-1023\//,
    );
    assert.match(rangeResponse.headers.get("accept-ranges") ?? "", /bytes/i);

    const browser = await chromium.launch({
      headless: true,
      args: [
        "--autoplay-policy=no-user-gesture-required",
        "--disable-dev-shm-usage",
      ],
    });
    try {
      const page = await browser.newPage();
      await page.goto(baseUrl);
      const level = await page.evaluate(async (sources) => {
        const audio = new Audio();
        audio.crossOrigin = "anonymous";
        const context = new AudioContext();
        const analyser = context.createAnalyser();
        const sourceNode = context.createMediaElementSource(audio);
        sourceNode.connect(analyser);
        sourceNode.connect(context.destination);
        const canOpus = audio.canPlayType('audio/ogg; codecs="opus"') !== "";
        const selected =
          sources.find((item) => item.format === (canOpus ? "opus" : "aac")) ??
          sources[0];
        audio.src = selected.url;
        await context.resume();
        await audio.play();
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const values = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(values);
        audio.pause();
        await context.close();
        return Math.max(...values);
      }, playback.sources);
      assert.ok(level > 0, "AnalyserNode returned only silence");
    } finally {
      await browser.close();
    }
  },
);
