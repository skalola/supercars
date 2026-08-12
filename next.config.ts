import type { NextConfig } from "next";

const nextConfig: NextConfig = {

  reactCompiler: true,

  experimental: {
    serverActions: {
      bodySizeLimit: "9mb",
    },
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },

};

export default nextConfig;
