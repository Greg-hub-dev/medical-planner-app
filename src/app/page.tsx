'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Brain, Calendar, Clock, CheckCircle2, AlertTriangle, Plus, Minus, Trash2,
  ChevronLeft, ChevronRight, BookOpen, Settings as SettingsIcon, Bell, Mail,
  Check, X, RefreshCw, Wifi, WifiOff, Sun, Moon, Download, Upload, Flame, TrendingUp,
} from 'lucide-react';
import { t as translate, dayLabels, APP_NAME, type Lang } from '../../lib/i18n';
import { parseCommand } from '../../lib/commandParser';
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

interface ChatMessage { type: 'ai' | 'user'; content: string; }

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
  const [inputMessage, setInputMessage] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => [
    { type: 'ai', content: translate(
      (typeof window !== 'undefined' && (localStorage.getItem('memomed_lang') as Lang)) || 'fr',
      'assistant.welcome') },
  ]);

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

  const [draggedSession, setDraggedSession] = useState<{ courseId: string; sessionId: string } | null>(null);

  const availableHours = Math.max(1, timePrefs.preferredEndHour - timePrefs.preferredStartHour - 1);
  const say = (content: string) => setChatMessages((p) => [...p, { type: 'ai', content }]);

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
    if ('Notification' in window) setNotificationPermission(Notification.permission);
  }, [loadData]);

  useEffect(() => { if (!isLoading) saveCourses(courses); }, [courses, isLoading, saveCourses]);
  useEffect(() => { if (!isLoading) saveConstraints(constraints); }, [constraints, isLoading, saveConstraints]);
  useEffect(() => { localStorage.setItem('memomed_lang', lang); }, [lang]);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('memomed_theme', theme);
  }, [theme]);

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

  const deleteCourse = (id: string) => setCourses((p) => p.filter((c) => c.id !== id));

  const updateCourseHours = (id: string, delta: number) =>
    setCourses((p) => p.map((c) => c.id === id ? { ...c, hoursPerDay: Math.max(0.5, Math.round((c.hoursPerDay + delta) * 2) / 2) } : c));

  const markSession = (courseId: string, sessionId: string, success: boolean) =>
    setCourses((p) => p.map((c) => c.id === courseId ? { ...c, sessions: engineMark(c.sessions, sessionId, success) } : c));

  const deleteSession = (courseId: string, sessionId: string) =>
    setCourses((p) => p.map((c) => c.id === courseId ? { ...c, sessions: c.sessions.filter((s) => s.id !== sessionId) } : c).filter((c) => c.sessions.length > 0));

  const moveSession = (courseId: string, sessionId: string, newDate: Date) =>
    setCourses((p) => p.map((c) => c.id === courseId ? { ...c, sessions: c.sessions.map((s) => s.id === sessionId ? { ...s, date: new Date(newDate), rescheduled: true } : s) } : c));

  // Déplacement clavier-accessible (±1 jour, saute le dimanche).
  const moveByDays = (courseId: string, sessionId: string, from: Date, delta: number) => {
    const d = new Date(from); d.setDate(d.getDate() + delta);
    if (d.getDay() === 0) d.setDate(d.getDate() + (delta > 0 ? 1 : -1));
    moveSession(courseId, sessionId, d);
  };

  const rescheduleAll = () => {
    let total = 0;
    setCourses((p) => p.map((c) => { const r = rescheduleOverdue(c.sessions); total += r.count; return { ...c, sessions: r.sessions }; }));
    say(total ? t('planning.overdue.done', { n: total }) : t('planning.overdue.none'));
  };

  const addConstraintObj = (date: Date, endDate: Date | null, allDay: boolean, startHour: number, endHour: number, description = '') =>
    setConstraints((p) => [...p, { id: newId(), date, endDate, allDay, startHour, endHour, description }]);

  const deleteConstraint = (id: string) => setConstraints((p) => p.filter((c) => c.id !== id));

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
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const d = JSON.parse(String(reader.result));
        if (!Array.isArray(d.courses)) throw new Error();
        setCourses((d.courses as Record<string, unknown>[]).map((c) => ({
          id: (c.id as string) ?? newId(), name: c.name as string, hoursPerDay: c.hoursPerDay as number,
          createdAt: new Date(c.createdAt as string),
          sessions: ((c.sessions as Record<string, unknown>[]) || []).map((s) => ({
            id: (s.id as string) ?? newId(), interval: s.interval as string,
            date: new Date(s.date as string), originalDate: new Date((s.originalDate as string) ?? (s.date as string)),
            completed: Boolean(s.completed), success: (s.success as boolean | null) ?? null, rescheduled: Boolean(s.rescheduled),
          })),
        })));
        setConstraints(((d.constraints as Record<string, unknown>[]) || []).map((c) => ({
          id: (c.id as string) ?? newId(), date: new Date(c.date as string), endDate: c.endDate ? new Date(c.endDate as string) : null,
          allDay: c.allDay !== false, startHour: (c.startHour as number) ?? 0, endHour: (c.endHour as number) ?? 24, description: (c.description as string) ?? '',
        })));
        say(t('data.imported', { courses: (d.courses || []).length, constraints: (d.constraints || []).length }));
      } catch { say(t('data.importError')); }
    };
    reader.readAsText(file);
  };

  // ---- Assistant ----------------------------------------------------------
  const dispatch = (text: string) => {
    const intent = parseCommand(text, lang);
    const dfmt = (d: Date) => d.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US');
    switch (intent.action) {
      case 'help': return t('assistant.helpText');
      case 'week': {
        if (!courses.length) return t('assistant.courseEmpty');
        let out = t('assistant.weekHeader') + '\n';
        Object.values(getWeeklyPlan(currentWeek)).forEach((d, i) => {
          out += `\n${dayLabels(lang)[i]} ${d.date.getDate()}/${d.date.getMonth() + 1}: `;
          out += d.sessions.length ? d.sessions.map((s) => `${s.course} (${s.interval})`).join(', ') : t('assistant.weekRest');
        });
        return out;
      }
      case 'today': {
        const today = getTodaySessions();
        if (!today.length) return t('assistant.weekRest');
        return today.map((s) => `${s.course} (${s.interval}) — ${s.hours}h`).join('\n');
      }
      case 'list_courses':
        return courses.length ? t('assistant.listCourses', { list: courses.map((c) => c.name).join(', ') }) : t('assistant.noCourses');
      case 'add_course':
        addCourse(intent.name, intent.hours, intent.startDate);
        return t('assistant.added', { name: intent.name, hours: intent.hours });
      case 'add_constraint':
        addConstraintObj(intent.date, intent.endDate, intent.allDay, intent.startHour, intent.endHour);
        return intent.endDate
          ? t('assistant.constraintRange', { from: dfmt(intent.date), to: dfmt(intent.endDate) })
          : t('assistant.constraintAdded', { date: dfmt(intent.date) });
      case 'move_course': {
        const c = courses.find((x) => x.name.toLowerCase().includes(intent.name.toLowerCase()));
        if (!c) return t('assistant.moveNotFound');
        const next = c.sessions.filter((s) => !s.completed).sort((a, b) => a.date.getTime() - b.date.getTime())[0];
        if (!next) return t('assistant.moveNotFound');
        moveSession(c.id, next.id, intent.toDate);
        return t('assistant.moved', { course: c.name, date: dfmt(intent.toDate) });
      }
      default:
        return t('assistant.unknown', { msg: text });
    }
  };

  const handleSend = () => {
    if (!inputMessage.trim()) return;
    const msg = inputMessage;
    setChatMessages((p) => [...p, { type: 'user', content: msg }, { type: 'ai', content: dispatch(msg) }]);
    setInputMessage('');
  };

  // ---- Planning computation ----------------------------------------------
  const fmt = (h: number) => `${Math.floor(h)}:${('0' + Math.round((h % 1) * 60)).slice(-2)}`;

  const getWeekDates = (offset: number): Date[] => {
    const today = new Date();
    const dow = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() + (dow === 0 ? -6 : 1 - dow) + offset * 7);
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d; });
  };

  const getWeeklyPlan = (offset: number): Record<number, DayPlan> => {
    const plan: Record<number, DayPlan> = {};
    getWeekDates(offset).forEach((date, idx) => {
      const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
      const collected: { courseId: string; sessionId: string; course: string; s: Session; hours: number }[] = [];
      if (idx !== 6) {
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
      plan[idx] = { date, sessions, totalHours: total };
    });
    return plan;
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
    moveSession(draggedSession.courseId, draggedSession.sessionId, date);
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

  const weekPlan = getWeeklyPlan(currentWeek);

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
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title={t(theme === 'dark' ? 'theme.light' : 'theme.dark')}
              className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50">
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <Segmented />
            <div className="flex items-center gap-2 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
              {isOnline ? <Wifi className="w-3.5 h-3.5 text-emerald-500" /> : <WifiOff className="w-3.5 h-3.5 text-rose-500" />}
              <span className="text-slate-600 dark:text-slate-300">{t('status.local')}</span>
              <span className={isOnline ? 'text-emerald-600' : 'text-rose-600'}>{isOnline ? t('status.ready') : t('status.unavailable')}</span>
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
                <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab ? 'bg-white/20' : 'bg-indigo-100 text-indigo-700'}`}>{courses.length}</span>
              )}
            </button>
          ))}
        </nav>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { icon: BookOpen, color: 'text-indigo-600', label: t('stats.courses'), value: courses.length },
            { icon: Clock, color: 'text-emerald-600', label: t('stats.today'), value: `${todayHours}h` },
            { icon: CheckCircle2, color: 'text-violet-600', label: t('stats.progress'), value: `${completionRate}%` },
            { icon: AlertTriangle, color: overdue ? 'text-rose-600' : 'text-slate-400 dark:text-slate-500', label: t('stats.overdue'), value: overdue },
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold flex items-center gap-2"><Calendar className="w-5 h-5 text-indigo-600" /> {t('planning.title')}</h2>
                  <div className="flex items-center gap-2">
                    {overdue > 0 && (
                      <button onClick={rescheduleAll} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100">
                        <RefreshCw className="w-3.5 h-3.5" /> {overdue}
                      </button>
                    )}
                    <button onClick={() => setCurrentWeek(currentWeek - 1)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><ChevronLeft className="w-4 h-4" /></button>
                    <span className="text-sm font-medium px-2 min-w-[90px] text-center">{currentWeek === 0 ? t('planning.thisWeek') : (currentWeek > 0 ? `+${currentWeek}` : currentWeek)}</span>
                    <button onClick={() => setCurrentWeek(currentWeek + 1)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><ChevronRight className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-7 divide-y md:divide-y-0 md:divide-x divide-slate-100">
                  {Object.entries(weekPlan).map(([k, day]) => {
                    const idx = Number(k);
                    const isToday = day.date.toDateString() === new Date().toDateString();
                    const isSunday = idx === 6;
                    const overloaded = day.totalHours > availableHours;
                    const dayConstraints = constraintsOnDate(day.date);
                    return (
                      <div key={k}
                        onDragOver={!isSunday ? (e) => e.preventDefault() : undefined}
                        onDrop={!isSunday ? (e) => onDrop(e, day.date) : undefined}
                        className={`p-3 min-h-[220px] ${isToday ? 'bg-indigo-50/60' : isSunday ? 'bg-emerald-50/40' : ''}`}>
                        <div className="mb-2">
                          <h3 className={`text-sm font-semibold ${isToday ? 'text-indigo-700' : 'text-slate-700 dark:text-slate-200'}`}>{dayLabels(lang)[idx]}{isToday && ' •'}</h3>
                          <p className="text-xs text-slate-400 dark:text-slate-500">{day.date.getDate()}/{day.date.getMonth() + 1}</p>
                          {dayConstraints.map((c) => (
                            <div key={c.id} className="mt-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 truncate">
                              ⚠ {c.allDay ? t('constraints.allDay') : `${c.startHour}h–${c.endHour}h`}
                            </div>
                          ))}
                        </div>
                        {isSunday ? (
                          <p className="text-xs text-emerald-600 italic">🌙 {t('planning.restAuto')}</p>
                        ) : day.sessions.length === 0 ? (
                          <p className="text-xs text-slate-300 dark:text-slate-600 italic">{t('planning.rest')}</p>
                        ) : (
                          <div className="space-y-1.5">
                            {day.sessions.map((s) => (
                              <div key={s.sessionId} draggable={!s.completed}
                                onDragStart={() => setDraggedSession({ courseId: s.courseId, sessionId: s.sessionId })}
                                className={`group relative text-xs p-2 rounded-lg border ${colorFor(s.interval)} ${s.completed ? 'opacity-50' : 'cursor-move'}`}>
                                <div className="font-semibold truncate flex items-center gap-1">
                                  {s.completed && (s.success ? <Check className="w-3 h-3 text-emerald-600" /> : <X className="w-3 h-3 text-rose-600" />)}
                                  {s.course}
                                </div>
                                <div className="flex justify-between items-center mt-0.5">
                                  <span className="opacity-80">{s.interval}</span><span className="font-medium">{s.hours}h</span>
                                </div>
                                <div className="text-[10px] font-mono mt-0.5 opacity-70">⏰ {s.startTime}–{s.endTime}</div>
                                {s.rescheduled && <div className="text-[10px] text-orange-600 mt-0.5">↻ {t('planning.rescheduled')}</div>}
                                {!s.completed && (
                                  <>
                                    <div className="absolute top-1 left-1 flex gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                                      <button title={t('session.moveLeft')} onClick={() => moveByDays(s.courseId, s.sessionId, day.date, -1)} className="w-5 h-5 rounded bg-slate-600/85 hover:bg-slate-700 text-white flex items-center justify-center"><ChevronLeft className="w-3 h-3" /></button>
                                      <button title={t('session.moveRight')} onClick={() => moveByDays(s.courseId, s.sessionId, day.date, 1)} className="w-5 h-5 rounded bg-slate-600/85 hover:bg-slate-700 text-white flex items-center justify-center"><ChevronRight className="w-3 h-3" /></button>
                                    </div>
                                    <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                                      <button title={t('session.markPass')} onClick={() => markSession(s.courseId, s.sessionId, true)} className="w-5 h-5 rounded bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center"><Check className="w-3 h-3" /></button>
                                      <button title={t('session.markFail')} onClick={() => markSession(s.courseId, s.sessionId, false)} className="w-5 h-5 rounded bg-amber-500 hover:bg-amber-600 text-white flex items-center justify-center"><RefreshCw className="w-3 h-3" /></button>
                                      <button title={t('session.delete')} onClick={() => { if (confirm(t('session.confirmDelete', { interval: s.interval, course: s.course }))) deleteSession(s.courseId, s.sessionId); }} className="w-5 h-5 rounded bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center"><X className="w-3 h-3" /></button>
                                    </div>
                                  </>
                                )}
                              </div>
                            ))}
                            <div className={`text-xs font-medium mt-1 ${overloaded ? 'text-rose-600' : 'text-slate-500 dark:text-slate-400'}`}>{t('planning.total')}: {day.totalHours}h</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Assistant */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800">
                <h2 className="font-semibold flex items-center gap-2">💬 {t('assistant.title')}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('assistant.subtitle')}</p>
              </div>
              <div className="h-80 overflow-y-auto p-4 space-y-3">
                {chatMessages.map((m, i) => (
                  <div key={i} className={`flex ${m.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-2.5 rounded-lg text-sm whitespace-pre-line ${m.type === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200'}`}>{m.content}</div>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-slate-100 dark:border-slate-800">
                <div className="flex gap-2 mb-3">
                  <input value={inputMessage} onChange={(e) => setInputMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder={t('assistant.placeholder')} className="flex-1 p-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  <button onClick={handleSend} className="px-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"><Plus className="w-4 h-4" /></button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setInputMessage(lang === 'fr' ? 'Ajouter Anatomie avec 2 heures par jour' : 'Add Anatomy with 2 hours per day')} className="text-xs p-2 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-indigo-700">➕ {t('assistant.newCourse')}</button>
                  <button onClick={() => setInputMessage(lang === 'fr' ? 'Planning de la semaine' : 'Week plan')} className="text-xs p-2 bg-violet-50 hover:bg-violet-100 rounded-lg text-violet-700">📅 {t('assistant.week')}</button>
                  <button onClick={() => setInputMessage(lang === 'fr' ? 'Aide' : 'Help')} className="text-xs p-2 bg-emerald-50 hover:bg-emerald-100 rounded-lg text-emerald-700">❓ {t('assistant.help')}</button>
                  <button onClick={() => setActiveTab('settings')} className="text-xs p-2 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300">⚙️ {t('assistant.config')}</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* COURSES TAB */}
        {activeTab === 'courses' && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold mb-4">{t('courses.title')}</h2>
            {courses.length === 0 ? (
              <div className="text-center py-12">
                <BookOpen className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-500 dark:text-slate-400">{t('courses.empty')}</p>
                <button onClick={() => setActiveTab('planning')} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">💬 {t('courses.emptyCta')}</button>
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
                          <button onClick={() => { if (confirm(t('courses.confirmDelete', { name: c.name }))) deleteCourse(c.id); }} title={t('courses.delete')} className="w-8 h-8 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>
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
                      <button onClick={() => deleteConstraint(c.id)} className="text-rose-500 hover:text-rose-700"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Email */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="font-semibold mb-4 flex items-center gap-2"><Mail className="w-4 h-4 text-indigo-600" /> {t('settings.email.title')}</h2>
              <input type="email" value={userEmail} onChange={(e) => { setUserEmail(e.target.value); setIsEmailValid(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.target.value)); }}
                placeholder={t('settings.email.label')} className={`w-full p-2.5 border rounded-lg mb-3 ${isEmailValid ? 'border-emerald-300 bg-emerald-50' : userEmail ? 'border-rose-300 bg-rose-50' : 'border-slate-200 dark:border-slate-700'}`} />
              <button onClick={sendInvitations} disabled={!isEmailValid || !courses.length || isEmailSending} className="w-full py-2.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:bg-slate-300">{isEmailSending ? t('settings.email.sending') : t('settings.email.send')}</button>
            </div>

            {/* Notifications */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="font-semibold mb-4 flex items-center gap-2"><Bell className="w-4 h-4 text-indigo-600" /> {t('settings.notif.title')}</h2>
              {notificationPermission === 'granted' ? (
                <div className="flex items-center gap-2">
                  <span className="text-emerald-600 text-sm">✓ {t('settings.notif.enabled')}</span>
                  <button onClick={testNotification} className="ml-auto px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg text-sm">{t('settings.notif.test')}</button>
                </div>
              ) : (
                <button onClick={initNotifications} className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-sm">{t('settings.notif.enable')}</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default function Home() {
  return <MemoMed />;
}
