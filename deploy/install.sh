#!/usr/bin/env bash
# Installation de KJ Pictures dans un conteneur LXC Debian 12 (Proxmox).
# Usage (en root dans le conteneur) :
#   bash install.sh kjpictures.duckdns.org
set -euo pipefail

DOMAIN="${1:-}"
REPO="https://github.com/komjordan/kjpciturescm.git"
BRANCH="${BRANCH:-claude/kj-pictures-showcase-site-5lqdk2}"
APP=/opt/kjpictures
DATA=/var/lib/kjpictures

[ "$(id -u)" = 0 ] || { echo "Lancez ce script en root."; exit 1; }
[ -n "$DOMAIN" ] || { echo "Usage : bash install.sh votre-domaine (ex. kjpictures.duckdns.org)"; exit 1; }

echo "==> Paquets système"
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg git debian-keyring debian-archive-keyring apt-transport-https cron

echo "==> Node.js 22"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi

echo "==> Caddy (reverse proxy + HTTPS automatique)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy
fi

echo "==> Utilisateur et dossiers"
id kjpictures >/dev/null 2>&1 || useradd --system --home "$DATA" --shell /usr/sbin/nologin kjpictures
mkdir -p "$DATA" /etc/kjpictures
chown -R kjpictures:kjpictures "$DATA"
chmod 750 "$DATA"

echo "==> Code du site"
if [ -d "$APP/.git" ]; then
  git -C "$APP" fetch -q origin "$BRANCH" && git -C "$APP" reset -q --hard "origin/$BRANCH"
else
  git clone -q --branch "$BRANCH" "$REPO" "$APP"
fi
cd "$APP"
npm ci --omit=dev --no-audit --no-fund

echo "==> Service systemd"
install -m 644 deploy/kjpictures.service /etc/systemd/system/kjpictures.service
systemctl daemon-reload

if [ ! -f "$DATA/admin.json" ]; then
  echo "==> Mot de passe administrateur"
  until runuser -u kjpictures -- env STORAGE_DIR="$DATA" node server/set-password.js </dev/tty; do
    echo "Recommencez."
  done
fi
systemctl enable --now kjpictures
systemctl restart kjpictures

echo "==> Configuration de Caddy pour $DOMAIN"
sed "s/^kjpictures.duckdns.org {/$DOMAIN {/" deploy/Caddyfile > /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy

echo
echo "✔ Installation terminée."
echo "  Site  : https://$DOMAIN"
echo "  Admin : https://$DOMAIN/admin"
echo "  Logs  : journalctl -u kjpictures -f"
