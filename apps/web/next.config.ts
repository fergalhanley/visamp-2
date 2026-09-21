import path from "node:path";

import type { NextConfig } from "next";

// Thumbnails are captured at 1280x720 but shown in tiles a fraction of that
// size, so they go through the image optimiser rather than being served raw.
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_ANALYTICS_DEPLOYMENT: process.env.VERCEL_ENV ?? "development",
    NEXT_PUBLIC_ANALYTICS_RELEASE: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
  },
  // @visamp/player ships TypeScript source; Next compiles it in-place.
  transpilePackages: ["@visamp/player"],

  outputFileTracingIncludes: {
    "/api/ai/generate": [
      "../../packages/engine/visript.pest",
      "../docs/src/examples/basic.md",
      "../docs/src/examples/animation.md",
      "../docs/src/programming/system-values.md",
      "../docs/src/programming/oscillators.md",
      "../docs/src/drawing/creative-tools.md",
      "../docs/src/effects/filters.md",
      "../docs/src/programming/audio-detection.md",
      "../docs/src/programming/input-detection.md",
    ],
  },

  turbopack: {
    // Visript source and the legacy extension use one loader.
    rules: Object.fromEntries(
      ["*.viscript", "*.vdsl"].map((extension) => [
        extension,
        {
          loaders: [
            path.join(import.meta.dirname, "lib/visript/source-loader.cjs"),
          ],
          as: "*.js",
        },
      ]),
    ),
  },

  // Keep the documented webpack fallback viable for constrained build
  // environments where Turbopack cannot start its internal worker endpoint.
  webpack(config) {
    config.module.rules.push({
      test: /\.(?:viscript|vdsl)$/,
      use: [path.join(import.meta.dirname, "lib/visript/source-loader.cjs")],
    });
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    return config;
  },

  images: {
    remotePatterns: supabaseHost
      ? [
          {
            protocol: "https",
            hostname: supabaseHost,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
