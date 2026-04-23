import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Legacy TMDB hosts kept for any older images still referenced
      { protocol: "https", hostname: "image.tmdb.org" },
      { protocol: "https", hostname: "images.justwatch.com" },
      // Current CDNs used by the live catalogue
      { protocol: "https", hostname: "streamcornes.b-cdn.net" },
      { protocol: "https", hostname: "streamcornimages.b-cdn.net" },
      { protocol: "https", hostname: "wouodbbvgceoijhwbljg.supabase.co" },
    ],
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
