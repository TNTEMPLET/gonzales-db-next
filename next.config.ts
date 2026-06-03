import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  // Allow each dev:all instance to use its own .next dir (avoids multi-instance lock conflict)
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  allowedDevOrigins: [
    // Cloudflare tunnel — default + 3 org preview subdomains (single-level for SSL coverage)
    "dev.duckroostdigital.com",
    "gonzales-dev.duckroostdigital.com",
    "ascension-dev.duckroostdigital.com",
    "master-dev.duckroostdigital.com",
    "ladistrict2-dev.duckroostdigital.com",
    // dev-box direct IP access
    "192.168.100.156:3000",
    "192.168.100.156:3001",
    "192.168.100.156:3002",
    "192.168.100.156:3003",
    "localhost:3000",
    "localhost:3001",
    "localhost:3002",
    "localhost:3003",
  ],
  turbopack: {
    root: projectRoot,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.public.blob.vercel-storage.com",
      },
      {
        protocol: "https",
        hostname: "**.blob.vercel-storage.com",
      },
    ],
  },
  async headers() {
    if (process.env.NODE_ENV !== "development") return [];
    return [
      {
        source: "/(.*)",
        headers: [{ key: "X-Frame-Options", value: "ALLOWALL" }],
      },
    ];
  },
};

export default nextConfig;
