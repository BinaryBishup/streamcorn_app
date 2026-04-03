import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'image.tmdb.org' },
      { protocol: 'https', hostname: 'images.justwatch.com' },
    ],
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;
