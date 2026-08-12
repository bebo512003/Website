import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    // Sandbox/container hostname plus the preview proxy domain used in development.
    ...(process.env.HOSTNAME ? [process.env.HOSTNAME] : []),
    '*.e2b.app',
  ],
  // The legacy /intake wizard is retired. Bookmarks land on the Dynamic Forms
  // listing — there is no competing intake UI.
  async redirects() {
    return [
      { source: '/intake', destination: '/forms', permanent: true },
      { source: '/intake/:path*', destination: '/forms', permanent: true },
    ]
  },
};

export default nextConfig;
