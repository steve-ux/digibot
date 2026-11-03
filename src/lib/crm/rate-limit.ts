// Límite simple de intentos en memoria (por proceso). Alcanza para frenar fuerza
// bruta contra el login en un solo servidor; si se escala a varios, mover a la base.

const buckets = new Map<string, { count: number; resetAt: number }>();

export function hitRateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  bucket.count += 1;
  return bucket.count > max;
}

export function clearRateLimit(key: string) {
  buckets.delete(key);
}

export function clientIp(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "local";
}
