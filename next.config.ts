import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "cloudinary"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
    ],
  },
  // Evita que Turbopack use un lockfile del directorio padre (p. ej. C:\Users\...\package-lock.json)
  turbopack: {
    root: path.resolve(process.cwd()),
  },
};

export default nextConfig;
