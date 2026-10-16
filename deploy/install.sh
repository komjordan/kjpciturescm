#!/usr/bin/env bash
# Installation de KJ Pictures sur Debian 12 (VPS ou conteneur LXC Proxmox).
# Usage (en root) :
#   bash install.sh kjpictures.duckdns.org
# Options (variables d'environnement) :
#   APP_PORT=3000   port interne du site (changez-le s'il est déjà pris)
#   ADMIN_PASSWORD  mot de passe admin initial, sans saisie au clavier (10 caractères min.)
#   BRANCH=...      branche Git à déployer
set -euo pipefail

DOMAIN="${1:-}"
REPO="https://github.com/komjordan/kjpciturescm.git"
BRANCH="${BRANCH:-claude/kj-pictures-showcase-site-5lqdk2}"
APP_PORT="${APP_PORT:-3000}"
APP=/opt/kjpictures
DATA=/var/lib/kjpictures

[ "$(id -u)" = 0 ] || { echo "Lancez ce script en root."; exit 1; }
[ -n "$DOMAIN" ] || { echo "Usage : bash install.sh votre-domaine (ex. kjpictures.duckdns.org)"; exit 1; }

echo "==> Paquets système"
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg git debian-keyring debian-archive-keyring apt-transport-https cron iproute2 dnsutils

# Qui écoute déjà sur le port 80 ? (autre site déjà présent sur le serveur)
listener() { ss -ltnpH "sport = :$1" 2>/dev/null | grep -o 'users:(("[^"]*' | head -1 | cut -d'"' -f2 || true; }
WEB="$(listener 80)"
case "$WEB" in
  ""|caddy) PROXY=caddy ;;
  nginx)    PROXY=nginx ;;
  apache2|httpd) PROXY=apache ;;
  *) echo "⚠  Le port 80 est utilisé par « $WEB ». Libérez-le ou configurez ce serveur web vers 127.0.0.1:$APP_PORT."; PROXY=none ;;
esac
echo "    Serveur web utilisé : $PROXY"

# Port interne libre ?
USED="$(listener "$APP_PORT")"
if [ -n "$USED" ] && ! systemctl is-active --quiet kjpictures; then
  echo "✖ Le port $APP_PORT est déjà utilisé par « $USED ». Relancez avec un autre port, ex. : APP_PORT=3080 bash install.sh $DOMAIN"
  exit 1
fi

# Le domaine pointe-t-il bien vers ce serveur ? (nécessaire pour le certificat HTTPS)
PUBIP="$(curl -fsS4 https://api.ipify.org || true)"
DNSIP="$(dig +short A "$DOMAIN" | tail -1 || true)"
if [ -n "$PUBIP" ] && [ "$PUBIP" != "$DNSIP" ]; then
  echo "⚠  $DOMAIN pointe vers « ${DNSIP:-rien} » alors que ce serveur a l'IP $PUBIP."
  echo "   Le HTTPS ne fonctionnera qu'une fois le DNS corrigé (DuckDNS : mettez $PUBIP dans le champ « current ip »)."
fi

echo "==> Node.js 22"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
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

echo "==> Service systemd (port interne $APP_PORT)"
install -m 644 deploy/kjpictures.service /etc/systemd/system/kjpictures.service
mkdir -p /etc/systemd/system/kjpictures.service.d
printf '[Service]\nEnvironment=PORT=%s\n' "$APP_PORT" > /etc/systemd/system/kjpictures.service.d/port.conf
systemctl daemon-reload

if [ ! -f "$DATA/admin.json" ]; then
  echo "==> Mot de passe administrateur"
  if [ -n "${ADMIN_PASSWORD:-}" ]; then
    # Mode non interactif (automatisation) : ADMIN_PASSWORD=... bash install.sh domaine
    [ "${#ADMIN_PASSWORD}" -ge 10 ] || { echo "✖ ADMIN_PASSWORD doit faire au moins 10 caractères."; exit 1; }
    printf '%s\n%s\n' "$ADMIN_PASSWORD" "$ADMIN_PASSWORD" | runuser -u kjpictures -- env STORAGE_DIR="$DATA" node server/set-password.js >/dev/null
  elif [ -t 0 ] || { : </dev/tty; } 2>/dev/null; then
    until runuser -u kjpictures -- env STORAGE_DIR="$DATA" node server/set-password.js </dev/tty; do
      echo "Recommencez."
    done
  else
    echo "✖ Pas de terminal pour saisir le mot de passe : relancez avec ADMIN_PASSWORD=... bash install.sh $DOMAIN"
    exit 1
  fi
fi
unset ADMIN_PASSWORD
systemctl enable --now kjpictures
systemctl restart kjpictures

# Pare-feu local éventuel
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
fi

case "$PROXY" in
  caddy)
    echo "==> Caddy (HTTPS automatique)"
    FRESH=0
    if ! command -v caddy >/dev/null; then
      curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
      curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
      apt-get update -qq && apt-get install -y -qq caddy
      FRESH=1
    fi
    mkdir -p /etc/caddy/sites
    sed -e "s/^kjpictures.duckdns.org {/$DOMAIN {/" -e "s/127.0.0.1:3000/127.0.0.1:$APP_PORT/" deploy/Caddyfile > /etc/caddy/sites/kjpictures.caddy
    if [ "$FRESH" = 1 ]; then
      echo 'import sites/*.caddy' > /etc/caddy/Caddyfile   # remplace la page d'accueil par défaut de Caddy
    elif ! grep -q 'import sites/\*.caddy' /etc/caddy/Caddyfile; then
      printf '\nimport sites/*.caddy\n' >> /etc/caddy/Caddyfile   # garde vos sites Caddy existants
    fi
    caddy validate --config /etc/caddy/Caddyfile >/dev/null
    systemctl reload caddy || systemctl restart caddy
    ;;
  nginx)
    echo "==> Nginx déjà présent : ajout du site + certificat Let's Encrypt"
    apt-get install -y -qq certbot python3-certbot-nginx
    sed -e "s/kjpictures.duckdns.org/$DOMAIN/g" -e "s/127.0.0.1:3000/127.0.0.1:$APP_PORT/" deploy/nginx.conf > /etc/nginx/sites-available/kjpictures
    ln -sf /etc/nginx/sites-available/kjpictures /etc/nginx/sites-enabled/kjpictures
    nginx -t && systemctl reload nginx
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect || \
      echo "⚠  Certificat non obtenu (DNS pas encore à jour ?). Relancez plus tard : certbot --nginx -d $DOMAIN --redirect"
    ;;
  apache)
    echo "⚠  Apache est déjà présent : ajoutez un VirtualHost $DOMAIN avec"
    echo "   ProxyPass / http://127.0.0.1:$APP_PORT/  et  ProxyPassReverse / http://127.0.0.1:$APP_PORT/"
    echo "   (a2enmod proxy proxy_http headers) puis : certbot --apache -d $DOMAIN"
    ;;
esac

echo
echo "✔ Installation terminée."
echo "  Site  : https://$DOMAIN"
echo "  Admin : https://$DOMAIN/admin"
echo "  Logs  : journalctl -u kjpictures -f"
