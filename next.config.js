/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  webpack: (config, { isServer, dev }) => {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({ canvas: "commonjs canvas" });
    }
    if (dev) {
      config.watchOptions = {
        ignored: ["**/node_modules/**", "**/.next/**", "**/uploads/**"],
      };
    }
    return config;
  },
};

module.exports = nextConfig;
