/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@e-infak/ui', '@e-infak/theme', '@e-infak/api-client'],
  async rewrites() {
    // Browser requests must pass through the same-origin gateway.  The gateway
    // derives and signs the tenant from the host instead of trusting a client
    // controlled x-organization-slug header.
    return [
      {
        source: '/api/v1/:path*',
        destination: '/api/backend/api/v1/:path*',
      },
    ]
  },
  images: {
    domains: ['localhost'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: '**.r2.dev',
      },
    ],
  },
}

module.exports = nextConfig
