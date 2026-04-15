/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  cacheComponents: true,
  cacheLife: {
    accounts: {
      stale: 3600,
      revalidate: 1800,
      expire: 86400,
    },
  },
}

module.exports = nextConfig
