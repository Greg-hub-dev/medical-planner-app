// Couche de stockage SQLite (prototype) — remplace les fichiers JSON.
// Base locale unique `memomed.db` dans le dossier de données de l'application.
// - Migrations versionnées (PRAGMA user_version).
// - Écriture atomique par transaction.
// - Import automatique des anciens fichiers JSON au premier lancement.

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';

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

// ---- Migrations -----------------------------------------------------------
const MIGRATIONS = [
  // v1 : schéma initial
  (db) => {
    db.exec(`
      CREATE TABLE courses (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        hours_per_day REAL NOT NULL,
        created_at    TEXT NOT NULL,
        ord           INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE sessions (
        id            TEXT PRIMARY KEY,
        course_id     TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        interval      TEXT NOT NULL,
        date          TEXT NOT NULL,
        original_date TEXT NOT NULL,
        completed     INTEGER NOT NULL DEFAULT 0,
        success       INTEGER,
        rescheduled   INTEGER NOT NULL DEFAULT 0,
        ord           INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_sessions_course ON sessions(course_id);
      CREATE INDEX idx_sessions_date ON sessions(date);
      CREATE TABLE constraints (
        id          TEXT PRIMARY KEY,
        date        TEXT NOT NULL,
        end_date    TEXT,
        all_day     INTEGER NOT NULL DEFAULT 1,
        start_hour  REAL NOT NULL DEFAULT 0,
        end_hour    REAL NOT NULL DEFAULT 24,
        description TEXT NOT NULL DEFAULT ''
      );
    `);
  },
];

function migrate(db) {
  const current = db.pragma('user_version', { simple: true });
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      MIGRATIONS[v](db);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

// ---- Connexion (singleton) ------------------------------------------------
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

// ---- Import unique depuis les anciens fichiers JSON -----------------------
function importLegacyJson(db, dir) {
  const count = db.prepare('SELECT COUNT(*) AS c FROM courses').get().c;
  if (count > 0) return;
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
    writeCoursesTx(db, courses);
    writeConstraintsTx(db, constraints);
    console.log(`[db] Import JSON → SQLite : ${courses.length} cours, ${constraints.length} contraintes`);
  }
}

// ---- Cours ----------------------------------------------------------------
function rowToCourse(db, c) {
  const sessions = db
    .prepare('SELECT * FROM sessions WHERE course_id = ? ORDER BY ord, date')
    .all(c.id)
    .map((s) => ({
      id: s.id,
      interval: s.interval,
      date: s.date,
      originalDate: s.original_date,
      completed: !!s.completed,
      success: s.success === null ? null : !!s.success,
      rescheduled: !!s.rescheduled,
    }));
  return { id: c.id, name: c.name, hoursPerDay: c.hours_per_day, createdAt: c.created_at, sessions };
}

function writeCoursesTx(db, courses) {
  const delS = db.prepare('DELETE FROM sessions');
  const delC = db.prepare('DELETE FROM courses');
  const insC = db.prepare('INSERT INTO courses (id, name, hours_per_day, created_at, ord) VALUES (?, ?, ?, ?, ?)');
  const insS = db.prepare(
    'INSERT INTO sessions (id, course_id, interval, date, original_date, completed, success, rescheduled, ord) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const list = Array.isArray(courses) ? courses : [];
  db.transaction(() => {
    delS.run();
    delC.run();
    list.forEach((c, ci) => {
      insC.run(c.id, c.name, c.hoursPerDay, c.createdAt ?? new Date().toISOString(), ci);
      (c.sessions || []).forEach((s, si) => {
        insS.run(
          s.id, c.id, s.interval, s.date, s.originalDate ?? s.date,
          s.completed ? 1 : 0,
          s.success === null || s.success === undefined ? null : (s.success ? 1 : 0),
          s.rescheduled ? 1 : 0, si
        );
      });
    });
  })();
  return list.length;
}

export function readCourses() {
  const db = getDb();
  return db.prepare('SELECT * FROM courses ORDER BY ord, created_at').all().map((c) => rowToCourse(db, c));
}

export function writeCourses(courses) {
  return writeCoursesTx(getDb(), courses);
}

// ---- Contraintes ----------------------------------------------------------
function writeConstraintsTx(db, list) {
  const del = db.prepare('DELETE FROM constraints');
  const ins = db.prepare(
    'INSERT INTO constraints (id, date, end_date, all_day, start_hour, end_hour, description) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const arr = Array.isArray(list) ? list : [];
  db.transaction(() => {
    del.run();
    arr.forEach((k) =>
      ins.run(k.id, k.date, k.endDate ?? null, k.allDay ? 1 : 0, k.startHour ?? 0, k.endHour ?? 24, k.description ?? '')
    );
  })();
  return arr.length;
}

export function readConstraints() {
  const db = getDb();
  return db.prepare('SELECT * FROM constraints ORDER BY date').all().map((k) => ({
    id: k.id,
    date: k.date,
    endDate: k.end_date,
    allDay: !!k.all_day,
    startHour: k.start_hour,
    endHour: k.end_hour,
    description: k.description,
  }));
}

export function writeConstraints(list) {
  return writeConstraintsTx(getDb(), list);
}
