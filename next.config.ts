import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  trailingSlash: true,
  turbopack: {},
  typescript: { ignoreBuildErrors: false }
};

export default nextConfig;
