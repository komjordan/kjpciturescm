# KJ Pictures — site vitrine

Site vitrine du studio photo **KJ Pictures** (Bafoussam, Cameroun).
Site statique en HTML, CSS et JavaScript, sans dépendance ni build : il suffit d'ouvrir `index.html`.

## Contenu

- **Accueil** : diaporama plein écran animé (effet Ken Burns), particules dorées, texte qui défile (Mariage, Anniversaire…), boutons de réservation
- **Le studio** : présentation, compteurs animés, logo flottant
- **Services** : 6 prestations sur cartes 3D (effet tilt au survol)
- **Portfolio** : 70 photos, filtres par catégorie, chargement progressif, visionneuse plein écran (clavier et swipe mobile)
- **Bandeaux photo** qui défilent avec le scroll, section parallaxe
- **Contact** : téléphones, e-mail, adresse, carte Google Maps, formulaire qui ouvre WhatsApp avec le message déjà rempli
- Bouton WhatsApp flottant, écran de chargement « obturateur photo », curseur personnalisé, barre de progression
- Adapté au mobile, référencement (balises meta, Open Graph, données structurées)

## Sources des contenus

| Élément | Source |
|---|---|
| Logo doré 3D et 70 photos | Page Facebook [KjPicturesCM](https://www.facebook.com/KjPicturesCM) |
| Logo brodé, slogan, téléphone | Profil TikTok [@gill.photo8](https://www.tiktok.com/@gill.photo8) |
| E-mail, 2e numéro, adresse | Affiche « Happy labour day » publiée sur Facebook |
| Instagram | Bloqué sans connexion : seul le lien vers le compte est utilisé |

## Structure

```
index.html
assets/css/style.css
assets/js/main.js           ← liste des photos et catégories (tableau PHOTOS)
assets/img/gallery/         ← photos 1080 px (visionneuse)
assets/img/thumbs/          ← miniatures 560 px (grille)
assets/img/brand/           ← logo, favicon, image de partage
```

**Ajouter une photo** : déposer `kj-XXX.webp` dans `gallery/` et `thumbs/`, puis ajouter `['XXX', 'categorie']` dans le tableau `PHOTOS` de `assets/js/main.js` (`portrait`, `enfant`, `culture`, `duo`, `pro`).

## Mise en ligne gratuite avec GitHub Pages

1. Dépôt GitHub → **Settings** → **Pages**
2. *Source* : **Deploy from a branch**
3. *Branch* : choisir la branche du site, dossier **/ (root)**, puis **Save**
4. Une ou deux minutes plus tard, le site est disponible à l'adresse
   **https://komjordan.github.io/kjpciturescm/**

> Sur un compte GitHub gratuit, GitHub Pages ne fonctionne qu'avec un dépôt **public**.

## Brancher un nom de domaine plus tard (ex. `kjpictures.cm`)

1. Acheter le domaine chez un registraire (Namecheap, OVH, Hostinger…)
2. Dans la zone DNS du domaine :
   - 4 enregistrements **A** pour `@` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - 1 enregistrement **CNAME** pour `www` → `komjordan.github.io`
3. GitHub → Settings → Pages → *Custom domain* : saisir le domaine, puis cocher **Enforce HTTPS**

L'hébergement reste gratuit : seul le nom de domaine est payant.
