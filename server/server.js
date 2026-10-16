'use strict';
/*
 * KJ Pictures — serveur du site + API d'administration.
 * Données : storage/content.json (créé depuis data/content.seed.json au premier lancement)
 * Photos envoyées : storage/uploads/{gallery,thumbs,studio}
 */
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const auth = require('./auth');

const ROOT = path.resolve(__dirname, '..');
const STORAGE = path.resolve(process.env.STORAGE_DIR || path.join(ROOT, 'storage'));
const UPLOADS = path.join(STORAGE, 'uploads');
const CONTENT_FILE = path.join(STORAGE, 'content.json');
const SEED_FILE = path.join(ROOT, 'data', 'content.seed.json');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

for (const d of ['gallery', 'thumbs', 'studio']) fs.mkdirSync(path.join(UPLOADS, d), { recursive: true });
if (!fs.existsSync(CONTENT_FILE)) fs.copyFileSync(SEED_FILE, CONTENT_FILE);
auth.init(STORAGE);

/* ---------- Stockage JSON (écritures sérialisées et atomiques) ---------- */
let content = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));
let writing = Promise.resolve();
function save() {
  const data = JSON.stringify(content, null, 2);
  writing = writing.then(async () => {
    const tmp = `${CONTENT_FILE}.${process.pid}.tmp`;
    await fsp.writeFile(tmp, data);
    await fsp.rename(tmp, CONTENT_FILE);
  });
  return writing;
}

const newId = (prefix) => `${prefix}-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);

/* ---------- Application ---------- */
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === '0' ? false : 'loopback, linklocal, uniquelocal');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN'
  });
  next();
});
app.use(express.json({ limit: '200kb' }));

/* Fichiers publics : uniquement ce qui doit l'être */
const staticOpts = { maxAge: '7d', fallthrough: true };
app.use('/assets', express.static(path.join(ROOT, 'assets'), staticOpts));
app.use('/uploads', express.static(UPLOADS, { maxAge: '30d', fallthrough: false }));
app.use('/admin', express.static(path.join(ROOT, 'admin'), { maxAge: 0 }));
app.get('/data/content.seed.json', (req, res) => res.redirect(301, '/api/content'));
app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(ROOT, 'index.html')));

/* ---------- API publique ---------- */
app.get('/api/content', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.json(content);
});

/* ---------- Authentification ---------- */
app.post('/api/login', auth.loginLimiter, (req, res) => {
  if (!auth.hasPassword()) return res.status(503).json({ error: "Aucun mot de passe admin n'est configuré sur le serveur." });
  if (!auth.checkPassword(str(req.body.password, 200))) return res.status(401).json({ error: 'Mot de passe incorrect.' });
  auth.setSession(req, res);
  res.json({ ok: true });
});
app.post('/api/logout', (req, res) => { auth.clearSession(req, res); res.json({ ok: true }); });
app.get('/api/me', (req, res) => res.json({ authenticated: auth.isAuthenticated(req) }));

/* Toutes les routes /api/admin exigent une session + un en-tête anti-CSRF */
const admin = express.Router();
admin.use((req, res, next) => {
  if (!auth.isAuthenticated(req)) return res.status(401).json({ error: 'Session expirée, reconnectez-vous.' });
  if (req.method !== 'GET' && req.get('X-Requested-With') !== 'kj-admin') return res.status(403).json({ error: 'Requête refusée.' });
  next();
});
app.use('/api/admin', admin);

admin.post('/password', async (req, res) => {
  const current = str(req.body.current, 200), next = str(req.body.next, 200);
  if (!auth.checkPassword(current)) return res.status(400).json({ error: 'Mot de passe actuel incorrect.' });
  if (next.length < 10) return res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 10 caractères.' });
  await auth.setPassword(next);
  auth.setSession(req, res);
  res.json({ ok: true });
});

/* ---------- Envoi d'images ---------- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 30 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpe?g|png|webp|heic|heif|avif)$/i.test(file.mimetype))
});

async function processImage(buffer, kind) {
  const id = newId(kind === 'studio' ? 'st' : 'ph');
  const base = sharp(buffer, { failOn: 'error' }).rotate();
  const meta = await base.metadata();
  if (!meta.width || !meta.height) throw new Error('Image illisible');
  const dir = kind === 'studio' ? 'studio' : 'gallery';
  await base.clone().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 }).toFile(path.join(UPLOADS, dir, `${id}.webp`));
  await base.clone().resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 74 }).toFile(path.join(UPLOADS, 'thumbs', `${id}.webp`));
  return { id, src: `uploads/${dir}/${id}.webp`, thumb: `uploads/thumbs/${id}.webp` };
}

async function removeFiles(item) {
  for (const rel of [item.src, item.thumb]) {
    if (!rel || !rel.startsWith('uploads/')) continue; // on ne supprime jamais les photos d'origine du dépôt
    const abs = path.resolve(UPLOADS, rel.slice('uploads/'.length));
    if (abs.startsWith(UPLOADS + path.sep)) await fsp.rm(abs, { force: true });
  }
}

const uploadHandler = (kind) => [upload.array('photos', 30), async (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'Aucune image valide reçue (JPG, PNG, WebP, HEIC).' });
  const cat = str(req.body.cat, 60);
  if (kind === 'photo' && !content.categories.some(c => c.id === cat)) return res.status(400).json({ error: 'Catégorie inconnue.' });
  const added = [], failed = [];
  for (const f of req.files) {
    try {
      const img = await processImage(f.buffer, kind);
      const item = kind === 'photo' ? { ...img, cat } : { ...img, caption: str(req.body.caption, 120) };
      added.push(item);
    } catch { failed.push(f.originalname); }
  }
  const list = kind === 'photo' ? content.photos : content.studio;
  // Les nouvelles photos apparaissent en premier
  list.unshift(...added);
  await save();
  res.json({ added, failed });
}];

/* ---------- Photos du portfolio ---------- */
admin.post('/photos', uploadHandler('photo'));
admin.patch('/photos/:id', async (req, res) => {
  const p = content.photos.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Photo introuvable.' });
  if (req.body.cat !== undefined) {
    if (!content.categories.some(c => c.id === req.body.cat)) return res.status(400).json({ error: 'Catégorie inconnue.' });
    p.cat = req.body.cat;
  }
  await save();
  res.json(p);
});
admin.delete('/photos/:id', async (req, res) => {
  const i = content.photos.findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Photo introuvable.' });
  const [p] = content.photos.splice(i, 1);
  await save();
  await removeFiles(p);
  res.json({ ok: true });
});

/* ---------- Photos du studio / matériel ---------- */
admin.post('/studio', uploadHandler('studio'));
admin.patch('/studio/:id', async (req, res) => {
  const s = content.studio.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'Photo introuvable.' });
  if (req.body.caption !== undefined) s.caption = str(req.body.caption, 120);
  await save();
  res.json(s);
});
admin.delete('/studio/:id', async (req, res) => {
  const i = content.studio.findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Photo introuvable.' });
  const [s] = content.studio.splice(i, 1);
  await save();
  await removeFiles(s);
  res.json({ ok: true });
});

/* ---------- Réorganisation (photos, studio, packages, catégories) ---------- */
admin.put('/order/:list', async (req, res) => {
  const name = { photos: 'photos', studio: 'studio', packages: 'packages', categories: 'categories' }[req.params.list];
  if (!name || !Array.isArray(req.body.ids)) return res.status(400).json({ error: 'Requête invalide.' });
  const byId = new Map(content[name].map(x => [x.id, x]));
  const ordered = req.body.ids.map(id => byId.get(id)).filter(Boolean);
  if (ordered.length !== content[name].length || new Set(req.body.ids).size !== ordered.length) {
    return res.status(409).json({ error: 'La liste a changé entre-temps, rechargez la page.' });
  }
  content[name] = ordered;
  await save();
  res.json({ ok: true });
});

/* ---------- Catégories ---------- */
admin.post('/categories', async (req, res) => {
  const label = str(req.body.label, 60);
  if (!label) return res.status(400).json({ error: 'Nom de catégorie requis.' });
  let id = slug(label) || newId('cat');
  while (content.categories.some(c => c.id === id)) id = `${slug(label)}-${crypto.randomBytes(2).toString('hex')}`;
  const cat = { id, label };
  content.categories.push(cat);
  await save();
  res.json(cat);
});
admin.patch('/categories/:id', async (req, res) => {
  const c = content.categories.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Catégorie introuvable.' });
  const label = str(req.body.label, 60);
  if (!label) return res.status(400).json({ error: 'Nom de catégorie requis.' });
  c.label = label;
  await save();
  res.json(c);
});
admin.delete('/categories/:id', async (req, res) => {
  const i = content.categories.findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Catégorie introuvable.' });
  const used = content.photos.filter(p => p.cat === req.params.id).length;
  const moveTo = str(req.body.moveTo, 60);
  if (used) {
    if (!moveTo || moveTo === req.params.id || !content.categories.some(c => c.id === moveTo)) {
      return res.status(400).json({ error: `${used} photo(s) utilisent cette catégorie : choisissez où les déplacer.` });
    }
    content.photos.forEach(p => { if (p.cat === req.params.id) p.cat = moveTo; });
  }
  content.categories.splice(i, 1);
  await save();
  res.json({ ok: true, moved: used });
});

/* ---------- Packages ---------- */
function readPackage(body) {
  const price = Math.round(Number(body.price));
  const items = (Array.isArray(body.items) ? body.items : String(body.items || '').split('\n'))
    .map(s => str(s, 120)).filter(Boolean).slice(0, 15);
  const pkg = {
    name: str(body.name, 80),
    price: Number.isFinite(price) && price >= 0 ? price : null,
    description: str(body.description, 300),
    items,
    highlight: !!body.highlight
  };
  if (!pkg.name) return { error: 'Nom du package requis.' };
  if (pkg.price === null) return { error: 'Prix invalide.' };
  return { pkg };
}
admin.post('/packages', async (req, res) => {
  const { pkg, error } = readPackage(req.body);
  if (error) return res.status(400).json({ error });
  const item = { id: newId('pack'), ...pkg };
  content.packages.push(item);
  await save();
  res.json(item);
});
admin.put('/packages/:id', async (req, res) => {
  const i = content.packages.findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Package introuvable.' });
  const { pkg, error } = readPackage(req.body);
  if (error) return res.status(400).json({ error });
  content.packages[i] = { id: content.packages[i].id, ...pkg };
  await save();
  res.json(content.packages[i]);
});
admin.delete('/packages/:id', async (req, res) => {
  const i = content.packages.findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Package introuvable.' });
  content.packages.splice(i, 1);
  await save();
  res.json({ ok: true });
});

/* ---------- Erreurs ---------- */
app.use('/api', (req, res) => res.status(404).json({ error: 'Introuvable.' }));
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Image trop lourde (20 Mo maximum).' : "Erreur d'envoi des fichiers.";
    return res.status(400).json({ error: msg });
  }
  if (err.status === 404 || err.statusCode === 404) return res.status(404).sendFile(path.join(ROOT, '404.html'));
  console.error(err);
  res.status(500).json({ error: 'Erreur serveur.' });
});
app.use((req, res) => res.status(404).sendFile(path.join(ROOT, '404.html')));

app.listen(PORT, HOST, () => {
  console.log(`KJ Pictures en ligne sur http://${HOST}:${PORT}  (admin : /admin)`);
  if (!auth.hasPassword()) console.warn('⚠  Aucun mot de passe admin : lancez « npm run set-password » ou définissez ADMIN_PASSWORD.');
});
