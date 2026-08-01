'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Brain, Calendar, Clock, CheckCircle2, AlertTriangle, Plus, Minus, Trash2,
  ChevronLeft, ChevronRight, BookOpen, Settings as SettingsIcon, Bell, Mail,
  Check, X, RefreshCw, Wifi, WifiOff, Sun, Moon, Download, Upload, Flame, TrendingUp,
  RotateCcw, Undo2,
} from 'lucide-react';
import { t as translate, dayLabels, APP_NAME, type Lang } from '../../lib/i18n';
import {
  generateSessions, markSession as engineMark, rescheduleOverdue, countOverdue,
  colorFor, newId, type EngineSession,
} from '../../lib/spacedRepetition';

// ---- Types ----------------------------------------------------------------
type Session = EngineSession;

interface Course {
  id: string;
  name: string;
  hoursPerDay: number;
  createdAt: Date;
  sessions: Session[];
}

interface Constraint {
  id: string;
  date: Date;
  endDate: Date | null;
  allDay: boolean;
  startHour: number;
  endHour: number;
  description: string;
}

interface TimePrefs {
  preferredStartHour: number;
  preferredEndHour: number;
  lunchBreakStart: number;
  lunchBreakEnd: number;
}

interface DaySession {
  courseId: string;
  sessionId: string;
  course: string;
  interval: string;
  hours: number;
  completed: boolean;
  success: boolean | null;
  rescheduled: boolean;
  startTime: string;
  endTime: string;
}

interface DayPlan { date: Date; sessions: DaySession[]; totalHours: number; }

// Brouillon de cours : édité/confirmé avant création (aperçu + slot-filling).
interface Draft { tempId: string; name: string; hours: number; startDate: string; }

const API = { courses: '/api/courses', constraints: '/api/constraints' };

// ---- Component ------------------------------------------------------------
const MemoMed = () => {
  const [lang, setLang] = useState<Lang>(() =>
    (typeof window !== 'undefined' && (localStorage.getItem('memomed_lang') as Lang)) || 'fr'
  );
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    const saved = localStorage.getItem('memomed_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const importRef = useRef<HTMLInputElement>(null);
  const timersRef = useRef<number[]>([]);
  const t = useCallback((k: string, v?: Record<string, string | number>) => translate(lang, k, v), [lang]);

  const [courses, setCourses] = useState<Course[]>([]);
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [currentWeek, setCurrentWeek] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<'planning' | 'courses' | 'settings'>('planning');
  const [viewMode, setViewMode] = useState<'week' | 'month'>('month');
  const [moveLinked, setMoveLinked] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const historyRef = useRef<{ courses: Course[]; constraints: Constraint[] }[]>([]);
  const [undoAvailable, setUndoAvailable] = useState(false);
  const undoRef = useRef<() => void>(() => {});

  const [timePrefs, setTimePrefs] = useState<TimePrefs>({
    preferredStartHour: 9, preferredEndHour: 18, lunchBreakStart: 13, lunchBreakEnd: 14,
  });

  const [userEmail, setUserEmail] = useState('');
  const [isEmailValid, setIsEmailValid] = useState(false);
  const [isEmailSending, setIsEmailSending] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState('default');

  // New-constraint form
  const [ncDate, setNcDate] = useState('');
  const [ncAllDay, setNcAllDay] = useState(true);
  const [ncFrom, setNcFrom] = useState(9);
  const [ncTo, setNcTo] = useState(12);
  const [ncDesc, setNcDesc] = useState('');

  const [draggedSession, setDraggedSession] = useState<{ courseId: string; sessionId: string; date: Date } | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);

  const availableHours = Math.max(1, timePrefs.preferredEndHour - timePrefs.preferredStartHour - 1);
  // Notification transitoire (remplace l'ancien fil de discussion de l'assistant).
  const say = (content: string) => {
    setToast(content);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  };

  // ---- Undo history (Ctrl+Z) ---------------------------------------------
  // Les mises à jour d'état sont immuables : mémoriser les références suffit.
  const snapshot = () => {
    historyRef.current.push({ courses, constraints });
    if (historyRef.current.length > 60) historyRef.current.shift();
    setUndoAvailable(true);
  };
  const undo = () => {
    const h = historyRef.current;
    if (!h.length) { say(t('undo.none')); return; }
    const prev = h.pop()!;
    setCourses(prev.courses);
    setConstraints(prev.constraints);
    setUndoAvailable(h.length > 0);
    say(t('undo.done'));
  };
  undoRef.current = undo;

  // ---- Persistence --------------------------------------------------------
  const saveCourses = useCallback(async (data: Course[]) => {
    const forDB = data.map((c) => ({
      ...c, createdAt: c.createdAt.toISOString(),
      sessions: c.sessions.map((s) => ({ ...s, date: s.date.toISOString(), originalDate: s.originalDate.toISOString() })),
    }));
    try {
      const r = await fetch(API.courses, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courses: forDB }) });
      if (!r.ok) throw new Error();
      setIsOnline(true); setLastSyncTime(new Date());
      localStorage.setItem('memomed_courses_backup', JSON.stringify(forDB));
    } catch { setIsOnline(false); localStorage.setItem('memomed_courses_backup', JSON.stringify(forDB)); }
  }, []);

  const saveConstraints = useCallback(async (data: Constraint[]) => {
    const forDB = data.map((c) => ({ ...c, date: c.date.toISOString(), endDate: c.endDate ? c.endDate.toISOString() : null }));
    try {
      const r = await fetch(API.constraints, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ constraints: forDB }) });
      if (!r.ok) throw new Error();
      setIsOnline(true); setLastSyncTime(new Date());
    } catch { setIsOnline(false); }
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    const hydrateCourses = (arr: unknown[]): Course[] => (arr as Record<string, unknown>[]).map((c) => ({
      id: (c.id as string) ?? newId(),
      name: c.name as string,
      hoursPerDay: c.hoursPerDay as number,
      createdAt: new Date(c.createdAt as string),
      sessions: ((c.sessions as Record<string, unknown>[]) || []).map((s) => ({
        id: (s.id as string) ?? newId(),
        interval: s.interval as string,
        date: new Date(s.date as string),
        originalDate: new Date((s.originalDate as string) ?? (s.date as string)),
        completed: Boolean(s.completed),
        success: (s.success as boolean | null) ?? null,
        rescheduled: Boolean(s.rescheduled),
      })),
    }));
    try {
      const [cr, kr] = await Promise.all([fetch(API.courses), fetch(API.constraints)]);
      if (cr.ok) {
        const d = await cr.json();
        if (d.courses?.length) setCourses(hydrateCourses(d.courses));
      }
      if (kr.ok) {
        const d = await kr.json();
        if (d.constraints?.length) setConstraints((d.constraints as Record<string, unknown>[]).map((c) => ({
          id: (c.id as string) ?? newId(),
          date: new Date(c.date as string),
          endDate: c.endDate ? new Date(c.endDate as string) : null,
          allDay: c.allDay !== false,
          startHour: (c.startHour as number) ?? 0,
          endHour: (c.endHour as number) ?? 24,
          description: (c.description as string) ?? '',
        })));
      }
      setIsOnline(true); setLastSyncTime(new Date());
    } catch {
      setIsOnline(false);
      const b = localStorage.getItem('memomed_courses_backup');
      if (b) setCourses(hydrateCourses(JSON.parse(b)));
    } finally { setIsLoading(false); }
  }, []);

  useEffect(() => {
    loadData();
    const e = localStorage.getItem('memomed_user_email');
    if (e) { setUserEmail(e); setIsEmailValid(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)); }
    const p = localStorage.getItem('memomed_time_prefs');
    if (p) { try { setTimePrefs(JSON.parse(p)); } catch {} }
    if (localStorage.getItem('memomed_move_linked') === '1') setMoveLinked(true);
    const vm = localStorage.getItem('memomed_view'); if (vm === 'week' || vm === 'month') setViewMode(vm);
    if ('Notification' in window) setNotificationPermission(Notification.permission);
  }, [loadData]);

  useEffect(() => { if (!isLoading) saveCourses(courses); }, [courses, isLoading, saveCourses]);
  useEffect(() => { if (!isLoading) saveConstraints(constraints); }, [constraints, isLoading, saveConstraints]);
  useEffect(() => { localStorage.setItem('memomed_lang', lang); }, [lang]);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('memomed_theme', theme);
  }, [theme]);
  useEffect(() => { localStorage.setItem('memomed_move_linked', moveLinked ? '1' : '0'); }, [moveLinked]);
  useEffect(() => { localStorage.setItem('memomed_view', viewMode); }, [viewMode]);

  // Ctrl+Z / Cmd+Z pour annuler la dernière action (sauf dans un champ de saisie).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        const el = e.target as HTMLElement | null;
        const tag = el?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
        e.preventDefault();
        undoRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Sessions futures non terminées, avec horaires calculés (email + notifications).
  const computeUpcoming = useCallback(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const byDay = new Map<string, { courseId: string; sessionId: string; course: string; hours: number; date: Date }[]>();
    courses.forEach((c) => c.sessions.forEach((s) => {
      if (s.completed) return;
      const d = new Date(s.date); d.setHours(0, 0, 0, 0);
      if (d.getTime() < today.getTime()) return;
      const k = d.toISOString();
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k)!.push({ courseId: c.id, sessionId: s.id, course: c.name, hours: c.hoursPerDay, date: new Date(s.date) });
    }));
    const out: { course: string; hours: number; start: Date; end: Date; sessionId: string }[] = [];
    byDay.forEach((list) => {
      let cursor = timePrefs.preferredStartHour;
      list.forEach((it) => {
        if (cursor < timePrefs.lunchBreakStart && cursor + it.hours > timePrefs.lunchBreakStart) cursor = timePrefs.lunchBreakEnd;
        const sH = cursor, eH = cursor + it.hours; cursor = eH;
        const start = new Date(it.date); start.setHours(Math.floor(sH), Math.round((sH % 1) * 60), 0, 0);
        const end = new Date(it.date); end.setHours(Math.floor(eH), Math.round((eH % 1) * 60), 0, 0);
        out.push({ course: it.course, hours: it.hours, start, end, sessionId: it.sessionId });
      });
    });
    return out;
  }, [courses, timePrefs]);

  // Notifications planifiées pour les sessions du jour (remplace l'ancien stub).
  useEffect(() => {
    timersRef.current.forEach((id) => clearTimeout(id));
    timersRef.current = [];
    if (typeof window === 'undefined' || notificationPermission !== 'granted') return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const now = Date.now();
    computeUpcoming().forEach((u) => {
      const d = new Date(u.start); d.setHours(0, 0, 0, 0);
      if (d.getTime() !== today.getTime()) return;
      const delay = u.start.getTime() - now;
      if (delay > 0 && delay < 24 * 3600 * 1000) {
        const id = window.setTimeout(() => {
          try { new Notification(APP_NAME, { body: `${u.course} · ${u.start.toLocaleTimeString(lang === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}` }); } catch {}
        }, delay);
        timersRef.current.push(id);
      }
    });
    return () => { timersRef.current.forEach((id) => clearTimeout(id)); };
  }, [computeUpcoming, notificationPermission, lang]);

  // ---- Course / session operations ---------------------------------------
  const addCourse = (name: string, hours: number, startDate: Date | null) => {
    const sessions = generateSessions(startDate || new Date()) as Session[];
    setCourses((p) => [...p, { id: newId(), name, hoursPerDay: hours, createdAt: new Date(), sessions }]);
  };

  // ---- Course drafts (preview / edit / confirm) ---------------------------
  const addBlankDraft = () => setDrafts((p) => [...p, { tempId: newId(), name: '', hours: 1, startDate: '' }]);
  const updateDraft = (id: string, patch: Partial<Draft>) => setDrafts((p) => p.map((d) => d.tempId === id ? { ...d, ...patch } : d));
  const discardDraft = (id: string) => setDrafts((p) => p.filter((d) => d.tempId !== id));
  const commitDraft = (d: Draft) => {
    if (!d.name.trim()) return;
    snapshot();
    addCourse(d.name.trim(), d.hours, d.startDate ? new Date(d.startDate + 'T00:00:00') : null);
    discardDraft(d.tempId);
    say(t('assistant.created', { name: d.name.trim() }));
  };
  const commitAllDrafts = () => {
    const valid = drafts.filter((d) => d.name.trim());
    if (!valid.length) return;
    snapshot();
    valid.forEach((d) => addCourse(d.name.trim(), d.hours, d.startDate ? new Date(d.startDate + 'T00:00:00') : null));
    setDrafts([]);
    say(t('assistant.createdN', { n: valid.length }));
  };

  const deleteCourse = (id: string) => { snapshot(); setCourses((p) => p.filter((c) => c.id !== id)); };

  const updateCourseHours = (id: string, delta: number) => {
    snapshot();
    setCourses((p) => p.map((c) => c.id === id ? { ...c, hoursPerDay: Math.max(0.5, Math.round((c.hoursPerDay + delta) * 2) / 2) } : c));
  };

  const markSession = (courseId: string, sessionId: string, success: boolean) => {
    snapshot();
    setCourses((p) => p.map((c) => c.id === courseId ? { ...c, sessions: engineMark(c.sessions, sessionId, success) } : c));
  };

  // Repasse une session terminée en « à faire ».
  const uncompleteSession = (courseId: string, sessionId: string) => {
    snapshot();
    setCourses((p) => p.map((c) => c.id === courseId ? { ...c, sessions: c.sessions.map((s) => s.id === sessionId ? { ...s, completed: false, success: null } : s) } : c));
  };

  const deleteSession = (courseId: string, sessionId: string) => {
    snapshot();
    setCourses((p) => p.map((c) => c.id === courseId ? { ...c, sessions: c.sessions.filter((s) => s.id !== sessionId) } : c).filter((c) => c.sessions.length > 0));
  };

  // Décale la session ancre ET toutes les sessions suivantes non terminées du
  // même cours du même nombre de jours (le planning des J reste solidaire).
  const shiftCourse = (courseId: string, anchorSessionId: string, deltaDays: number) => {
    if (!deltaDays) return;
    setCourses((p) => p.map((c) => {
      if (c.id !== courseId) return c;
      const anchor = c.sessions.find((s) => s.id === anchorSessionId);
      if (!anchor) return c;
      const anchorMid = new Date(anchor.date); anchorMid.setHours(0, 0, 0, 0);
      return {
        ...c,
        sessions: c.sessions.map((s) => {
          if (s.completed) return s;
          const sd = new Date(s.date); sd.setHours(0, 0, 0, 0);
          if (sd.getTime() < anchorMid.getTime()) return s;
          const nd = new Date(s.date); nd.setDate(nd.getDate() + deltaDays);
          if (nd.getDay() === 0) nd.setDate(nd.getDate() + (deltaDays >= 0 ? 1 : -1));
          return { ...s, date: nd, rescheduled: true };
        }),
      };
    }));
  };

  const moveSessionTo = (courseId: string, sessionId: string, currentDate: Date, targetDate: Date) => {
    const a = new Date(currentDate); a.setHours(0, 0, 0, 0);
    const b = new Date(targetDate); b.setHours(0, 0, 0, 0);
    shiftCourse(courseId, sessionId, Math.round((b.getTime() - a.getTime()) / 86400000));
  };

  // Déplace UNIQUEMENT la session ciblée (saute le dimanche).
  const moveOne = (courseId: string, sessionId: string, targetDate: Date) => {
    const d = new Date(targetDate); d.setHours(0, 0, 0, 0);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    setCourses((p) => p.map((c) => c.id === courseId ? { ...c, sessions: c.sessions.map((s) => s.id === sessionId ? { ...s, date: d, rescheduled: true } : s) } : c));
  };

  // Applique un déplacement selon la préférence « déplacer les sessions liées ».
  const applyMove = (courseId: string, sessionId: string, currentDate: Date, targetDate: Date) => {
    snapshot();
    if (moveLinked) moveSessionTo(courseId, sessionId, currentDate, targetDate);
    else moveOne(courseId, sessionId, targetDate);
  };

  // Déplacement clavier-accessible (±1 jour).
  const moveByDays = (courseId: string, sessionId: string, from: Date, delta: number) => {
    const target = new Date(from); target.setDate(target.getDate() + delta);
    applyMove(courseId, sessionId, from, target);
  };

  const rescheduleAll = () => {
    snapshot();
    let total = 0;
    setCourses((p) => p.map((c) => { const r = rescheduleOverdue(c.sessions); total += r.count; return { ...c, sessions: r.sessions }; }));
    say(total ? t('planning.overdue.done', { n: total }) : t('planning.overdue.none'));
  };

  const addConstraintObj = (date: Date, endDate: Date | null, allDay: boolean, startHour: number, endHour: number, description = '') => {
    snapshot();
    setConstraints((p) => [...p, { id: newId(), date, endDate, allDay, startHour, endHour, description }]);
  };

  const deleteConstraint = (id: string) => { snapshot(); setConstraints((p) => p.filter((c) => c.id !== id)); };

  // ---- Data export / import (#4) -----------------------------------------
  const exportData = () => {
    const payload = {
      app: 'MémoMed', version: 1, exportedAt: new Date().toISOString(),
      courses: courses.map((c) => ({ ...c, createdAt: c.createdAt.toISOString(), sessions: c.sessions.map((s) => ({ ...s, date: s.date.toISOString(), originalDate: s.originalDate.toISOString() })) })),
      constraints: constraints.map((c) => ({ ...c, date: c.date.toISOString(), endDate: c.endDate ? c.endDate.toISOString() : null })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `memomed-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = (file: File) => {
    // Coercition des types Mongo « extended JSON » ($oid, $date).
    type Any = Record<string, unknown>;
    const coerceId = (v: unknown): string | null =>
      v == null ? null : (typeof v === 'object' && (v as Any).$oid ? String((v as Any).$oid) : String(v));
    const coerceDate = (v: unknown): string | null => {
      if (v == null) return null;
      if (typeof v === 'string' || typeof v === 'number') return String(v);
      const dd = (v as Any).$date;
      if (dd != null) return typeof dd === 'string' ? dd : new Date(dd as number).toISOString();
      return null;
    };
    const normCourse = (c: Any) => ({
      id: coerceId(c.id) ?? coerceId(c._id) ?? newId(),
      name: (c.name as string) ?? 'Cours',
      hoursPerDay: Number(c.hoursPerDay ?? c.hours ?? 1) || 1,
      createdAt: new Date(coerceDate(c.createdAt) ?? Date.now()),
      sessions: (((c.sessions as Any[]) || []).map((s) => ({
        id: coerceId(s.id) ?? coerceId(s._id) ?? newId(),
        interval: (s.interval as string) ?? 'J0',
        date: new Date(coerceDate(s.date) ?? Date.now()),
        originalDate: new Date(coerceDate(s.originalDate) ?? coerceDate(s.date) ?? Date.now()),
        completed: Boolean(s.completed),
        success: s.success === true ? true : s.success === false ? false : null,
        rescheduled: Boolean(s.rescheduled),
      }))),
    });
    const normConstraint = (k: Any) => ({
      id: coerceId(k.id) ?? coerceId(k._id) ?? newId(),
      date: new Date(coerceDate(k.date) ?? Date.now()),
      endDate: k.endDate ? new Date(coerceDate(k.endDate) as string) : null,
      allDay: k.allDay !== false,
      startHour: Number(k.startHour ?? 0),
      endHour: Number(k.endHour ?? 24),
      description: (k.description as string) ?? '',
    });

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result).trim();
        // JSON standard, ou NDJSON (un document par ligne — export `mongoexport`).
        let d: unknown;
        try {
          d = JSON.parse(text);
        } catch {
          d = text.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
        }

        // Détermination de la forme : app-export {courses,constraints},
        // ancien /api/export {data:{...}}, ou tableau brut (courses.json).
        // On ne remplace que les collections réellement présentes dans le fichier
        // (importer un seul courses.json n'efface pas les contraintes, et inversement).
        let rawCourses: Any[] | null = null;
        let rawConstraints: Any[] | null = null;
        const obj = d as Any;
        if (Array.isArray(d)) {
          const looksCourse = d.length > 0 && ((d[0] as Any).sessions !== undefined || (d[0] as Any).hoursPerDay !== undefined || (d[0] as Any).hours !== undefined || (d[0] as Any).name !== undefined);
          if (looksCourse) rawCourses = d as Any[]; else rawConstraints = d as Any[];
        } else if (Array.isArray(obj.courses)) {
          rawCourses = obj.courses as Any[];
          if (obj.constraints !== undefined) rawConstraints = (obj.constraints as Any[]) || [];
        } else if (obj.data && Array.isArray((obj.data as Any).courses)) {
          rawCourses = (obj.data as Any).courses as Any[];
          const dc = (obj.data as Any).constraints;
          if (dc !== undefined) rawConstraints = (dc as Any[]) || [];
        } else {
          throw new Error('unrecognized shape');
        }

        if (rawCourses) setCourses(rawCourses.map(normCourse));
        if (rawConstraints) setConstraints(rawConstraints.map(normConstraint));
        say(t('data.imported', { courses: rawCourses?.length ?? 0, constraints: rawConstraints?.length ?? 0 }));
      } catch {
        say(t('data.importError'));
      }
    };
    reader.readAsText(file);
  };

  // ---- Planning computation ----------------------------------------------
  const fmt = (h: number) => `${Math.floor(h)}:${('0' + Math.round((h % 1) * 60)).slice(-2)}`;

  const mondayOf = (offsetWeeks: number): Date => {
    const today = new Date();
    const dow = today.getDay();
    const m = new Date(today);
    m.setDate(today.getDate() + (dow === 0 ? -6 : 1 - dow) + offsetWeeks * 7);
    m.setHours(0, 0, 0, 0);
    return m;
  };

  const buildDay = (date: Date): DayPlan => {
    const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
    const isSunday = date.getDay() === 0;
    const collected: { courseId: string; sessionId: string; course: string; s: Session; hours: number }[] = [];
    if (!isSunday) {
      courses.forEach((c) => c.sessions.forEach((s) => {
        const sd = new Date(s.date); sd.setHours(0, 0, 0, 0);
        if (sd.getTime() === dayStart.getTime()) collected.push({ courseId: c.id, sessionId: s.id, course: c.name, s, hours: c.hoursPerDay });
      }));
    }
    let cursor = timePrefs.preferredStartHour;
    let total = 0;
    const sessions: DaySession[] = collected.map((it) => {
      if (cursor < timePrefs.lunchBreakStart && cursor + it.hours > timePrefs.lunchBreakStart) cursor = timePrefs.lunchBreakEnd;
      const start = cursor, end = cursor + it.hours; cursor = end;
      if (!it.s.completed) total += it.hours;
      return {
        courseId: it.courseId, sessionId: it.sessionId, course: it.course, interval: it.s.interval,
        hours: it.hours, completed: it.s.completed, success: it.s.success, rescheduled: it.s.rescheduled,
        startTime: fmt(start), endTime: fmt(end),
      };
    });
    return { date, sessions, totalHours: total };
  };

  // Grille calendrier de N semaines à partir d'un décalage (en semaines).
  const getWeeks = (offsetWeeks: number, n: number): DayPlan[][] => {
    const monday = mondayOf(offsetWeeks);
    return Array.from({ length: n }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => { const date = new Date(monday); date.setDate(monday.getDate() + w * 7 + d); return buildDay(date); })
    );
  };


  const getTodaySessions = () => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const out: { course: string; interval: string; hours: number }[] = [];
    courses.forEach((c) => c.sessions.forEach((s) => {
      const sd = new Date(s.date); sd.setHours(0, 0, 0, 0);
      if (sd.getTime() === today.getTime() && !s.completed) out.push({ course: c.name, interval: s.interval, hours: c.hoursPerDay });
    }));
    return out;
  };

  const constraintsOnDate = (date: Date) => constraints.filter((k) => {
    const d0 = new Date(date); d0.setHours(0, 0, 0, 0);
    const s = new Date(k.date); s.setHours(0, 0, 0, 0);
    const e = new Date(k.endDate || k.date); e.setHours(0, 0, 0, 0);
    return d0.getTime() >= s.getTime() && d0.getTime() <= e.getTime();
  });

  // ---- Stats --------------------------------------------------------------
  const totalSessions = courses.reduce((a, c) => a + c.sessions.length, 0);
  const doneSessions = courses.reduce((a, c) => a + c.sessions.filter((s) => s.completed).length, 0);
  const overdue = courses.reduce((a, c) => a + countOverdue(c.sessions), 0);
  const todayHours = getTodaySessions().reduce((a, s) => a + s.hours, 0);
  const completionRate = totalSessions ? Math.round((doneSessions / totalSessions) * 100) : 0;

  // ---- Analytics (#6) -----------------------------------------------------
  const doneDays = new Set<string>();
  courses.forEach((c) => c.sessions.forEach((s) => { if (s.completed) { const d = new Date(s.date); d.setHours(0, 0, 0, 0); doneDays.add(d.toDateString()); } }));
  const streak = (() => {
    let n = 0; const d = new Date(); d.setHours(0, 0, 0, 0);
    if (!doneDays.has(d.toDateString())) d.setDate(d.getDate() - 1);
    while (doneDays.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1); }
    return n;
  })();
  const weekLoad = (() => {
    const s0 = new Date(); s0.setHours(0, 0, 0, 0); const s1 = new Date(s0); s1.setDate(s0.getDate() + 7);
    let h = 0; courses.forEach((c) => c.sessions.forEach((x) => { if (!x.completed) { const d = new Date(x.date); d.setHours(0, 0, 0, 0); if (d >= s0 && d < s1) h += c.hoursPerDay; } })); return h;
  })();
  const passCount = courses.reduce((a, c) => a + c.sessions.filter((s) => s.completed && s.success).length, 0);
  const successRate = doneSessions ? Math.round((passCount / doneSessions) * 100) : 0;

  // ---- Email / notifications ---------------------------------------------
  const initNotifications = async () => {
    if ('Notification' in window) { const p = await Notification.requestPermission(); setNotificationPermission(p); }
  };
  const testNotification = () => { if (notificationPermission === 'granted') new Notification(APP_NAME, { body: 'Test ✓' }); };

  const sendInvitations = async () => {
    if (!isEmailValid) return;
    setIsEmailSending(true);
    try {
      const times = new Map(computeUpcoming().map((u) => [u.sessionId, u]));
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const upcoming: { session: { id: string; date: string; interval: string; intervalLabel: string; start?: string; end?: string }; course: { name: string; hoursPerDay: number } }[] = [];
      courses.forEach((c) => c.sessions.forEach((s) => {
        if (s.completed || s.date < todayStart) return;
        const tm = times.get(s.id);
        upcoming.push({ session: { id: s.id, date: s.date.toISOString(), interval: s.interval, intervalLabel: s.interval, start: tm?.start.toISOString(), end: tm?.end.toISOString() }, course: { name: c.name, hoursPerDay: c.hoursPerDay } });
      }));
      if (!upcoming.length) { say(t('assistant.courseEmpty')); setIsEmailSending(false); return; }
      const r = await fetch('/api/send-invitations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userEmail, sessions: upcoming }) });
      if (!r.ok) throw new Error();
      const res = await r.json();
      say(`✅ ${res.sessionsCount} → ${userEmail}`);
      localStorage.setItem('memomed_user_email', userEmail);
    } catch { say('❌ Email error'); } finally { setIsEmailSending(false); }
  };

  // ---- Drag & drop --------------------------------------------------------
  const onDrop = (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    if (!draggedSession || date.getDay() === 0) { setDraggedSession(null); return; }
    applyMove(draggedSession.courseId, draggedSession.sessionId, draggedSession.date, date);
    setDraggedSession(null);
  };

  // ---- Render helpers -----------------------------------------------------
  const Segmented = () => (
    <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs font-medium">
      {(['fr', 'en'] as Lang[]).map((l) => (
        <button key={l} onClick={() => setLang(l)}
          className={`px-3 py-1.5 transition-colors ${lang === l ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Brain className="w-14 h-14 text-indigo-600 mx-auto mb-4 animate-pulse" />
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">{t('loading.title')}</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{t('loading.sub')}</p>
        </div>
      </div>
    );
  }

  const numWeeks = viewMode === 'month' ? 4 : 1;
  const calWeeks = getWeeks(currentWeek, numWeeks);
  const calFirst = calWeeks[0][0].date;
  const calLast = calWeeks[numWeeks - 1][6].date;
  const dfmtShort = (d: Date) => d.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', { day: '2-digit', month: 'short' });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-sm">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{APP_NAME}</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">{t('tagline')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={undo} disabled={!undoAvailable} title={`${t('undo.label')} (Ctrl+Z)`}
              className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 disabled:opacity-40 disabled:cursor-not-allowed">
              <Undo2 className="w-4 h-4" />
            </button>
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title={t(theme === 'dark' ? 'theme.light' : 'theme.dark')}
              className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50">
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <Segmented />
            <div className="flex items-center gap-2 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
              {isOnline ? <Wifi className="w-3.5 h-3.5 text-emerald-500" /> : <WifiOff className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />}
              <span className="text-slate-600 dark:text-slate-300">{t('status.local')}</span>
              <span className={isOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>{isOnline ? t('status.ready') : t('status.unavailable')}</span>
              {lastSyncTime && <span className="text-slate-400 dark:text-slate-500 hidden sm:inline">· {lastSyncTime.toLocaleTimeString(lang === 'fr' ? 'fr-FR' : 'en-US')}</span>}
            </div>
          </div>
        </header>

        {/* Tabs */}
        <nav className="flex gap-2 mb-6">
          {([['planning', Calendar], ['courses', BookOpen], ['settings', SettingsIcon]] as const).map(([tab, Icon]) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}>
              <Icon className="w-4 h-4" /> {t(`nav.${tab}`)}
              {tab === 'courses' && courses.length > 0 && (
                <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab ? 'bg-white/20' : 'bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'}`}>{courses.length}</span>
              )}
            </button>
          ))}
        </nav>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { icon: BookOpen, color: 'text-indigo-600', label: t('stats.courses'), value: courses.length },
            { icon: Clock, color: 'text-emerald-600 dark:text-emerald-400', label: t('stats.today'), value: `${todayHours}h` },
            { icon: CheckCircle2, color: 'text-violet-600', label: t('stats.progress'), value: `${completionRate}%` },
            { icon: AlertTriangle, color: overdue ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-slate-500', label: t('stats.overdue'), value: overdue },
          ].map((s, i) => (
            <div key={i} className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 mb-1"><s.icon className={`w-4 h-4 ${s.color}`} /><span className="text-xs font-medium text-slate-500 dark:text-slate-400">{s.label}</span></div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Analytics strip */}
        {courses.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 mb-6 flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">{t('analytics.title')}</span>
            <span className="flex items-center gap-1.5"><Flame className="w-4 h-4 text-orange-500" /> {t('analytics.streak')}: <b>{streak}</b> {t('analytics.streakDays')}</span>
            <span className="flex items-center gap-1.5"><TrendingUp className="w-4 h-4 text-indigo-500" /> {t('analytics.week')}: <b>{weekLoad}h</b></span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> {t('analytics.success')}: <b>{successRate}%</b></span>
          </div>
        )}

        {/* PLANNING TAB */}
        {activeTab === 'planning' && (
          <div className="space-y-6">
            {/* Course creation (quick add) */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <h2 className="font-semibold flex items-center gap-2 text-slate-900 dark:text-slate-100"><BookOpen className="w-4 h-4 text-indigo-600" /> {t('create.title')}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('create.hint')}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {drafts.length > 1 && <button onClick={commitAllDrafts} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">{t('draft.createAll')}</button>}
                  <button onClick={addBlankDraft} className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"><Plus className="w-4 h-4" /> {t('courses.add')}</button>
                </div>
              </div>
              {drafts.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500 py-2">{t('create.empty')}</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {drafts.map((d) => (
                    <div key={d.tempId} className="border border-slate-200 dark:border-slate-700 rounded-lg p-2 bg-indigo-50/40 dark:bg-slate-700/40 space-y-2">
                      <input autoFocus={!d.name} value={d.name} onChange={(e) => updateDraft(d.tempId, { name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && commitDraft(d)} placeholder={t('draft.name')} className="w-full text-sm p-1.5 border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1">
                          <button onClick={() => updateDraft(d.tempId, { hours: Math.max(0.5, Math.round((d.hours - 0.5) * 2) / 2) })} className="w-6 h-6 rounded bg-slate-100 dark:bg-slate-700 flex items-center justify-center"><Minus className="w-3 h-3" /></button>
                          <span className="w-10 text-center text-xs font-medium">{d.hours}h</span>
                          <button onClick={() => updateDraft(d.tempId, { hours: Math.round((d.hours + 0.5) * 2) / 2 })} className="w-6 h-6 rounded bg-slate-100 dark:bg-slate-700 flex items-center justify-center"><Plus className="w-3 h-3" /></button>
                        </div>
                        <input type="date" value={d.startDate} onChange={(e) => updateDraft(d.tempId, { startDate: e.target.value })} title={t('draft.start')} className="text-xs p-1 border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-800" />
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => commitDraft(d)} disabled={!d.name.trim()} className="flex-1 text-xs px-2 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-300 flex items-center justify-center gap-1"><Check className="w-3 h-3" /> {t('draft.create')}</button>
                        <button onClick={() => discardDraft(d.tempId)} title={t('draft.discard')} className="w-8 h-8 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 4-week calendar (below) */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-900 dark:text-slate-100"><Calendar className="w-5 h-5 text-indigo-600" /> {t('planning.title')}</h2>
                <div className="flex items-center gap-2">
                  <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden text-xs font-medium">
                    {(['week', 'month'] as const).map((v) => (
                      <button key={v} onClick={() => setViewMode(v)} className={`px-2.5 py-1.5 ${viewMode === v ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>{t(`view.${v}`)}</button>
                    ))}
                  </div>
                  {overdue > 0 && (
                    <button onClick={rescheduleAll} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 hover:bg-rose-100 dark:hover:bg-rose-500/20"><RefreshCw className="w-3.5 h-3.5" /> {overdue}</button>
                  )}
                  <button onClick={() => setCurrentWeek(currentWeek - numWeeks)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><ChevronLeft className="w-4 h-4" /></button>
                  <button onClick={() => setCurrentWeek(0)} className="text-xs px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap">{dfmtShort(calFirst)} – {dfmtShort(calLast)}</button>
                  <button onClick={() => setCurrentWeek(currentWeek + numWeeks)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="grid grid-cols-7 border-r border-b border-slate-100 dark:border-slate-800 overflow-x-auto">
                {dayLabels(lang).map((d, i) => (
                  <div key={i} className="text-center text-[11px] font-semibold text-slate-400 dark:text-slate-500 py-1.5 border-l border-slate-100 dark:border-slate-800">{d.slice(0, 3)}</div>
                ))}
                {calWeeks.map((week) => week.map((day) => {
                  const idx = (day.date.getDay() + 6) % 7;
                  const isSunday = idx === 6;
                  const isToday = day.date.toDateString() === new Date().toDateString();
                  const overloaded = day.totalHours > availableHours;
                  const dayCons = constraintsOnDate(day.date);
                  const firstOfMonth = day.date.getDate() === 1;
                  return (
                    <div key={day.date.toISOString()}
                      onDragOver={!isSunday ? (e) => e.preventDefault() : undefined}
                      onDrop={!isSunday ? (e) => onDrop(e, day.date) : undefined}
                      className={`${viewMode === 'week' ? 'min-h-[150px]' : 'min-h-[96px]'} p-1.5 border-l border-t border-slate-100 dark:border-slate-800 ${isToday ? 'bg-indigo-50/70 dark:bg-indigo-500/10' : isSunday ? 'bg-slate-50 dark:bg-slate-800/40' : ''} ${overloaded ? 'ring-1 ring-inset ring-rose-300 dark:ring-rose-500/40' : ''}`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-xs ${isToday ? 'font-bold text-indigo-700 dark:text-indigo-300' : 'text-slate-400 dark:text-slate-500'}`}>{firstOfMonth ? dfmtShort(day.date) : day.date.getDate()}</span>
                        {day.totalHours > 0 && <span className={`text-[10px] ${overloaded ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-slate-500'}`}>{day.totalHours}h</span>}
                      </div>
                      {dayCons.map((c) => (
                        <div key={c.id} className="mt-0.5 text-[9px] px-1 rounded bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 dark:bg-amber-500/15 dark:text-amber-300 truncate">⚠ {c.allDay ? t('constraints.allDay') : `${c.startHour}-${c.endHour}h`}</div>
                      ))}
                      {isSunday ? (
                        <p className="text-[11px] text-emerald-500 mt-1">🌙</p>
                      ) : (
                        <div className="mt-1 space-y-1">
                          {day.sessions.map((s) => (
                            <div key={s.sessionId} draggable={!s.completed}
                              onDragStart={() => setDraggedSession({ courseId: s.courseId, sessionId: s.sessionId, date: day.date })}
                              className={`group relative text-[10px] leading-tight p-1 rounded border ${colorFor(s.interval)} ${s.completed ? 'opacity-50' : 'cursor-move'}`}>
                              <div className="font-semibold truncate flex items-center gap-0.5">
                                {s.completed && (s.success ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />)}
                                {s.course}
                              </div>
                              <div className="flex justify-between"><span className="opacity-70">{s.interval}</span><span>{s.hours}h</span></div>
                              {viewMode === 'week' && <div className="text-[9px] font-mono opacity-60 mt-0.5">⏰ {s.startTime}–{s.endTime}</div>}
                              {!s.completed ? (
                                <div className="absolute -top-1.5 right-0 flex gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity z-10">
                                  <button title={t('session.moveLeft')} onClick={() => moveByDays(s.courseId, s.sessionId, day.date, -1)} className="w-4 h-4 rounded bg-slate-600 text-white flex items-center justify-center"><ChevronLeft className="w-2.5 h-2.5" /></button>
                                  <button title={t('session.moveRight')} onClick={() => moveByDays(s.courseId, s.sessionId, day.date, 1)} className="w-4 h-4 rounded bg-slate-600 text-white flex items-center justify-center"><ChevronRight className="w-2.5 h-2.5" /></button>
                                  <button title={t('session.markPass')} onClick={() => markSession(s.courseId, s.sessionId, true)} className="w-4 h-4 rounded bg-emerald-500 text-white flex items-center justify-center"><Check className="w-2.5 h-2.5" /></button>
                                  <button title={t('session.markFail')} onClick={() => markSession(s.courseId, s.sessionId, false)} className="w-4 h-4 rounded bg-amber-500 text-white flex items-center justify-center"><RefreshCw className="w-2.5 h-2.5" /></button>
                                  <button title={t('session.delete')} onClick={() => { if (confirm(t('session.confirmDelete', { interval: s.interval, course: s.course }))) deleteSession(s.courseId, s.sessionId); }} className="w-4 h-4 rounded bg-rose-500 text-white flex items-center justify-center"><X className="w-2.5 h-2.5" /></button>
                                </div>
                              ) : (
                                <div className="absolute -top-1.5 right-0 flex gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity z-10">
                                  <button title={t('session.uncomplete')} onClick={() => uncompleteSession(s.courseId, s.sessionId)} className="w-4 h-4 rounded bg-slate-600 text-white flex items-center justify-center"><RotateCcw className="w-2.5 h-2.5" /></button>
                                  <button title={t('session.delete')} onClick={() => { if (confirm(t('session.confirmDelete', { interval: s.interval, course: s.course }))) deleteSession(s.courseId, s.sessionId); }} className="w-4 h-4 rounded bg-rose-500 text-white flex items-center justify-center"><X className="w-2.5 h-2.5" /></button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }))}
              </div>
            </div>
          </div>
        )}

        {/* COURSES TAB */}
        {activeTab === 'courses' && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{t('courses.title')}</h2>
              <button onClick={() => { setActiveTab('planning'); addBlankDraft(); }} className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"><Plus className="w-4 h-4" /> {t('courses.add')}</button>
            </div>
            {courses.length === 0 ? (
              <div className="text-center py-12">
                <BookOpen className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-500 dark:text-slate-400">{t('courses.empty')}</p>
                <button onClick={() => { setActiveTab('planning'); addBlankDraft(); }} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">➕ {t('courses.add')}</button>
              </div>
            ) : (
              <div className="space-y-4">
                {courses.map((c) => {
                  const done = c.sessions.filter((s) => s.completed).length;
                  const pct = c.sessions.length ? Math.round((done / c.sessions.length) * 100) : 0;
                  const upcoming = c.sessions.filter((s) => !s.completed).sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 4);
                  return (
                    <div key={c.id} className="border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-slate-900 dark:text-slate-100 truncate">{c.name}</h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{done}/{c.sessions.length} {t('courses.done')} · {pct}%</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-500 dark:text-slate-400">{t('courses.hours')}</span>
                            <button onClick={() => updateCourseHours(c.id, -0.5)} className="w-6 h-6 rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center justify-center"><Minus className="w-3 h-3" /></button>
                            <span className="w-8 text-center text-sm font-medium">{c.hoursPerDay}h</span>
                            <button onClick={() => updateCourseHours(c.id, 0.5)} className="w-6 h-6 rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center justify-center"><Plus className="w-3 h-3" /></button>
                          </div>
                          <button onClick={() => { if (confirm(t('courses.confirmDelete', { name: c.name }))) deleteCourse(c.id); }} title={t('courses.delete')} className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                      <div className="mt-3 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} /></div>
                      {upcoming.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {upcoming.map((s) => (
                            <div key={s.id} className={`text-xs px-2 py-1 rounded-lg border flex items-center gap-1.5 ${colorFor(s.interval)}`}>
                              <span>{s.interval} · {s.date.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', { day: '2-digit', month: '2-digit' })}</span>
                              <button onClick={() => markSession(c.id, s.id, true)} className="hover:text-emerald-700" title={t('session.markPass')}><Check className="w-3 h-3" /></button>
                              <button onClick={() => markSession(c.id, s.id, false)} className="hover:text-amber-700" title={t('session.markFail')}><RefreshCw className="w-3 h-3" /></button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Language */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="font-semibold mb-4 flex items-center gap-2"><SettingsIcon className="w-4 h-4 text-indigo-600" /> {t('settings.language')}</h2>
              <Segmented />
            </div>

            {/* Move behavior */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="font-semibold mb-4 flex items-center gap-2"><ChevronRight className="w-4 h-4 text-indigo-600" /> {t('settings.move.title')}</h2>
              <label className="flex items-start gap-3 text-sm cursor-pointer">
                <input type="checkbox" checked={moveLinked} onChange={(e) => setMoveLinked(e.target.checked)} className="mt-0.5" />
                <span>
                  <span className="text-slate-700 dark:text-slate-200">{t('settings.move.linked')}</span>
                  <span className="block text-xs text-slate-400 dark:text-slate-500 mt-0.5">{t('settings.move.hint')}</span>
                </span>
              </label>
            </div>

            {/* Data & backup */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="font-semibold mb-2 flex items-center gap-2"><Download className="w-4 h-4 text-indigo-600" /> {t('data.title')}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{t('data.desc')}</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={exportData} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"><Download className="w-4 h-4" /> {t('data.export')}</button>
                <button onClick={() => importRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-sm hover:bg-slate-200 dark:hover:bg-slate-600"><Upload className="w-4 h-4" /> {t('data.import')}</button>
                <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importData(f); e.target.value = ''; }} />
              </div>
            </div>

            {/* Time prefs */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="font-semibold mb-4 flex items-center gap-2"><Clock className="w-4 h-4 text-indigo-600" /> {t('settings.hours.title')}</h2>
              <div className="grid grid-cols-2 gap-4">
                <label className="text-sm">{t('settings.hours.start')}
                  <select value={timePrefs.preferredStartHour} onChange={(e) => setTimePrefs((p) => ({ ...p, preferredStartHour: +e.target.value }))} className="mt-1 w-full p-2 border border-slate-200 dark:border-slate-700 rounded-lg">
                    {Array.from({ length: 12 }, (_, i) => i + 6).map((h) => <option key={h} value={h}>{h}h00</option>)}
                  </select>
                </label>
                <label className="text-sm">{t('settings.hours.end')}
                  <select value={timePrefs.preferredEndHour} onChange={(e) => setTimePrefs((p) => ({ ...p, preferredEndHour: +e.target.value }))} className="mt-1 w-full p-2 border border-slate-200 dark:border-slate-700 rounded-lg">
                    {Array.from({ length: 10 }, (_, i) => i + 15).map((h) => <option key={h} value={h}>{h}h00</option>)}
                  </select>
                </label>
              </div>
              <button onClick={() => { localStorage.setItem('memomed_time_prefs', JSON.stringify(timePrefs)); say(t('settings.saved')); }} className="mt-4 w-full py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">{t('settings.save')}</button>
            </div>

            {/* Constraints */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 lg:col-span-2">
              <h2 className="font-semibold mb-4 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> {t('constraints.title')}</h2>
              <div className="flex flex-wrap items-end gap-3 mb-4">
                <label className="text-sm">{t('constraints.date')}
                  <input type="date" value={ncDate} onChange={(e) => setNcDate(e.target.value)} className="mt-1 block p-2 border border-slate-200 dark:border-slate-700 rounded-lg" />
                </label>
                <label className="text-sm flex items-center gap-2 pb-2"><input type="checkbox" checked={ncAllDay} onChange={(e) => setNcAllDay(e.target.checked)} /> {t('constraints.allDay')}</label>
                {!ncAllDay && (
                  <div className="flex items-end gap-1 text-sm">
                    <label>{t('constraints.from')}<select value={ncFrom} onChange={(e) => setNcFrom(+e.target.value)} className="mt-1 block p-2 border border-slate-200 dark:border-slate-700 rounded-lg">{Array.from({ length: 18 }, (_, i) => i + 6).map((h) => <option key={h} value={h}>{h}h</option>)}</select></label>
                    <span className="pb-2">{t('constraints.to')}</span>
                    <select value={ncTo} onChange={(e) => setNcTo(+e.target.value)} className="p-2 border border-slate-200 dark:border-slate-700 rounded-lg">{Array.from({ length: 18 }, (_, i) => i + 7).map((h) => <option key={h} value={h}>{h}h</option>)}</select>
                  </div>
                )}
                <input value={ncDesc} onChange={(e) => setNcDesc(e.target.value)} placeholder={t('constraints.descPlaceholder')} className="text-sm p-2 border border-slate-200 dark:border-slate-700 rounded-lg flex-1 min-w-[160px]" />
                <button disabled={!ncDate} onClick={() => { const d = new Date(ncDate + 'T00:00:00'); addConstraintObj(d, null, ncAllDay, ncAllDay ? 0 : ncFrom, ncAllDay ? 24 : ncTo, ncDesc); setNcDate(''); setNcDesc(''); }} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:bg-slate-300">{t('constraints.add')}</button>
              </div>
              {constraints.length === 0 ? <p className="text-sm text-slate-400 dark:text-slate-500">{t('constraints.none')}</p> : (
                <div className="space-y-2">
                  {constraints.slice().sort((a, b) => a.date.getTime() - b.date.getTime()).map((c) => (
                    <div key={c.id} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg text-sm">
                      <span>⚠ {c.date.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US')}{c.endDate ? ` → ${c.endDate.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US')}` : ''} · {c.allDay ? t('constraints.allDay') : `${c.startHour}h–${c.endHour}h`}{c.description ? ` · ${c.description}` : ''}</span>
                      <button onClick={() => { if (confirm(t('constraints.confirmDelete'))) deleteConstraint(c.id); }} className="text-rose-500 dark:text-rose-400 hover:text-rose-700"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Email */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="font-semibold mb-4 flex items-center gap-2"><Mail className="w-4 h-4 text-indigo-600" /> {t('settings.email.title')}</h2>
              <input type="email" value={userEmail} onChange={(e) => { setUserEmail(e.target.value); setIsEmailValid(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.target.value)); }}
                placeholder={t('settings.email.label')} className={`w-full p-2.5 border rounded-lg mb-3 ${isEmailValid ? 'border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10' : userEmail ? 'border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/10' : 'border-slate-200 dark:border-slate-700'}`} />
              <button onClick={sendInvitations} disabled={!isEmailValid || !courses.length || isEmailSending} className="w-full py-2.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:bg-slate-300">{isEmailSending ? t('settings.email.sending') : t('settings.email.send')}</button>
            </div>

            {/* Notifications */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="font-semibold mb-4 flex items-center gap-2"><Bell className="w-4 h-4 text-indigo-600" /> {t('settings.notif.title')}</h2>
              {notificationPermission === 'granted' ? (
                <div className="flex items-center gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 text-sm">✓ {t('settings.notif.enabled')}</span>
                  <button onClick={testNotification} className="ml-auto px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg text-sm">{t('settings.notif.test')}</button>
                </div>
              ) : (
                <button onClick={initNotifications} className="px-4 py-2 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 rounded-lg text-sm">{t('settings.notif.enable')}</button>
              )}
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm bg-slate-900 dark:bg-slate-700 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg whitespace-pre-line">{toast}</div>
      )}
    </div>
  );
};

export default function Home() {
  return <MemoMed />;
}
