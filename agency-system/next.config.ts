import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    // Sandbox/container hostname plus the preview proxy domain used in development.
    ...(process.env.HOSTNAME ? [process.env.HOSTNAME] : []),
    '*.e2b.app',
  ],
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  // The legacy /intake wizard is retired. Bookmarks land on the Dynamic Forms
  // listing — there is no competing intake UI.
  async redirects() {
    return [
      { source: '/intake', destination: '/forms', permanent: true },
      { source: '/intake/:path*', destination: '/forms', permanent: true },
      { source: '/services', destination: '/#services', permanent: false },
    ]
  },
};

export default nextConfig;
