import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@visamp/engine/package.json": new URL(
        "../../packages/engine/package.json",
        import.meta.url,
      ).pathname,
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
      "lib/sets/**/*.test.ts",
      "app/auth/**/*.test.ts",
      "lib/editor/**/*.test.ts",
      "lib/analytics/**/*.test.ts",
      "lib/visript/**/*.test.ts",
      "lib/assets/**/*.test.ts",
      "lib/artists/**/*.test.ts",
      "lib/creators/**/*.test.ts",
      "lib/seo*.test.ts",
      "lib/visualisation*.test.ts",
      "lib/music/**/*.test.ts",
      "lib/news/**/*.test.ts",
      "lib/store/**/*.test.ts",
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
