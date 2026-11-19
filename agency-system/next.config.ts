import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: [
    // Sandbox/container hostname and Arena preview proxy domains (dev only).
    ...(process.env.HOSTNAME ? [process.env.HOSTNAME] : []),
    '*.e2b.app',
    '*.arena.site',
  ],
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  // Keep old public bookmarks and already-sent tracking emails working.
  // Next forwards the original query parameters (ref/token/key/lang).
  async redirects() {
    return [
      { source: '/intake', destination: '/forms', permanent: true },
      { source: '/intake/:path*', destination: '/forms', permanent: true },
      { source: '/services', destination: '/#services', permanent: false },
      { source: '/portfolio', destination: '/#work', permanent: true },
      { source: '/portfolio/selected/:slug', destination: '/portfolio/:slug', permanent: true },
      { source: '/track', destination: '/forms#track', permanent: true },
      { source: '/track/:reference', destination: '/forms?ref=:reference#track', permanent: true },
    ]
  },
};

export default nextConfig;
