import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: process.env.HOSTNAME
    ? [process.env.HOSTNAME]
    : [],
};

export default nextConfig;
