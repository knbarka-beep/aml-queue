import type { NextConfig } from "next";

// Static site: all data is read at build time from web/data/, no server and no live AI.
// trailingSlash: pages are written as folder/index.html, so any static file server finds /how-it-works/.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
};

export default nextConfig;
