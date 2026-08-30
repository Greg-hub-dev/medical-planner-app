// Sélection du backend de stockage :
//   - TURSO_DATABASE_URL défini  → base hébergée Turso/libSQL (déploiement Vercel)
//   - sinon                      → fichier SQLite local (application Electron / dev)
//
// Les deux modules sont chargés en import dynamique : Vercel ne charge jamais le
// module natif better-sqlite3, et Electron ne charge jamais le client libSQL.

const isTurso = () => !!process.env.TURSO_DATABASE_URL;

let _backend = null;
async function backend() {
  if (_backend) return _backend;
  _backend = isTurso() ? await import('./turso.js') : await import('./localSqlite.js');
  return _backend;
}

/** Indique quel backend est actif (utile pour l'affichage / le débogage). */
export function backendName() {
  return isTurso() ? 'turso' : 'local-sqlite';
}

export async function readCourses() {
  return (await backend()).readCourses();
}

export async function writeCourses(courses) {
  return (await backend()).writeCourses(courses);
}

export async function readConstraints() {
  return (await backend()).readConstraints();
}

export async function writeConstraints(list) {
  return (await backend()).writeConstraints(list);
}
