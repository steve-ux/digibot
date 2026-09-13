#!/usr/bin/env bash
#
# Rollback de digibot-web a una versión anterior YA BUILDEADA en este servidor
# (no reconstruye la imagen: por eso es rápido y confiable ante un deploy roto).
#
# Uso:
#   ./scripts/rollback.sh 1.0.0

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

TARGET_VERSION="${1:-}"

if [ -z "$TARGET_VERSION" ]; then
  echo "Uso: ./scripts/rollback.sh <version>   (ej: ./scripts/rollback.sh 1.0.0)" >&2
  echo "Imágenes disponibles en este servidor:" >&2
  docker images "digibot-web" --format "  - {{.Tag}}" >&2
  exit 1
fi

if ! docker image inspect "digibot-web:${TARGET_VERSION}" >/dev/null 2>&1; then
  echo "❌ No existe la imagen digibot-web:${TARGET_VERSION} en este servidor." >&2
  echo "   Imágenes disponibles:" >&2
  docker images "digibot-web" --format "   - {{.Tag}}" >&2
  exit 1
fi

echo "==> Volviendo a digibot-web:${TARGET_VERSION}..."
sed -i "s|^APP_VERSION=.*|APP_VERSION=$TARGET_VERSION|" .env

docker compose up -d

PORT="$(grep -E '^HOST_PORT=' .env | cut -d= -f2- || echo 8089)"
sleep 3
if command -v curl >/dev/null && curl -fsS -o /dev/null "http://localhost:${PORT}"; then
  echo "✅ Rollback OK. Versión ${TARGET_VERSION} corriendo y respondiendo en :${PORT}."
else
  echo "⚠️  La app no responde en :${PORT} después del rollback. Revisá logs:"
  echo "     docker compose logs --tail=80 app"
fi
