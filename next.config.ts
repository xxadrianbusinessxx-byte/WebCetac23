import type { NextConfig } from "next";
import path from "node:path";

function hostsServerActions(): string[] {
  const hosts = new Set<string>(["localhost:3000", "127.0.0.1:3000"]);
  for (const raw of [
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
  ]) {
    if (!raw?.trim()) continue;
    try {
      const u = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
      hosts.add(u.host);
    } catch {
      hosts.add(raw.replace(/^https?:\/\//, "").split("/")[0]!);
    }
  }
  return [...hosts];
}

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "cloudinary"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
      allowedOrigins: hostsServerActions(),
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
