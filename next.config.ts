import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // build para Docker/Node server (ya no export estático: la web ahora tiene backend)
  images: {
    unoptimized: true,
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
