// Versión del build actual y comparación con la del servidor (/api/version).
// Sin imports de servidor: lo usan el panel (navegador) y la API.

export interface BuildInfo {
  version: string | null;
  buildTime: string | null;
}

export function currentBuild(): BuildInfo {
  return { version: process.env.APP_VERSION || null, buildTime: process.env.BUILD_TIME || null };
}

// ¿La pestaña quedó con un build viejo? Manda el número de versión (deploy.sh lo
// sube en cada deploy); la fecha solo se mira si alguno de los dos no tiene número.
export function isOutdated(mine: BuildInfo, server: BuildInfo) {
  if (mine.version && server.version) return mine.version !== server.version;
  return Boolean(mine.buildTime && server.buildTime && mine.buildTime !== server.buildTime);
}
