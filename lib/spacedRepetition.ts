// Moteur de répétition espacée (méthode des J) + adaptation selon la réussite.
// Framework-agnostique : opère sur des objets Session/Course simples.

export interface SchemeStep {
  key: string;
  days: number;
}

export interface EngineSession {
  id: string;
  interval: string;
  date: Date;
  originalDate: Date;
  completed: boolean;
  success: boolean | null;
  rescheduled: boolean;
}

// Échelle par défaut. Modifiable ultérieurement (par cours ou globalement).
export const DEFAULT_SCHEME: SchemeStep[] = [
  { key: 'J0', days: 0 },
  { key: 'J+1', days: 1 },
  { key: 'J+2', days: 2 },
  { key: 'J+10', days: 10 },
  { key: 'J+25', days: 25 },
  { key: 'J+47', days: 47 },
];

const COLORS: Record<string, string> = {
  'J0': 'bg-blue-100 text-blue-700 border-blue-200',
  'J+1': 'bg-rose-100 text-rose-700 border-rose-200',
  'J+2': 'bg-orange-100 text-orange-700 border-orange-200',
  'J+10': 'bg-amber-100 text-amber-800 border-amber-200',
  'J+25': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'J+47': 'bg-violet-100 text-violet-700 border-violet-200',
  'Reprise': 'bg-red-100 text-red-700 border-red-300',
};

export function colorFor(interval: string): string {
  return COLORS[interval] || 'bg-slate-100 text-slate-700 border-slate-200';
}

function skipSunday(d: Date): Date {
  const x = new Date(d);
  if (x.getDay() === 0) x.setDate(x.getDate() + 1);
  return x;
}

function uid(prefix: string): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rnd}`;
}

export function newId(): string {
  return uid('id');
}

/** Génère les sessions d'un cours à partir d'une date de départ. */
export function generateSessions(
  startDate: Date,
  scheme: SchemeStep[] = DEFAULT_SCHEME
): EngineSession[] {
  const base = skipSunday(new Date(startDate));
  return scheme.map((step) => {
    const d = new Date(base);
    d.setDate(base.getDate() + step.days);
    const day = skipSunday(d);
    return {
      id: uid(`s_${step.key}`),
      interval: step.key,
      date: day,
      originalDate: new Date(day),
      completed: false,
      success: null,
      rescheduled: day.getDay() === 1 && step.days > 0,
    };
  });
}

/** Crée une session « Reprise » N jours après une session ratée. */
export function repriseSession(fromDate: Date, days = 2): EngineSession {
  const d = new Date(fromDate);
  d.setDate(d.getDate() + days);
  const day = skipSunday(d);
  return {
    id: uid('s_Reprise'),
    interval: 'Reprise',
    date: day,
    originalDate: new Date(day),
    completed: false,
    success: null,
    rescheduled: false,
  };
}

/**
 * Marque une session comme terminée. En cas d'échec, une session de reprise
 * est ajoutée quelques jours plus tard (adaptation de l'espacement).
 * Renvoie la nouvelle liste de sessions du cours.
 */
export function markSession<T extends EngineSession>(
  sessions: T[],
  sessionId: string,
  success: boolean
): T[] {
  const target = sessions.find((s) => s.id === sessionId);
  if (!target) return sessions;

  const updated = sessions.map((s) =>
    s.id === sessionId ? { ...s, completed: true, success } : s
  );

  if (!success) {
    updated.push(repriseSession(target.date, 2) as T);
  }
  return updated.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Décale à aujourd'hui (jour ouvré) toutes les sessions non terminées passées. */
export function rescheduleOverdue<T extends EngineSession>(
  sessions: T[]
): { sessions: T[]; count: number } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let count = 0;

  const out = sessions.map((s) => {
    const d = new Date(s.date);
    d.setHours(0, 0, 0, 0);
    if (!s.completed && d.getTime() < today.getTime()) {
      count++;
      return { ...s, date: skipSunday(new Date(today)), rescheduled: true };
    }
    return s;
  });

  return { sessions: out, count };
}

/** Nombre de sessions non terminées dont la date est passée. */
export function countOverdue(sessions: EngineSession[]): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return sessions.filter((s) => {
    const d = new Date(s.date);
    d.setHours(0, 0, 0, 0);
    return !s.completed && d.getTime() < today.getTime();
  }).length;
}
