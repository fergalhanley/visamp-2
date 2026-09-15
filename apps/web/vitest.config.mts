import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["hooks/**/*.test.ts", "lib/editor/**/*.test.ts"],
    environment: "jsdom",
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
  },
});
