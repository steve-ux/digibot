import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite un segundo dev/build en otra carpeta sin pisar el .next del dev server principal.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  output: "standalone", // build para Docker/Node server (ya no export estático: la web ahora tiene backend)
  // Se inyecta en el build (también en el bundle del navegador, el Footer se usa en
  // componentes cliente). En la VPS la setea scripts/deploy.sh en el .env.
  env: {
    APP_VERSION: process.env.APP_VERSION ?? "",
    // Fecha del build: el panel la compara con la del servidor (/api/version) para
    // saber si la pestaña quedó con una versión vieja, aunque no se haya cambiado el número.
    BUILD_TIME: new Date().toISOString(),
  },
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
