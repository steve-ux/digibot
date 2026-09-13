#!/usr/bin/env bash
#
# Deploy seguro de digibot-web (correr EN LA VPS, en el host).
# Encadena: backup del .env -> git pull -> bump de versión -> build -> up -d -> health check.
#
# Uso:
#   ./scripts/deploy.sh 1.0.1      # deploya y etiqueta la imagen como 1.0.1
#
# La imagen anterior queda guardada (con su tag) en Docker para poder hacer
# rollback (ver rollback.sh) sin tener que reconstruirla.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

NEW_VERSION="${1:-}"
CURRENT="$(grep -E '^APP_VERSION=' .env | cut -d= -f2- || true)"
PORT="$(grep -E '^HOST_PORT=' .env | cut -d= -f2- || echo 8089)"

if [ -z "$NEW_VERSION" ]; then
  echo "Uso: ./scripts/deploy.sh <nueva_version>   (ej: ./scripts/deploy.sh 1.0.1)" >&2
  echo "Versión actual en .env: ${CURRENT:-<no seteada>}" >&2
  exit 1
fi

echo "════════════════════════════════════════════════════"
echo " Deploy digibot-web: ${CURRENT:-?}  ->  $NEW_VERSION"
echo "════════════════════════════════════════════════════"

echo "==> 1/5 Backup del .env pre-deploy..."
mkdir -p backups
cp .env "backups/.env.$(date +%Y%m%d%H%M%S).bak"
# TODO: cuando conectemos MySQL (usuarios/plantillas propias), sumar acá un
# dump de la base antes de deployar, igual que backup-db.sh en turnosApp.

echo "==> 2/5 git pull..."
git pull

echo "==> 3/5 Seteando APP_VERSION=$NEW_VERSION en .env..."
if grep -qE '^APP_VERSION=' .env; then
  sed -i "s|^APP_VERSION=.*|APP_VERSION=$NEW_VERSION|" .env
else
  echo "APP_VERSION=$NEW_VERSION" >> .env
fi

echo "==> 4/5 Build de la imagen digibot-web:$NEW_VERSION..."
docker compose build

echo "==> 5/5 Levantando contenedor..."
docker compose up -d

# Health check
sleep 3
if command -v curl >/dev/null && curl -fsS -o /dev/null "http://localhost:${PORT}"; then
  echo "✅ Deploy OK. Versión $NEW_VERSION corriendo y respondiendo en :${PORT}."
else
  echo "⚠️  La app NO responde en :${PORT}. Revisá logs:"
  echo "     docker compose logs --tail=80 app"
  echo "   Para volver a la versión anterior:"
  echo "     ./scripts/rollback.sh ${CURRENT:-<version_anterior>}"
fi
