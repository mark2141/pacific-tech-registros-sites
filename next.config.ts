import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: process.env.DEPLOY_TARGET === "sites" ? { unoptimized: true } : {
    loader: "custom",
    loaderFile: "./lib/netlify-image-loader.ts",
  },
};

export default nextConfig;
