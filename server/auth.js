'use strict';
/* Authentification admin : mot de passe haché (scrypt) + cookie de session signé (HMAC). */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const COOKIE = 'kj_admin';
const SESSION_MS = 12 * 60 * 60 * 1000; // 12 h
let file, secret, cred = null;

function init(storageDir) {
  file = path.join(storageDir, 'admin.json');
  const secretFile = path.join(storageDir, 'secret.key');
  if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
  secret = fs.readFileSync(secretFile, 'utf8').trim();
  if (fs.existsSync(file)) cred = JSON.parse(fs.readFileSync(file, 'utf8'));
  else if (process.env.ADMIN_PASSWORD) setPasswordSync(process.env.ADMIN_PASSWORD);
}

function hash(password, salt) {
  return crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
}
function setPasswordSync(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  cred = { salt, hash: hash(password, salt), version: crypto.randomBytes(4).toString('hex') };
  fs.writeFileSync(file, JSON.stringify(cred), { mode: 0o600 });
}
async function setPassword(password) { setPasswordSync(password); }
const hasPassword = () => !!cred;

function checkPassword(password) {
  if (!cred || !password) return false;
  const a = Buffer.from(hash(password, cred.salt), 'hex');
  const b = Buffer.from(cred.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const sign = (data) => crypto.createHmac('sha256', secret).update(data).digest('base64url');

function setSession(req, res) {
  const payload = `${Date.now() + SESSION_MS}.${cred.version}`;
  res.cookie(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: SESSION_MS, path: '/'
  });
}
function clearSession(req, res) { res.clearCookie(COOKIE, { path: '/' }); }

function readCookie(req) {
  const raw = req.headers.cookie || '';
  const m = raw.split(/;\s*/).find(c => c.startsWith(`${COOKIE}=`));
  return m ? decodeURIComponent(m.slice(COOKIE.length + 1)) : null;
}
function isAuthenticated(req) {
  if (!cred) return false;
  const token = readCookie(req);
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [exp, version, sig] = parts;
  const expected = sign(`${exp}.${version}`);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  return version === cred.version && Number(exp) > Date.now();
}

/* Limite les essais de mot de passe : 8 échecs par IP toutes les 15 minutes */
const attempts = new Map();
function loginLimiter(req, res, next) {
  const now = Date.now(), key = req.ip;
  const a = attempts.get(key);
  if (a && a.until > now && a.count >= 8) {
    return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans 15 minutes.' });
  }
  res.on('finish', () => {
    if (res.statusCode === 401) {
      const cur = attempts.get(key);
      attempts.set(key, cur && cur.until > now ? { ...cur, count: cur.count + 1 } : { count: 1, until: now + 15 * 60 * 1000 });
    } else if (res.statusCode === 200) attempts.delete(key);
  });
  next();
}

module.exports = { init, setPassword, hasPassword, checkPassword, setSession, clearSession, isAuthenticated, loginLimiter };
