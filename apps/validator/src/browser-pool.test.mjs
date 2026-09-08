import assert from "node:assert/strict";
import test from "node:test";

import { BrowserPool, PoolCapacityError } from "./browser-pool.mjs";

test("browser pool bounds its queue and expires waiters", async () => {
  const pool = new BrowserPool(0, { maxQueue: 1, queueWaitMs: 10 });
  const waiting = pool.acquire();

  await assert.rejects(pool.acquire(), PoolCapacityError);
  await assert.rejects(waiting, PoolCapacityError);
  await pool.close();
});
