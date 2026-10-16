# KJ Pictures — site vitrine + espace admin

Site du studio photo **KJ Pictures** (Bafoussam, Cameroun) avec un **espace d'administration** pour gérer le contenu sans toucher au code.

- **Site public** : accueil animé, studio, services, **packages**, portfolio filtrable, contact WhatsApp
- **Admin** (`/admin`) : photos, catégories, packages, photos du studio et du matériel, mot de passe

## Ce que l'admin permet

| Onglet | Actions |
|---|---|
| 📷 Photos | Envoyer plusieurs photos à la fois (redimensionnées et converties en WebP automatiquement), changer la catégorie, supprimer, **réorganiser par glisser-déposer** |
| 🏷️ Catégories | Créer (Mariage, Anniversaire…), renommer, réordonner les filtres, supprimer (les photos sont déplacées vers une autre catégorie) |
| 💰 Packages | Créer, modifier, supprimer, réordonner ; nom, prix FCFA, description, contenu (une ligne par élément), badge « Populaire » |
| 🎬 Studio & matériel | Photos du studio, des décors et des appareils, avec légende ; affichées dans la section « Le studio » |
| 🔒 Compte | Changer le mot de passe |

Sur le site, chaque package a un bouton **« Réserver ce package »** qui ouvre WhatsApp avec le nom et le prix déjà écrits.

## Architecture

```
index.html, assets/          site public (HTML/CSS/JS)
admin/                       interface d'administration
server/server.js             serveur Node.js (Express) + API
server/auth.js               mot de passe haché (scrypt) + session signée
data/content.seed.json       contenu de départ (70 photos, 5 catégories, 2 packages)
deploy/                      scripts d'installation Proxmox / Caddy / DuckDNS
storage/  (créé au 1er lancement, non versionné)
  content.json               contenu modifié par l'admin
  uploads/                   photos envoyées
  admin.json, secret.key     mot de passe haché, clé de session
```

Il n'y a pas de base de données à gérer : tout le contenu tient dans un fichier JSON. Les photos et les réglages sont dans `storage/` (ou `/var/lib/kjpictures` en production) : **c'est le seul dossier à sauvegarder**.

Sécurité : mot de passe haché, cookie de session `HttpOnly`/`SameSite=Strict`, protection CSRF, blocage après 8 essais ratés, fichiers renommés et ré-encodés par le serveur.

## Lancer en local

```bash
npm install
npm run set-password   # choisir le mot de passe admin
npm start              # http://localhost:3000  et  http://localhost:3000/admin
```

---

# 🖥️ Hébergement sur Proxmox

## 1. Créer le conteneur LXC

Dans Proxmox : **Create CT**
- Modèle : `debian-12-standard`
- Ressources : 1 vCPU, **1 Go de RAM**, **16 Go de disque** (les photos prennent de la place)
- Réseau : IP fixe, par exemple `192.168.1.50/24`, avec la passerelle de la box
- Options : conteneur non privilégié et `nesting=1` (valeurs par défaut)

## 2. Obtenir un nom de domaine gratuit : DuckDNS

1. Allez sur **https://www.duckdns.org** et connectez-vous (Google, GitHub…)
2. Créez le sous-domaine `kjpictures`, ce qui donne **kjpictures.duckdns.org**
3. Notez le **token** affiché en haut de la page

DuckDNS est gratuit, sans limite de durée, et met à jour l'IP automatiquement si votre box change d'IP.

## 3. Ouvrir les ports sur la box / le routeur

Redirigez **TCP 80** et **TCP 443** vers l'IP du conteneur (`192.168.1.50`).
Le port 80 sert à obtenir le certificat HTTPS, le 443 au site.

## 4. Installer le site (une seule commande)

Dans la console du conteneur (en root) :

```bash
apt-get update && apt-get install -y curl
curl -fsSL https://raw.githubusercontent.com/komjordan/kjpciturescm/claude/kj-pictures-showcase-site-5lqdk2/deploy/install.sh -o install.sh
bash install.sh kjpictures.duckdns.org
```

Le script installe Node.js 22, Caddy (HTTPS automatique avec Let's Encrypt) et le service `kjpictures`, puis demande le mot de passe admin.

Activez ensuite la mise à jour de l'IP DuckDNS :

```bash
cat > /etc/kjpictures/duckdns.env <<'EOT'
DOMAIN=kjpictures
TOKEN=collez-votre-token-ici
EOT
chmod 600 /etc/kjpictures/duckdns.env
(crontab -l 2>/dev/null; echo "*/5 * * * * /opt/kjpictures/deploy/duckdns.sh") | crontab -
/opt/kjpictures/deploy/duckdns.sh && cat /var/lib/kjpictures/duckdns.log   # doit afficher OK
```

✅ Site : **https://kjpictures.duckdns.org** · Admin : **https://kjpictures.duckdns.org/admin**

## 5. Entretien

| Besoin | Commande |
|---|---|
| Mettre à jour le site après une modification du code | `bash /opt/kjpictures/deploy/update.sh` |
| Voir les journaux | `journalctl -u kjpictures -f` |
| Redémarrer | `systemctl restart kjpictures` |
| Mot de passe oublié | `runuser -u kjpictures -- env STORAGE_DIR=/var/lib/kjpictures node /opt/kjpictures/server/set-password.js && systemctl restart kjpictures` |
| Sauvegarde chaque nuit | `(crontab -l; echo "30 3 * * * /opt/kjpictures/deploy/backup.sh") \| crontab -` |

Pensez aussi aux **sauvegardes Proxmox** du conteneur (Datacenter → Backup).

### Variante Docker

```bash
echo "ADMIN_PASSWORD=un-mot-de-passe-solide" > .env
docker compose up -d --build     # site sur le port 3000, données dans le volume kj-data
```
Placez un reverse proxy (Caddy, Nginx Proxy Manager…) devant pour le HTTPS.

---

# 🌐 Passer à un nom de domaine payant plus tard

1. Achetez le domaine, par exemple `kjpictures.com` (environ 10–15 € par an chez Cloudflare, OVH, Namecheap…) ou un `.cm`
2. Dans la zone DNS du domaine :
   - `kjpictures.com` → enregistrement **A** vers l'IP publique de la box
     *(ou, si l'IP change souvent : `www` en **CNAME** vers `kjpictures.duckdns.org`)*
   - `www` → **CNAME** vers `kjpictures.com`
3. Dans le conteneur, modifiez `/etc/caddy/Caddyfile` :
   ```
   kjpictures.com, www.kjpictures.com, kjpictures.duckdns.org {
   ```
   puis `systemctl reload caddy`. Le certificat HTTPS du nouveau domaine est créé tout seul.

> **Pas de ports ouvrables (box 4G/5G, CGNAT) ?** Utilisez **Cloudflare Tunnel** : le domaine doit être géré par Cloudflare (donc après l'achat), mais il n'y a aucun port à ouvrir.

---

## GitHub Pages

La version GitHub Pages (https://komjordan.github.io/kjpciturescm/) reste une **vitrine statique** : elle affiche le contenu de départ (`data/content.seed.json`), mais l'admin n'y fonctionne pas. Une fois le serveur Proxmox en ligne, désactivez Pages (Settings → Pages) pour éviter d'avoir deux versions différentes du site.
