import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Evita que Turbopack use un lockfile del directorio padre (p. ej. C:\Users\...\package-lock.json)
  turbopack: {
    root: path.resolve(process.cwd()),
  },
};

export default nextConfig;
