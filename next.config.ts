import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export", // <- genera /out al hacer build
  images: {
    unoptimized: true, // necesario para export estático
    domains: [
      "source.unsplash.com",
      "images.unsplash.com",
      "ext.same-assets.com",
      "ugc.same-assets.com",
    ],
    remotePatterns: [
      { protocol: "https", hostname: "source.unsplash.com", pathname: "/**" },
      { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
      { protocol: "https", hostname: "ext.same-assets.com", pathname: "/**" },
      { protocol: "https", hostname: "ugc.same-assets.com", pathname: "/**" },
    ],
  },
  // si algún día lo ponés en subcarpeta:
  // basePath: "/digibot",
};

export default nextConfig;
