// Stockage local sur fichiers JSON (remplace MongoDB).
// Les données sont écrites dans un dossier propre à l'utilisateur.
// - En application Electron : MEDICAL_DATA_DIR est fourni par le process principal
//   (app.getPath('userData')).
// - En exécution serveur classique (`next start`) : dossier par défaut selon l'OS.

import fs from 'fs';
import path from 'path';
import os from 'os';

function getDataDir() {
  if (process.env.MEDICAL_DATA_DIR) {
    return process.env.MEDICAL_DATA_DIR;
  }

  // Emplacement par défaut selon la plateforme (hors Electron)
  let base;
  if (process.platform === 'win32') {
    base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  } else if (process.platform === 'darwin') {
    base = path.join(os.homedir(), 'Library', 'Application Support');
  } else {
    base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  }
  return path.join(base, 'medical-planner');
}

function filePath(name) {
  return path.join(getDataDir(), `${name}.json`);
}

export function readCollection(name) {
  try {
    const fp = filePath(name);
    if (!fs.existsSync(fp)) return [];
    const raw = fs.readFileSync(fp, 'utf-8');
    if (!raw.trim()) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error(`Erreur lecture ${name}:`, err);
    return [];
  }
}

export function writeCollection(name, items) {
  const dir = getDataDir();
  fs.mkdirSync(dir, { recursive: true });

  const list = Array.isArray(items) ? items : [];
  const fp = filePath(name);
  const tmp = `${fp}.tmp`;

  // Écriture atomique : on écrit dans un fichier temporaire puis on renomme.
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2), 'utf-8');
  fs.renameSync(tmp, fp);

  return list.length;
}

export function getDataDirectory() {
  return getDataDir();
}
