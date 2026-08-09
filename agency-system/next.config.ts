import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    // Sandbox/container hostname plus the preview proxy domain used in development.
    ...(process.env.HOSTNAME ? [process.env.HOSTNAME] : []),
    '*.e2b.app',
  ],
};

export default nextConfig;
