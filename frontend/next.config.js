/** @type {import('next').NextConfig} */

// Bundle Analyzer Configuration (Issue #47)
// Enable with: ANALYZE=true npm run build
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

const nextConfig = {
  // Image Optimization - Next.js built-in optimization for remote images
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },

  // Production Optimizations (Issue #47 - Performance NFR: Bundle < 500KB gzipped)
  compiler: {
    // Remove console.log in production builds
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },

  // Webpack Optimizations for code splitting and chunk size
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Client-side chunk splitting strategy
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            // Separate vendor chunks for better caching
            default: false,
            vendors: false,

            // Framework chunk (React, React-DOM)
            framework: {
              name: 'framework',
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 40,
              enforce: true,
            },

            // Common libraries used across multiple pages
            commons: {
              name: 'commons',
              minChunks: 2,
              priority: 20,
            },

            // Large npm packages should be split into separate chunks
            lib: {
              test: /[\\/]node_modules[\\/]/,
              name(module) {
                // Get the name of the package
                const packageName = module.context.match(
                  /[\\/]node_modules[\\/](.*?)([\\/]|$)/
                )?.[1]

                // Split heavy packages into separate chunks for better caching
                // socket.io-client is ~100KB, date-fns is ~70KB
                if (packageName) {
                  return `npm.${packageName.replace('@', '')}`
                }
                return 'lib'
              },
              priority: 30,
              minChunks: 1,
              reuseExistingChunk: true,
            },
          },
        },
      }
    }

    return config
  },

  // Enable SWC minification (faster than Terser, enabled by default in Next.js 14)
  swcMinify: true,

  // Production source maps - disable for smaller bundle, enable for debugging
  productionBrowserSourceMaps: false,

  // Compress all assets
  compress: true,

  // Power performance mode for faster builds
  poweredByHeader: false,
}

// Export with bundle analyzer wrapper
module.exports = withBundleAnalyzer(nextConfig)
