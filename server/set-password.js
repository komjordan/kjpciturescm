'use strict';
/* Définit ou change le mot de passe admin : npm run set-password */
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const auth = require('./auth');

const STORAGE = path.resolve(process.env.STORAGE_DIR || path.join(__dirname, '..', 'storage'));
fs.mkdirSync(STORAGE, { recursive: true });
delete process.env.ADMIN_PASSWORD;
auth.init(STORAGE);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
let muted = false;
rl._writeToOutput = (s) => { if (!muted) rl.output.write(s); else if (s.includes('\n')) rl.output.write('\n'); };
const lines = [], waiting = [];
rl.on('line', (l) => (waiting.length ? waiting.shift()(l) : lines.push(l)));
rl.on('close', () => waiting.splice(0).forEach(r => r(null)));
const ask = (q) => {
  muted = false; rl.output.write(q); muted = true;
  return lines.length ? Promise.resolve(lines.shift()) : new Promise(r => waiting.push(r));
};

(async () => {
  const p1 = await ask('Nouveau mot de passe admin (10 caractères minimum) : ');
  const p2 = await ask('Confirmez : ');
  muted = false;
  rl.close();
  if (p1 === null || p2 === null) { console.error('\nSaisie interrompue.'); process.exit(1); }
  if (p1.length < 10) { console.error('\nTrop court.'); process.exit(1); }
  if (p1 !== p2) { console.error('\nLes mots de passe ne correspondent pas.'); process.exit(1); }
  await auth.setPassword(p1);
  console.log('\n✔ Mot de passe enregistré. Redémarrez le service pour l\'appliquer : systemctl restart kjpictures');
})();
