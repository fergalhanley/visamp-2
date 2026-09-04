import assert from "node:assert/strict";
import test from "node:test";

import { difference, median, variance } from "./metrics.mjs";

test("pixel metrics distinguish uniform and changed frames", () => {
  const black = Uint8Array.from([0, 0, 0, 255, 0, 0, 0, 255]);
  const split = Uint8Array.from([0, 0, 0, 255, 255, 255, 255, 255]);
  assert.equal(variance(black), 0);
  assert.ok(variance(split) > 0);
  assert.equal(difference(black, black), 0);
  assert.equal(difference(black, split), 127.5);
});

test("median rejects isolated timing noise", () => {
  assert.equal(median([100, 2, 3]), 3);
  assert.equal(median([1, 2, 3, 4]), 2.5);
});
