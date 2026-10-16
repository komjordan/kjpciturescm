#!/usr/bin/env bash
# Sauvegarde des photos et du contenu de l'admin (à lancer chaque nuit par cron).
set -euo pipefail
DEST="${1:-/root/backups}"
mkdir -p "$DEST"
tar -czf "$DEST/kjpictures-$(date +%F).tar.gz" -C /var/lib kjpictures
find "$DEST" -name 'kjpictures-*.tar.gz' -mtime +14 -delete
