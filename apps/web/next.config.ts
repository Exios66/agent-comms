import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@agent-comms/hub"],
  serverExternalPackages: ["@electric-sql/pglite"],
  allowedDevOrigins: ["*.trycloudflare.com", "*.loca.lt"],
  typescript: { ignoreBuildErrors: true },
  webpack: (config, { isServer }) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    if (isServer) {
      const extra = ["@electric-sql/pglite"];
      if (Array.isArray(config.externals)) {
        config.externals.push(...extra);
      } else if (config.externals) {
        config.externals = [config.externals, ...extra];
      } else {
        config.externals = extra;
      }
    }
    return config;
  },
};

export default nextConfig;
