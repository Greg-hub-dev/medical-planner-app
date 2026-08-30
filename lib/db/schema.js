// Schéma SQL partagé par les deux backends (SQLite local et Turso/libSQL).
// Les migrations sont versionnées : on applique celles dont l'index >= version courante.

export const MIGRATIONS = [
  // v1 : schéma initial
  [
    `CREATE TABLE IF NOT EXISTS courses (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      hours_per_day REAL NOT NULL,
      created_at    TEXT NOT NULL,
      ord           INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id            TEXT PRIMARY KEY,
      course_id     TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      interval      TEXT NOT NULL,
      date          TEXT NOT NULL,
      original_date TEXT NOT NULL,
      completed     INTEGER NOT NULL DEFAULT 0,
      success       INTEGER,
      rescheduled   INTEGER NOT NULL DEFAULT 0,
      ord           INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_course ON sessions(course_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date)`,
    `CREATE TABLE IF NOT EXISTS constraints (
      id          TEXT PRIMARY KEY,
      date        TEXT NOT NULL,
      end_date    TEXT,
      all_day     INTEGER NOT NULL DEFAULT 1,
      start_hour  REAL NOT NULL DEFAULT 0,
      end_hour    REAL NOT NULL DEFAULT 24,
      description TEXT NOT NULL DEFAULT ''
    )`,
  ],
];

export const SQL = {
  selectCourses: 'SELECT * FROM courses ORDER BY ord, created_at',
  selectAllSessions: 'SELECT * FROM sessions ORDER BY course_id, ord, date',
  deleteSessions: 'DELETE FROM sessions',
  deleteCourses: 'DELETE FROM courses',
  insertCourse:
    'INSERT INTO courses (id, name, hours_per_day, created_at, ord) VALUES (?, ?, ?, ?, ?)',
  insertSession:
    'INSERT INTO sessions (id, course_id, interval, date, original_date, completed, success, rescheduled, ord) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  selectConstraints: 'SELECT * FROM constraints ORDER BY date',
  deleteConstraints: 'DELETE FROM constraints',
  insertConstraint:
    'INSERT INTO constraints (id, date, end_date, all_day, start_hour, end_hour, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
};

// ---- Conversions lignes <-> objets métier ---------------------------------
export function rowToSession(s) {
  return {
    id: s.id,
    interval: s.interval,
    date: s.date,
    originalDate: s.original_date,
    completed: !!s.completed,
    success: s.success === null || s.success === undefined ? null : !!s.success,
    rescheduled: !!s.rescheduled,
  };
}

export function rowToConstraint(k) {
  return {
    id: k.id,
    date: k.date,
    endDate: k.end_date ?? null,
    allDay: !!k.all_day,
    startHour: k.start_hour,
    endHour: k.end_hour,
    description: k.description ?? '',
  };
}

/** Assemble les cours et leurs sessions en une seule passe (évite le N+1). */
export function assembleCourses(courseRows, sessionRows) {
  const byCourse = new Map();
  for (const s of sessionRows) {
    const list = byCourse.get(s.course_id);
    if (list) list.push(rowToSession(s));
    else byCourse.set(s.course_id, [rowToSession(s)]);
  }
  return courseRows.map((c) => ({
    id: c.id,
    name: c.name,
    hoursPerDay: c.hours_per_day,
    createdAt: c.created_at,
    sessions: byCourse.get(c.id) || [],
  }));
}

/** Paramètres d'insertion d'un cours / d'une session (ordre = SQL ci-dessus). */
export function courseParams(c, ord) {
  return [c.id, c.name, c.hoursPerDay, c.createdAt ?? new Date().toISOString(), ord];
}

export function sessionParams(s, courseId, ord) {
  return [
    s.id,
    courseId,
    s.interval,
    s.date,
    s.originalDate ?? s.date,
    s.completed ? 1 : 0,
    s.success === null || s.success === undefined ? null : s.success ? 1 : 0,
    s.rescheduled ? 1 : 0,
    ord,
  ];
}

export function constraintParams(k) {
  return [
    k.id,
    k.date,
    k.endDate ?? null,
    k.allDay ? 1 : 0,
    k.startHour ?? 0,
    k.endHour ?? 24,
    k.description ?? '',
  ];
}
