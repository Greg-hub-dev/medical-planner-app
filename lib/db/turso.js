// Backend « base hébergée » : Turso / libSQL (déploiement Vercel).
// Même schéma et même SQL que le backend local — seul le client change.

import { createClient } from '@libsql/client';
import {
  MIGRATIONS, SQL, assembleCourses, rowToConstraint,
  courseParams, sessionParams, constraintParams,
} from './schema.js';

let _client = null;
let _ready = null;

function client() {
  if (_client) return _client;
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error('TURSO_DATABASE_URL manquant');
  _client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  return _client;
}

// Migrations : exécutées une seule fois par instance (mémoïsées).
async function ready() {
  if (_ready) return _ready;
  _ready = (async () => {
    const c = client();
    const res = await c.execute('PRAGMA user_version');
    const current = Number(Object.values(res.rows[0] ?? {})[0] ?? 0);
    for (let v = current; v < MIGRATIONS.length; v++) {
      await c.batch(MIGRATIONS[v], 'write');
      await c.execute(`PRAGMA user_version = ${v + 1}`);
    }
  })();
  return _ready;
}

export async function readCourses() {
  await ready();
  const c = client();
  const [courses, sessions] = await Promise.all([
    c.execute(SQL.selectCourses),
    c.execute(SQL.selectAllSessions),
  ]);
  return assembleCourses(courses.rows, sessions.rows);
}

export async function writeCourses(courses) {
  await ready();
  const list = Array.isArray(courses) ? courses : [];
  const stmts = [{ sql: SQL.deleteSessions, args: [] }, { sql: SQL.deleteCourses, args: [] }];
  list.forEach((c, ci) => {
    stmts.push({ sql: SQL.insertCourse, args: courseParams(c, ci) });
    (c.sessions || []).forEach((s, si) =>
      stmts.push({ sql: SQL.insertSession, args: sessionParams(s, c.id, si) })
    );
  });
  await client().batch(stmts, 'write'); // batch = transaction
  return list.length;
}

export async function readConstraints() {
  await ready();
  const res = await client().execute(SQL.selectConstraints);
  return res.rows.map(rowToConstraint);
}

export async function writeConstraints(list) {
  await ready();
  const arr = Array.isArray(list) ? list : [];
  const stmts = [{ sql: SQL.deleteConstraints, args: [] }];
  arr.forEach((k) => stmts.push({ sql: SQL.insertConstraint, args: constraintParams(k) }));
  await client().batch(stmts, 'write');
  return arr.length;
}

export async function countCourses() {
  await ready();
  const res = await client().execute('SELECT COUNT(*) AS c FROM courses');
  return Number(res.rows[0]?.c ?? 0);
}
