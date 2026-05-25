import path from node:path;
import { fileURLToPath } from node:url;

import type { NextConfig } from next;

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: standalone,
  allowedDevOrigins: [
    // Cloudflare tunnel entry point
    dev.duckroostdigital.com,
    // dev-box direct access by IP (all 3 preview ports)
    192.168.100.156:3000,
    192.168.100.156:3001,
    192.168.100.156:3002,
    // localhost access (when SSHed directly into dev-box)
    localhost:3000,
    localhost:3001,
    localhost:3002,
  ],
  turbopack: {
    root: projectRoot,
  },
  images: {
    remotePatterns: [
      {
        protocol: https,
        hostname: **.public.blob.vercel-storage.com,
      },
      {
        protocol: https,
        hostname: **.blob.vercel-storage.com,
      },
    ],
  },
};

export default nextConfig;
