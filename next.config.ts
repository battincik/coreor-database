import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: {},
  typescript: {
    ignoreBuildErrors: false
  }
};

export default nextConfig;
