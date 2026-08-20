import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    /**
     * One process, no worker pool.
     *
     * Three test files do not need parallelism, and the pool was actively
     * harmful: under `turbo run` everything builds at once, and a contended
     * machine made vitest's worker teardown time out. It reported every test
     * as passing and then exited non-zero with nothing printed, which reads as
     * a flaky suite when the tests were never the problem.
     */
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
  },
});
