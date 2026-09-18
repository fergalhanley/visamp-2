import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@visamp/engine": new URL(
        "../../packages/engine/pkg/visamp_2.js",
        import.meta.url,
      ).pathname,
      "@": new URL(".", import.meta.url).pathname,
    },
  },
  test: {
    include: [
      "hooks/**/*.test.ts",
      "app/auth/**/*.test.ts",
      "lib/editor/**/*.test.ts",
      "lib/visript/**/*.test.ts",
      "lib/assets/**/*.test.ts",
      "lib/artists/**/*.test.ts",
      "lib/music/**/*.test.ts",
      "lib/ai/**/*.test.ts",
      "lib/billing/**/*.test.ts",
      "components/**/*.test.tsx",
    ],
    environment: "jsdom",
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
  },
});
