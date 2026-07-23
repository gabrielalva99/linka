import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@linka/ui", "@linka/shared"],
};

export default nextConfig;
