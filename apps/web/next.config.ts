import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactCompiler: true,
  experimental: {
    useTypeScriptCli: true,
  },
};

export default nextConfig;
