// Prépare la sortie `.next/standalone` pour l'empaquetage Electron.
// Next ne copie pas automatiquement les assets statiques ni le dossier public
// à côté du serveur autonome : on le fait ici, de façon multi-plateforme.

import fs from 'fs';
import path from 'path';

const root = process.cwd();
const standalone = path.join(root, '.next', 'standalone');

if (!fs.existsSync(standalone)) {
  console.error(
    'Sortie standalone introuvable. Vérifiez que next.config.js contient output: "standalone" et lancez `next build`.'
  );
  process.exit(1);
}

// Assets statiques -> .next/standalone/.next/static
fs.cpSync(
  path.join(root, '.next', 'static'),
  path.join(standalone, '.next', 'static'),
  { recursive: true }
);

// Dossier public -> .next/standalone/public
const publicDir = path.join(root, 'public');
if (fs.existsSync(publicDir)) {
  fs.cpSync(publicDir, path.join(standalone, 'public'), { recursive: true });
}

// Module natif better-sqlite3 : on copie la version courante de node_modules dans
// le standalone (elle doit être compilée pour l'ABI Electron — voir `rebuild:electron`).
const bs = path.join(root, 'node_modules', 'better-sqlite3');
if (fs.existsSync(bs)) {
  fs.cpSync(bs, path.join(standalone, 'node_modules', 'better-sqlite3'), { recursive: true });
  console.log('✅ better-sqlite3 (binaire natif) copié dans le standalone.');
}

console.log('✅ Standalone préparé pour Electron.');
