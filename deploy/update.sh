#!/usr/bin/env bash
# Met à jour le code du site sans toucher aux photos ni aux réglages de l'admin.
set -euo pipefail
BRANCH="${BRANCH:-claude/kj-pictures-showcase-site-5lqdk2}"
cd /opt/kjpictures
git fetch -q origin "$BRANCH" && git reset -q --hard "origin/$BRANCH"
npm ci --omit=dev --no-audit --no-fund
systemctl restart kjpictures
echo "✔ Site mis à jour."
