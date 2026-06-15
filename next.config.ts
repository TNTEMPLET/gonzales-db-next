import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** Hostnames only (no ports) — required for LAN/tunnel dev access to client JS + HMR. */
const ALLOWED_DEV_ORIGIN_HOSTS = [
  "dev.duckroostdigital.com",
  "gonzales-dev.duckroostdigital.com",
  "ascension-dev.duckroostdigital.com",
  "master-dev.duckroostdigital.com",
  "ladistrict2-dev.duckroostdigital.com",
  "ladistrict6-dev.duckroostdigital.com",
  "192.168.100.156",
  "localhost",
  "127.0.0.1",
] as const;

const nextConfig: NextConfig = {
  output: "standalone",
  // Allow each dev:all instance to use its own .next dir (avoids multi-instance lock conflict)
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  allowedDevOrigins: [...ALLOWED_DEV_ORIGIN_HOSTS],
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
        hostname: "dybusa.org",
        pathname: "/mediacontent/**",
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
