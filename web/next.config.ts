import type { NextConfig } from "next";

// Static site: all data is read at build time, no server and no live AI.
const nextConfig: NextConfig = {
  output: "export",
};

export default nextConfig;
