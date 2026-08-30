// Backend « fichier local » : better-sqlite3 (application Electron / dev local).
// Base unique `memomed.db` dans le dossier de données de l'application.

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  MIGRATIONS, SQL, assembleCourses, rowToConstraint,
  courseParams, sessionParams, constraintParams,
} from './schema.js';

function getDataDir() {
  if (process.env.MEMOMED_DATA_DIR) return process.env.MEMOMED_DATA_DIR;
  if (process.env.MEDICAL_DATA_DIR) return process.env.MEDICAL_DATA_DIR; // héritage
  let base;
  if (process.platform === 'win32') {
    base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  } else if (process.platform === 'darwin') {
    base = path.join(os.homedir(), 'Library', 'Application Support');
  } else {
    base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  }
  return path.join(base, 'MémoMed');
}

function migrate(db) {
  const current = db.pragma('user_version', { simple: true });
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      MIGRATIONS[v].forEach((sql) => db.exec(sql));
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

let _db = null;
function getDb() {
  if (_db) return _db;
  const dir = getDataDir();
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, 'memomed.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  importLegacyJson(db, dir);
  _db = db;
  return db;
}

// Import unique des anciens fichiers JSON, au premier lancement seulement.
function importLegacyJson(db, dir) {
  if (db.prepare('SELECT COUNT(*) AS c FROM courses').get().c > 0) return;
  const readJson = (name) => {
    try {
      const fp = path.join(dir, name);
      if (!fs.existsSync(fp)) return [];
      const raw = fs.readFileSync(fp, 'utf-8');
      const data = raw.trim() ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch { return []; }
  };
  const courses = readJson('courses.json');
  const constraints = readJson('constraints.json');
  if (courses.length || constraints.length) {
    writeCoursesSync(db, courses);
    writeConstraintsSync(db, constraints);
    console.log(`[db] Import JSON → SQLite : ${courses.length} cours, ${constraints.length} contraintes`);
  }
}

function writeCoursesSync(db, courses) {
  const list = Array.isArray(courses) ? courses : [];
  const delS = db.prepare(SQL.deleteSessions);
  const delC = db.prepare(SQL.deleteCourses);
  const insC = db.prepare(SQL.insertCourse);
  const insS = db.prepare(SQL.insertSession);
  db.transaction(() => {
    delS.run();
    delC.run();
    list.forEach((c, ci) => {
      insC.run(...courseParams(c, ci));
      (c.sessions || []).forEach((s, si) => insS.run(...sessionParams(s, c.id, si)));
    });
  })();
  return list.length;
}

function writeConstraintsSync(db, list) {
  const arr = Array.isArray(list) ? list : [];
  const del = db.prepare(SQL.deleteConstraints);
  const ins = db.prepare(SQL.insertConstraint);
  db.transaction(() => {
    del.run();
    arr.forEach((k) => ins.run(...constraintParams(k)));
  })();
  return arr.length;
}

// ---- API (asynchrone pour rester interchangeable avec le backend Turso) ----
export async function readCourses() {
  const db = getDb();
  return assembleCourses(
    db.prepare(SQL.selectCourses).all(),
    db.prepare(SQL.selectAllSessions).all()
  );
}

export async function writeCourses(courses) {
  return writeCoursesSync(getDb(), courses);
}

export async function readConstraints() {
  return getDb().prepare(SQL.selectConstraints).all().map(rowToConstraint);
}

export async function writeConstraints(list) {
  return writeConstraintsSync(getDb(), list);
}

export async function countCourses() {
  return getDb().prepare('SELECT COUNT(*) AS c FROM courses').get().c;
}
