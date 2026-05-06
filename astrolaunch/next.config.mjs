/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // WebContainers requires cross-origin isolation
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ]
  },
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false }
    return config
  },
  experimental: { esmExternals: "loose" },
}
export default nextConfig
