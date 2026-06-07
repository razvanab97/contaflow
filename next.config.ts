import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
} as any
export default nextConfig
