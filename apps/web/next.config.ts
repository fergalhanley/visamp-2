import type { NextConfig } from "next";

// Thumbnails are captured at 1280x720 but shown in tiles a fraction of that
// size, so they go through the image optimiser rather than being served raw.
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;

const nextConfig: NextConfig = {
  // @visamp/player ships TypeScript source; Next compiles it in-place.
  transpilePackages: ["@visamp/player"],

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
