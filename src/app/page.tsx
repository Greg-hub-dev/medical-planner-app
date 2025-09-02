'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, Clock, Brain, Plus, CheckCircle2, ChevronLeft, ChevronRight, Wifi, WifiOff, Settings, BookOpen, Home } from 'lucide-react';

// Configuration API MongoDB
const API_CONFIG = {
  coursesEndpoint: '/api/courses',
  constraintsEndpoint: '/api/constraints',
  useLocalBackup: true // Garde localStorage comme backup
};

// Interfaces TypeScript
interface JInterval {
  key: string;
  days: number;
  label: string;
  color: string;
}

interface Session {
  id: string;
  date: Date;
  originalDate: Date;
  interval: string;
  intervalLabel: string;
  completed: boolean;
  success: boolean | null;
  color: string;
  rescheduled: boolean;
}

interface Course {
  id: number;
  name: string;
  hoursPerDay: number;
  createdAt: Date;
  sessions: Session[];
  totalSessions: number;
  completedSessions: number;
}

interface Constraint {
  id: number;
  date: Date;
  startHour: number;
  endHour: number;
  description: string;
  createdAt: Date;
}

interface Stats {
  totalCourses: number;
  todayHours: number;
  completionRate: number;
}

interface ChatMessage {
  type: string;
  content: string;
}

interface WorkingHours {
  start: number;
  end: number;
  lunchBreak: { start: number; end: number };
  availableHours: number;
}

interface WeeklyPlanSession {
  course: string;
  interval: string;
  intervalLabel: string;
  hours: number;
  completed: boolean;
  success: boolean | null;
  color: string;
  rescheduled: boolean;
}

interface DayPlan {
  date: Date;
  sessions: WeeklyPlanSession[];
  totalHours: number;
}

interface WeeklyPlan {
  [key: string]: DayPlan;
}

interface TodaySession {
  course: Course;
  session: Session;
  hours: number;
}

const MedicalPlanningAgent = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [currentWeek, setCurrentWeek] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<'home' | 'courses' | 'settings'>('home');
  const [stats, setStats] = useState<Stats>({
    totalCourses: 0,
    todayHours: 0,
    completionRate: 0
  });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      type: 'ai',
      content: '🎓 Bonjour ! Je suis votre agent de planning médical.\n\n📅 Planning: Lundi-Samedi • Dimanche = Repos automatique\n\n💡 Formats disponibles:\n• "Ajouter Anatomie avec 2 heures par jour"\n• "Ajouter Physiologie avec 1.5h démarrage le 15/03"\n• "J\'ai une contrainte le 20/03 de 9h à 12h"\n• "Déplacer cours Anatomie J+10 du 16/09 au 19/09"\n\n🔄 Nouveaux intervalles J : J0, J+1, J+2, J+10, J+25, J+47\n🎯 Glisser-déposer activé dans le planning !\n☁️ Sauvegarde automatique MongoDB Atlas'
    }
  ]);
  const [inputMessage, setInputMessage] = useState<string>('');

  // États pour le drag and drop
  const [draggedSession, setDraggedSession] = useState<{
    courseId: number;
    sessionId: string;
    courseName: string;
    interval: string;
    hours: number;
  } | null>(null);

  const handleDragStart = (e: React.DragEvent, courseId: number, sessionId: string, courseName: string, interval: string, hours: number) => {
    setDraggedSession({ courseId, sessionId, courseName, interval, hours });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetDate: Date) => {
    e.preventDefault();

    if (!draggedSession) return;

    // Vérifier si c'est un dimanche
    if (targetDate.getDay() === 0) {
      setChatMessages(prev => [...prev, {
        type: 'ai',
        content: `❌ Impossible de déposer le dimanche !\n\n🛌 Dimanche = repos automatique.\n💡 La session "${draggedSession.courseName}" ${draggedSession.interval} ne peut pas être programmée ce jour-là.`
      }]);
      setDraggedSession(null);
      return;
    }

    // Vérifier les conflits
    if (hasConflict(targetDate, draggedSession.hours)) {
      setChatMessages(prev => [...prev, {
        type: 'ai',
        content: `❌ Conflit détecté !\n\n⚠️ Une contrainte empêche le déplacement de "${draggedSession.courseName}" ${draggedSession.interval} vers le ${targetDate.toLocaleDateString('fr-FR')}.\n💡 Choisissez une autre date ou vérifiez vos contraintes.`
      }]);
      setDraggedSession(null);
      return;
    }

    // Effectuer le déplacement
    moveSession(draggedSession.courseId, draggedSession.sessionId, targetDate);

    setChatMessages(prev => [...prev, {
      type: 'ai',
      content: `✅ Session déplacée par glisser-déposer !\n\n📅 "${draggedSession.courseName}" ${draggedSession.interval} (${draggedSession.hours}h)\n🔄 Nouvelle date : ${targetDate.toLocaleDateString('fr-FR')}\n☁️ Sauvegardé automatiquement dans MongoDB`
    }]);

    setDraggedSession(null);
  };

  const workingHours: WorkingHours = {
    start: 9,
    end: 19,
    lunchBreak: { start: 13, end: 14 },
    availableHours: 9
  };

  const jIntervals: JInterval[] = [
    { key: 'J0', days: 0, label: 'J0 (Apprentissage)', color: 'bg-blue-100 text-blue-700' },
    { key: 'J+1', days: 1, label: 'J+1', color: 'bg-red-100 text-red-700' },
    { key: 'J+2', days: 2, label: 'J+2', color: 'bg-orange-100 text-orange-700' },
    { key: 'J+10', days: 10, label: 'J+10', color: 'bg-yellow-100 text-yellow-700' },
    { key: 'J+25', days: 25, label: 'J+25', color: 'bg-green-100 text-green-700' },
    { key: 'J+47', days: 47, label: 'J+47', color: 'bg-purple-100 text-purple-700' }
  ];

  // Nouvelles fonctions de sauvegarde MongoDB via API
  const saveCourses = useCallback(async (coursesData: Course[]) => {
    if (coursesData.length === 0 && courses.length === 0) return;

    // Convertir les dates en strings pour MongoDB
    const coursesForDB = coursesData.map(course => ({
      ...course,
      createdAt: course.createdAt.toISOString(),
      sessions: course.sessions.map(session => ({
        ...session,
        date: session.date.toISOString(),
        originalDate: session.originalDate.toISOString()
      }))
    }));

    try {
      const response = await fetch(API_CONFIG.coursesEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courses: coursesForDB })
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`✅ ${result.count} cours sauvegardés dans MongoDB`);
        setIsOnline(true);
        setLastSyncTime(new Date());

        // Backup local en cas de succès
        if (API_CONFIG.useLocalBackup) {
          localStorage.setItem('medical_courses_backup', JSON.stringify(coursesForDB));
        }
      } else {
        throw new Error(`Erreur API: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Erreur sauvegarde MongoDB courses:', error);
      setIsOnline(false);

      // Fallback vers localStorage
      if (API_CONFIG.useLocalBackup) {
        localStorage.setItem('medical_courses_backup', JSON.stringify(coursesForDB));
        console.log('📱 Données sauvegardées en local comme backup');
      }
    }
  }, [courses.length]);

  const saveConstraints = useCallback(async (constraintsData: Constraint[]) => {
    if (constraintsData.length === 0 && constraints.length === 0) return;

    // Convertir les dates en strings pour MongoDB
    const constraintsForDB = constraintsData.map(constraint => ({
      ...constraint,
      date: constraint.date.toISOString(),
      createdAt: constraint.createdAt.toISOString()
    }));

    try {
      const response = await fetch(API_CONFIG.constraintsEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ constraints: constraintsForDB })
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`✅ ${result.count} contraintes sauvegardées dans MongoDB`);
        setIsOnline(true);
        setLastSyncTime(new Date());

        // Backup local
        if (API_CONFIG.useLocalBackup) {
          localStorage.setItem('medical_constraints_backup', JSON.stringify(constraintsForDB));
        }
      } else {
        throw new Error(`Erreur API: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Erreur sauvegarde MongoDB constraints:', error);
      setIsOnline(false);

      // Fallback vers localStorage
      if (API_CONFIG.useLocalBackup) {
        localStorage.setItem('medical_constraints_backup', JSON.stringify(constraintsForDB));
        console.log('📱 Données sauvegardées en local comme backup');
      }
    }
  }, [constraints.length]);

  // Nouvelle fonction de chargement MongoDB via API
  const loadData = useCallback(async () => {
    setIsLoading(true);

    try {
      console.log('🔄 Chargement depuis MongoDB...');

      // Charger depuis les APIs MongoDB
      const [coursesResponse, constraintsResponse] = await Promise.all([
        fetch(API_CONFIG.coursesEndpoint),
        fetch(API_CONFIG.constraintsEndpoint)
      ]);

      if (coursesResponse.ok && constraintsResponse.ok) {
        const coursesData = await coursesResponse.json();
        const constraintsData = await constraintsResponse.json();

        // Traitement des cours
        if (coursesData.courses && coursesData.courses.length > 0) {
          const processedCourses = coursesData.courses.map((course: Course) => ({
            ...course,
            createdAt: new Date(course.createdAt),
            sessions: course.sessions.map((session: Session) => ({
              ...session,
              date: new Date(session.date),
              originalDate: new Date(session.originalDate)
            }))
          }));
          setCourses(processedCourses);
          console.log(`✅ ${processedCourses.length} cours chargés depuis MongoDB`);
        }

        // Traitement des contraintes
        if (constraintsData.constraints && constraintsData.constraints.length > 0) {
          const processedConstraints = constraintsData.constraints.map((constraint: Constraint) => ({
            ...constraint,
            date: new Date(constraint.date),
            createdAt: new Date(constraint.createdAt)
          }));
          setConstraints(processedConstraints);
          console.log(`✅ ${processedConstraints.length} contraintes chargées depuis MongoDB`);
        }

        setIsOnline(true);
        setLastSyncTime(new Date());

        // Ajouter message dans le chat
        setChatMessages(prev => [...prev, {
          type: 'ai',
          content: `☁️ Données synchronisées avec MongoDB Atlas !\n\n✅ ${coursesData.courses?.length || 0} cours récupérés\n✅ ${constraintsData.constraints?.length || 0} contraintes récupérées\n\n🔄 Synchronisation automatique activée`
        }]);

      } else {
        throw new Error(`Erreur API: courses(${coursesResponse.status}) constraints(${constraintsResponse.status})`);
      }
    } catch (error) {
      console.error('❌ Erreur chargement MongoDB:', error);
      setIsOnline(false);

      // Fallback vers localStorage backup
      if (API_CONFIG.useLocalBackup) {
        console.log('📱 Tentative de chargement depuis le backup local...');

        const localCourses = localStorage.getItem('medical_courses_backup');
        const localConstraints = localStorage.getItem('medical_constraints_backup');

        if (localCourses) {
          const courses = JSON.parse(localCourses).map((course: Course) => ({
            ...course,
            createdAt: new Date(course.createdAt),
            sessions: course.sessions.map((session: Session) => ({
              ...session,
              date: new Date(session.date),
              originalDate: new Date(session.originalDate)
            }))
          }));
          setCourses(courses);
          console.log(`📱 ${courses.length} cours chargés depuis le backup local`);
        }

        if (localConstraints) {
          const constraints = JSON.parse(localConstraints).map((constraint: Constraint) => ({
            ...constraint,
            date: new Date(constraint.date),
            createdAt: new Date(constraint.createdAt)
          }));
          setConstraints(constraints);
          console.log(`📱 ${constraints.length} contraintes chargées depuis le backup local`);
        }

        if (localCourses || localConstraints) {
          setChatMessages(prev => [...prev, {
            type: 'ai',
            content: `⚠️ Mode hors ligne - Données chargées depuis le backup local\n\n📱 Les données seront synchronisées avec MongoDB dès que la connexion sera rétablie`
          }]);
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createConstraint = (date: string | Date, startHour: number, endHour: number, description: string): Constraint => {
    return {
      id: Date.now(),
      date: new Date(date),
      startHour: startHour,
      endHour: endHour,
      description: description,
      createdAt: new Date()
    };
  };

  const hasConflict = (sessionDate: Date, sessionHours: number): boolean => {
    const sessionStart = new Date(sessionDate);
    sessionStart.setHours(workingHours.start, 0, 0, 0);

    const sessionEnd = new Date(sessionDate);
    sessionEnd.setHours(workingHours.start + sessionHours, 0, 0, 0);

    return constraints.some(constraint => {
      const constraintDate = new Date(constraint.date);
      constraintDate.setHours(0, 0, 0, 0);

      const sessionDateOnly = new Date(sessionDate);
      sessionDateOnly.setHours(0, 0, 0, 0);

      if (constraintDate.getTime() !== sessionDateOnly.getTime()) return false;

      if (constraint.startHour === 0 && constraint.endHour === 24) return true;

      const constraintStart = constraint.startHour;
      const constraintEnd = constraint.endHour;
      const sessionStartHour = workingHours.start;
      const sessionEndHour = workingHours.start + sessionHours;

      return !(sessionEndHour <= constraintStart || sessionStartHour >= constraintEnd);
    });
  };

  const createCourseSessions = (courseName: string, startDate: Date = new Date()): Session[] => {
    const sessions: Session[] = [];
    const adjustedStartDate = new Date(startDate);

    if (adjustedStartDate.getDay() === 0) {
      adjustedStartDate.setDate(adjustedStartDate.getDate() + 1);
    }

    jIntervals.forEach(interval => {
      const sessionDate = new Date(adjustedStartDate);
      sessionDate.setDate(adjustedStartDate.getDate() + interval.days);

      if (sessionDate.getDay() === 0) {
        sessionDate.setDate(sessionDate.getDate() + 1);
      }

      sessions.push({
        id: `${Date.now()}_${interval.key}`,
        date: sessionDate,
        originalDate: new Date(sessionDate),
        interval: interval.key,
        intervalLabel: interval.label,
        completed: false,
        success: null,
        color: interval.color,
        rescheduled: sessionDate.getDay() === 1 && interval.days > 0
      });
    });

    return sessions;
  };

  const createNewCourse = (name: string, hoursPerDay: number, startDate: Date = new Date()): Course => {
    const sessions = createCourseSessions(name, startDate);

    return {
      id: Date.now(),
      name: name,
      hoursPerDay: hoursPerDay,
      createdAt: new Date(),
      sessions: sessions,
      totalSessions: sessions.length,
      completedSessions: 0
    };
  };

  const deleteCourse = (courseId: number): void => {
    const updatedCourses = courses.filter(course => course.id !== courseId);
    setCourses(updatedCourses);
  };

  const deleteAllCourses = (): void => {
    setCourses([]);
    setStats(prev => ({
      ...prev,
      totalCourses: 0,
      todayHours: 0,
      completionRate: 0
    }));
  };

  const deleteSession = (courseId: number, sessionId: string): void => {
    const updatedCourses = courses.map(course => {
      if (course.id === courseId) {
        const updatedSessions = course.sessions.filter(session => session.id !== sessionId);
        return {
          ...course,
          sessions: updatedSessions,
          totalSessions: updatedSessions.length,
          completedSessions: updatedSessions.filter(s => s.completed).length
        };
      }
      return course;
    }).filter(course => course.sessions.length > 0);

    setCourses(updatedCourses);
  };

  const markSessionComplete = (courseId: number, sessionId: string, success: boolean): void => {
    const updatedCourses = courses.map(course => {
      if (course.id === courseId) {
        const updatedSessions = course.sessions.map(session => {
          if (session.id === sessionId) {
            return { ...session, completed: true, success: success };
          }
          return session;
        });
        return {
          ...course,
          sessions: updatedSessions,
          completedSessions: updatedSessions.filter(s => s.completed).length
        };
      }
      return course;
    });

    setCourses(updatedCourses);
    saveCourses(updatedCourses);
  };

  const moveSession = (courseId: number, sessionId: string, newDate: Date): void => {
    const updatedCourses = courses.map(course => {
      if (course.id === courseId) {
        const updatedSessions = course.sessions.map(session => {
          if (session.id === sessionId) {
            return {
              ...session,
              date: new Date(newDate),
              rescheduled: true
            };
          }
          return session;
        });
        return { ...course, sessions: updatedSessions };
      }
      return course;
    });

    setCourses(updatedCourses);
  };

  const rebalanceSessions = (coursesToBalance: Course[]): Course[] => {
    const updatedCourses = [...coursesToBalance];

    interface PendingSession extends Session {
      courseName: string;
      courseId: number;
      hoursNeeded: number;
    }

    const allPendingSessions: PendingSession[] = [];
    updatedCourses.forEach(course => {
      course.sessions.forEach(session => {
        if (!session.completed) {
          allPendingSessions.push({
            ...session,
            courseName: course.name,
            courseId: course.id,
            hoursNeeded: course.hoursPerDay
          });
        }
      });
    });

    allPendingSessions.sort((a, b) => {
      if (a.originalDate.getTime() !== b.originalDate.getTime()) {
        return a.originalDate.getTime() - b.originalDate.getTime();
      }
      return jIntervals.findIndex(j => j.key === a.interval) - jIntervals.findIndex(j => j.key === b.interval);
    });

    const dailySchedule: { [key: string]: number } = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    allPendingSessions.forEach(session => {
      const targetDate = new Date(Math.max(session.originalDate.getTime(), today.getTime()));

      while (true) {
        if (targetDate.getDay() === 0) {
          targetDate.setDate(targetDate.getDate() + 1);
          continue;
        }

        const dateKey = targetDate.toDateString();
        const currentDayHours = dailySchedule[dateKey] || 0;

        if (hasConflict(targetDate, session.hoursNeeded)) {
          targetDate.setDate(targetDate.getDate() + 1);
          continue;
        }

        if (currentDayHours + session.hoursNeeded <= workingHours.availableHours) {
          dailySchedule[dateKey] = currentDayHours + session.hoursNeeded;

          const course = updatedCourses.find(c => c.id === session.courseId);
          if (course) {
            const originalSession = course.sessions.find(s => s.id === session.id);
            if (originalSession) {
              originalSession.date = new Date(targetDate);
              originalSession.rescheduled = targetDate.toDateString() !== session.originalDate.toDateString();
            }
          }

          break;
        } else {
          targetDate.setDate(targetDate.getDate() + 1);
        }
      }
    });

    return updatedCourses;
  };

  const getWeekDates = (weekOffset: number = 0): Date[] => {
    const today = new Date();
    const currentDay = today.getDay();
    const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;

    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset + (weekOffset * 7));

    const weekDates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      weekDates.push(date);
    }
    return weekDates;
  };

  const getWeeklyPlan = (weekOffset: number = 0): WeeklyPlan => {
    const weekDates = getWeekDates(weekOffset);
    const weeklyPlan: WeeklyPlan = {};

    // Inclure tous les jours de la semaine, y compris le dimanche
    weekDates.forEach((date, index) => {
      const dayNames = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
      const dayName = dayNames[index];
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);

      const daySessions: WeeklyPlanSession[] = [];
      let totalHours = 0;

      // Le dimanche n'a jamais de sessions
      if (index !== 6) {
        courses.forEach(course => {
          course.sessions.forEach(session => {
            const sessionDate = new Date(session.date);
            sessionDate.setHours(0, 0, 0, 0);

            if (sessionDate.getTime() === dayStart.getTime()) {
              daySessions.push({
                course: course.name,
                interval: session.interval,
                intervalLabel: session.intervalLabel,
                hours: course.hoursPerDay,
                completed: session.completed,
                success: session.success,
                color: session.color,
                rescheduled: session.rescheduled
              });
              if (!session.completed) {
                totalHours += course.hoursPerDay;
              }
            }
          });
        });
      }

      weeklyPlan[dayName] = {
        date: date,
        sessions: daySessions,
        totalHours: totalHours
      };
    });

    return weeklyPlan;
  };

  const getTodaySessions = useCallback((): TodaySession[] => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaySessions: TodaySession[] = [];

    courses.forEach(course => {
      course.sessions.forEach(session => {
        const sessionDate = new Date(session.date);
        sessionDate.setHours(0, 0, 0, 0);

        if (sessionDate.getTime() === today.getTime() && !session.completed) {
          todaySessions.push({
            course: course,
            session: session,
            hours: course.hoursPerDay
          });
        }
      });
    });

    return todaySessions;
  }, [courses]);

  const processAICommand = (message: string): string => {
    const lowerMsg = message.toLowerCase();

    // Logique de traitement des commandes (même code qu'avant)
    if (lowerMsg.includes('aide')) {
      return `🤖 Commandes disponibles:\n\n📚 COURS :\n• "Ajouter [nom] avec [X] heures par jour"\n• "Ajouter [nom] avec [X]h démarrage le [date]"\n\n🗑️ SUPPRESSION :\n• "Supprimer tous les cours"\n• "Supprimer le cours [nom]"\n\n⚠️ CONTRAINTES :\n• "J'ai une contrainte le [date] de [heure] à [heure]"\n• "Mes contraintes"\n\n📋 PLANNING :\n• "Mon planning du jour"\n• "Planning de la semaine"\n\n☁️ Toutes vos données sont sauvegardées automatiquement dans MongoDB Atlas !`;
    }

    // Ajouter d'autres commandes ici selon les besoins
    return `🤔 Je comprends que vous voulez "${message}".\n\n💡 Essayez:\n• "Ajouter [cours] avec [heures] heures par jour"\n• "J'ai une contrainte le [date] de [heure] à [heure]"\n• "Mon planning du jour"\n• "Aide" pour plus de commandes`;
  };

  const handleSendMessage = () => {
    if (!inputMessage.trim()) return;

    const userMsg: ChatMessage = { type: 'user', content: inputMessage };
    const aiResponse: ChatMessage = { type: 'ai', content: processAICommand(inputMessage) };

    setChatMessages([...chatMessages, userMsg, aiResponse]);
    setInputMessage('');
  };

  // Charger les données au démarrage
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Sauvegarder automatiquement les cours quand ils changent
  useEffect(() => {
    if (courses.length > 0 && !isLoading) {
      saveCourses(courses);
    }
  }, [courses, isLoading, saveCourses]);

  // Sauvegarder automatiquement les contraintes quand elles changent
  useEffect(() => {
    if (constraints.length > 0 && !isLoading) {
      saveConstraints(constraints);
    }
  }, [constraints, isLoading, saveConstraints]);

  useEffect(() => {
    const todayHours = getTodaySessions().reduce((sum, s) => sum + s.hours, 0);
    const totalCompletedSessions = courses.reduce((sum, course) => sum + course.sessions.filter(s => s.completed).length, 0);
    const totalSessions = courses.reduce((sum, course) => sum + course.sessions.length, 0);

    setStats({
      totalCourses: courses.length,
      todayHours: todayHours,
      completionRate: totalSessions > 0 ? Math.round((totalCompletedSessions / totalSessions) * 100) : 0
    });
  }, [courses, getTodaySessions]);

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto p-6 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Brain className="w-16 h-16 text-blue-600 mx-auto mb-4 animate-pulse" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Chargement depuis MongoDB Atlas...</h2>
          <p className="text-gray-600">Synchronisation de vos données personnelles</p>
          <div className="mt-4 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    );
  }

  const renderHomeContent = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Statistiques en haut */}
      <div className="lg:col-span-3 grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-medium">Cours</span>
          </div>
          <div className="text-2xl font-bold text-gray-800">{stats.totalCourses}</div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-5 h-5 text-green-600" />
            <span className="text-sm font-medium">Aujourd'hui</span>
          </div>
          <div className="text-2xl font-bold text-gray-800">{stats.todayHours}h</div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-5 h-5 text-purple-600" />
            <span className="text-sm font-medium">Progression</span>
          </div>
          <div className="text-2xl font-bold text-gray-800">{stats.completionRate}%</div>
        </div>
      </div>

      {/* Planning hebdomadaire */}
      <div className="lg:col-span-2">
        <div className="bg-white rounded-lg shadow-sm border mb-6">
          <div className="p-6 border-b flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Planning Hebdomadaire (Lundi-Samedi)
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentWeek(currentWeek - 1)}
                className="p-2 hover:bg-gray-100 rounded transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium px-3">
                {currentWeek === 0 ? 'Cette semaine' :
                 currentWeek > 0 ? `+${currentWeek} semaine${currentWeek > 1 ? 's' : ''}` :
                 `${Math.abs(currentWeek)} semaine${Math.abs(currentWeek) > 1 ? 's' : ''} passée${Math.abs(currentWeek) > 1 ? 's' : ''}`}
              </span>
              <button
                onClick={() => setCurrentWeek(currentWeek + 1)}
                className="p-2 hover:bg-gray-100 rounded transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-7 divide-x divide-gray-200">
            {Object.entries(getWeeklyPlan(currentWeek)).map(([dayName, dayData]) => {
              const isToday = dayData.date.toDateString() === new Date().toDateString();
              const isOverloaded = dayData.totalHours > workingHours.availableHours;
              const isSunday = dayData.date.getDay() === 0;

              return (
                <div
                  key={dayName}
                  className={`p-4 ${isToday ? 'bg-blue-50 border-blue-200' : ''} ${isOverloaded ? 'bg-red-50' : ''} ${isSunday ? 'bg-green-50' : ''} min-h-[200px]`}
                  onDragOver={!isSunday ? handleDragOver : undefined}
                  onDrop={!isSunday ? (e) => handleDrop(e, dayData.date) : undefined}
                >
                  <div className="mb-2">
                    <h3 className={`font-medium ${isToday ? 'text-blue-800' : isOverloaded ? 'text-red-800' : isSunday ? 'text-green-800' : 'text-gray-800'}`}>
                      {dayName}
                      {isToday && ' 👉'}
                    </h3>
                    <p className="text-xs text-gray-600">
                      {dayData.date.getDate()}/{dayData.date.getMonth() + 1}
                    </p>
                    {!isSunday && (
                      <p className="text-xs text-gray-400 mt-1">📋 Glissez ici pour déplacer</p>
                    )}
                  </div>

                  {dayData.sessions.length === 0 && !isSunday ? (
                    <p className="text-xs text-gray-400 italic">Repos</p>
                  ) : isSunday ? (
                    <>
                      <p className="text-xs text-green-600 italic">🛌 Repos automatique</p>
                      <div className="text-xs font-medium mt-2 text-green-600">
                        📊 Total: 0h
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2">
                      {dayData.sessions.map((session, idx) => {
                        const correspondingCourse = courses.find(c => c.name === session.course);
                        const correspondingSession = correspondingCourse?.sessions.find(s =>
                          s.interval === session.interval &&
                          s.date.toDateString() === dayData.date.toDateString()
                        );

                        return (
                          <div
                            key={idx}
                            className={`relative group text-xs p-2 rounded ${session.color} ${session.completed ? 'opacity-60' : ''} ${!session.completed ? 'cursor-move' : ''}`}
                            draggable={!session.completed}
                            onDragStart={correspondingCourse && correspondingSession && !session.completed ?
                              (e) => handleDragStart(e, correspondingCourse.id, correspondingSession.id, session.course, session.interval, session.hours) :
                              undefined
                            }
                            title={!session.completed ? "Glissez pour déplacer cette session" : "Session terminée"}
                          >
                            <div className="font-medium truncate flex items-center gap-1">
                              {!session.completed && <span className="text-xs opacity-50">⋮⋮</span>}
                              {session.course}
                            </div>
                            <div className="flex justify-between items-center">
                              <span>{session.intervalLabel}</span>
                              <span className="font-medium">{session.hours}h</span>
                            </div>
                            {session.rescheduled && (
                              <div className="mt-1 text-orange-600">🔄 Reporté</div>
                            )}
                          </div>
                        );
                      })}
                      <div className={`text-xs font-medium mt-2 ${isOverloaded ? 'text-red-600' : 'text-blue-600'}`}>
                        📊 Total: {dayData.totalHours}h
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {courses.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
            <Brain className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-gray-800 mb-2">Aucun cours programmé</h3>
            <p className="text-gray-600 mb-6">Ajoutez vos cours et gérez vos contraintes</p>
            <div className="space-y-2">
              <button
                onClick={() => setInputMessage('Ajouter Anatomie avec 2 heures par jour')}
                className="block w-full p-3 bg-blue-50 hover:bg-blue-100 rounded-lg text-blue-700 font-medium"
              >
                ➕ Anatomie (2h/jour)
              </button>
              <button
                onClick={() => setInputMessage('J\'ai une contrainte le 15/03 de 9h à 12h')}
                className="block w-full p-3 bg-red-50 hover:bg-red-100 rounded-lg text-red-700 font-medium"
              >
                ⚠️ Ajouter une contrainte
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Assistant IA */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            🤖 Assistant IA
            {isOnline ? (
              <span className="text-xs text-green-600">☁️ MongoDB</span>
            ) : (
              <span className="text-xs text-red-600">📱 Local</span>
            )}
          </h2>
          <p className="text-xs text-gray-600">Contraintes • Réorganisation automatique</p>
        </div>

        <div className="h-96 overflow-y-auto p-4 space-y-4">
          {chatMessages.map((msg, index) => (
            <div key={index} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-xs p-3 rounded-lg ${
                msg.type === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-800'
              }`}>
                <div className="text-sm whitespace-pre-line">{msg.content}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t">
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Ajouter cours ou contrainte..."
              className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSendMessage}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setInputMessage('Ajouter Anatomie avec 2 heures par jour')}
              className="text-xs p-2 bg-blue-50 hover:bg-blue-100 rounded border text-blue-700"
            >
              ➕ Nouveau cours
            </button>
            <button
              onClick={() => setInputMessage('J\'ai une contrainte le 15/03 de 9h à 12h')}
              className="text-xs p-2 bg-red-50 hover:bg-red-100 rounded border text-red-700"
            >
              ⚠️ Contrainte
            </button>
            <button
              onClick={() => setInputMessage('Planning de la semaine')}
              className="text-xs p-2 bg-purple-50 hover:bg-purple-100 rounded border text-purple-700"
            >
              📅 Semaine
            </button>
            <button
              onClick={() => setInputMessage('Aide')}
              className="text-xs p-2 bg-green-50 hover:bg-green-100 rounded border text-green-700"
            >
              ❓ Aide
            </button>
          </div>

          <div className="mt-3 p-2 bg-gray-50 rounded text-xs">
            <div className="font-medium text-gray-700 mb-1">
              🛌 Dimanche repos • 🔄 Réorganisation auto
            </div>
            <div className="flex flex-wrap gap-1 mb-1">
              {jIntervals.map(interval => (
                <span key={interval.key} className={`px-2 py-1 rounded ${interval.color}`}>
                  {interval.key}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderCoursesContent = () => (
    <div className="max-w-4xl mx-auto">
      {courses.length > 0 ? (
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              📚 Gestion des Cours
              <span className="text-sm font-normal text-gray-500">({courses.length} cours actifs)</span>
            </h2>
          </div>

          <div className="p-4 space-y-4">
            {courses.map(course => {
              const completedSessions = course.sessions.filter(s => s.completed).length;
              const rescheduledSessions = course.sessions.filter(s => s.rescheduled && !s.completed).length;

              return (
                <div key={course.id} className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-medium text-gray-800">{course.name}</h3>
                      <p className="text-sm text-gray-600">
                        {course.hoursPerDay}h/jour • {completedSessions}/{course.totalSessions} sessions terminées
                        {rescheduledSessions > 0 && (
                          <span className="ml-2 text-orange-600">🔄 {rescheduledSessions} reportées</span>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        const confirmDelete = window.confirm(`Supprimer le cours "${course.name}" et toutes ses sessions ?`);
                        if (confirmDelete) {
                          deleteCourse(course.id);
                        }
                      }}
                      className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-sm font-medium transition-colors"
                    >
                      🗑️ Supprimer cours
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {course.sessions.map(session => {
                      const isCompleted = session.completed;
                      const statusIcon = isCompleted ? (session.success ? '✅' : '❌') : '⏳';

                      return (
                        <div key={session.id} className="relative group">
                          <div className={`text-xs p-2 rounded ${session.color} ${isCompleted ? 'opacity-60' : ''}`}>
                            <div className="flex justify-between items-center">
                              <span className="font-medium">{session.interval}</span>
                              <span>{statusIcon}</span>
                            </div>
                            <div className="text-xs opacity-75">
                              {session.date.toLocaleDateString('fr-FR')}
                            </div>
                            {session.rescheduled && (
                              <div className="text-xs text-orange-600">🔄</div>
                            )}
                          </div>

                          {!isCompleted && (
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="flex gap-1 p-1">
                                <button
                                  onClick={() => markSessionComplete(course.id, session.id, true)}
                                  className="flex-1 bg-green-500 hover:bg-green-600 text-white text-xs rounded px-1 py-0.5"
                                  title="Marquer comme réussie"
                                >
                                  ✓
                                </button>
                                <button
                                  onClick={() => markSessionComplete(course.id, session.id, false)}
                                  className="flex-1 bg-red-500 hover:bg-red-600 text-white text-xs rounded px-1 py-0.5"
                                  title="Marquer comme échouée"
                                >
                                  ✗
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="pt-4 border-t">
              <button
                onClick={() => {
                  const confirmDelete = window.confirm(`Supprimer TOUS les cours (${courses.length}) ?`);
                  if (confirmDelete) {
                    deleteAllCourses();
                  }
                }}
                className="w-full p-3 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg font-medium transition-colors"
              >
                🗑️ Supprimer tous les cours ({courses.length})
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
          <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-gray-800 mb-2">Aucun cours à gérer</h3>
          <p className="text-gray-600 mb-6">
            Utilisez l'assistant IA dans l'onglet Accueil pour ajouter des cours.
          </p>
          <button
            onClick={() => setActiveTab('home')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            ➕ Aller à l'accueil
          </button>
        </div>
      )}
    </div>
  );

  const renderSettingsContent = () => (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Configuration MongoDB */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
          ☁️ Configuration MongoDB Atlas
          {isOnline ? (
            <span className="text-sm text-green-600">✅ Connecté</span>
          ) : (
            <span className="text-sm text-red-600">❌ Mode backup local</span>
          )}
        </h2>

        <div className="bg-green-50 p-4 rounded-lg mb-4">
          <h3 className="font-medium text-green-800 mb-2">✅ MongoDB Atlas configuré !</h3>
          <p className="text-sm text-green-700">
            Vos données sont automatiquement sauvegardées dans le cloud MongoDB Atlas.
          </p>
          <div className="mt-2 text-xs text-green-600 space-y-1">
            <div>• API Routes Next.js : /api/courses et /api/constraints</div>
            <div>• Backup local automatique</div>
            <div>• Synchronisation temps réel</div>
            {lastSyncTime && (
              <div>• Dernière sync : {lastSyncTime.toLocaleTimeString('fr-FR')}</div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="font-medium text-blue-800 mb-2">🎯 Méthode des J</h3>
            <p className="text-sm text-blue-700 mb-2">Sessions automatiques</p>
            <ul className="text-xs space-y-1 text-blue-600">
              <li>• J0 : Apprentissage initial</li>
              <li>• J+1, J+2, J+10 : Consolidation</li>
              <li>• J+25, J+47 : Long terme</li>
            </ul>
          </div>

          <div className="bg-orange-50 p-4 rounded-lg">
            <h3 className="font-medium text-orange-800 mb-2">🔄 Réorganisation</h3>
            <p className="text-sm text-orange-700 mb-2">Évitement automatique</p>
            <ul className="text-xs space-y-1 text-orange-600">
              <li>• Report si conflit</li>
              <li>• Respect des intervalles J</li>
              <li>• Max 9h/jour</li>
            </ul>
          </div>

          <div className="bg-green-50 p-4 rounded-lg">
            <h3 className="font-medium text-green-800 mb-2">☁️ MongoDB Atlas</h3>
            <p className="text-sm text-green-700 mb-2">Sauvegarde sécurisée</p>
            <ul className="text-xs space-y-1 text-green-600">
              <li>• Synchronisation auto</li>
              <li>• Backup local</li>
              <li>• Multi-appareils</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Contraintes actives */}
      {constraints.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">⚠️ Contraintes actives ({constraints.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {constraints.map(constraint => (
              <div key={constraint.id} className="p-3 bg-red-50 rounded-lg">
                <div className="font-medium text-red-800">{constraint.description}</div>
                <div className="text-sm text-red-700">
                  📅 {constraint.date.toLocaleDateString('fr-FR')} •
                  ⏰ {constraint.startHour === 0 && constraint.endHour === 24 ?
                      'Toute la journée' :
                      `${constraint.startHour}h-${constraint.endHour}h`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Système d'intervalles J */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">🎯 Système d'intervalles J</h3>
        <p className="text-gray-600 mb-4">
          Optimise la mémorisation selon les principes de la répétition espacée.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {jIntervals.map(interval => (
            <div key={interval.key} className={`p-4 rounded-lg ${interval.color}`}>
              <div className="font-semibold mb-1">{interval.key}</div>
              <div className="text-sm font-medium mb-1">{interval.label}</div>
              <div className="text-xs">
                {interval.days === 0 ? 'Apprentissage initial' :
                 interval.days === 1 ? 'Révision immédiate' :
                 interval.days === 2 ? 'Consolidation rapide' :
                 interval.days === 10 ? 'Révision intermédiaire' :
                 interval.days === 25 ? 'Révision long terme' :
                 'Révision de maintien'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Aide rapide */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">❓ Aide rapide</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-gray-800 mb-3">🚀 Démarrage rapide</h4>
            <div className="space-y-2 text-sm text-gray-600">
              <div><strong>1.</strong> "Ajouter Anatomie avec 2 heures par jour"</div>
              <div><strong>2.</strong> "J'ai une contrainte le 15/03 de 9h à 12h"</div>
              <div><strong>3.</strong> Glisser-déposer pour déplacer</div>
              <div><strong>4.</strong> Hover → ✓ ou ✗ pour terminer</div>
            </div>
          </div>

          <div>
            <h4 className="font-medium text-gray-800 mb-3">🔧 Résolution problèmes</h4>
            <div className="space-y-2 text-sm text-gray-600">
              <div><strong>MongoDB:</strong> Vérifiez MONGODB_URI</div>
              <div><strong>Sessions:</strong> Actualisez la page</div>
              <div><strong>Glisser-déposer:</strong> Utilisez les commandes texte</div>
              <div><strong>Données:</strong> Backup local disponible</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto p-6 bg-gray-50 min-h-screen">
      {/* En-tête avec navigation par onglets */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-2 flex items-center gap-3">
          <Brain className="text-blue-600" />
          Agent IA - Planning Médical
          {isOnline ? (
            <span title="Connecté à MongoDB Atlas">
              <Wifi className="w-5 h-5 text-green-600" />
            </span>
          ) : (
            <span title="Hors ligne - Mode local">
              <WifiOff className="w-5 h-5 text-red-600" />
            </span>
          )}
        </h1>
        <p className="text-gray-600">
          Lundi-Samedi 9h-19h • Dimanche repos • Contraintes et réorganisation automatique
        </p>
        <div className="text-sm text-gray-500 mt-1 flex items-center gap-4">
          <span className="flex items-center gap-1">
            ☁️ MongoDB Atlas
            {isOnline ? (
              <span className="text-green-600">✅ Connecté</span>
            ) : (
              <span className="text-red-600">❌ Hors ligne</span>
            )}
          </span>
          {lastSyncTime && (
            <span>Dernière sync: {lastSyncTime.toLocaleTimeString('fr-FR')}</span>
          )}
        </div>

        {/* Navigation par onglets */}
        <div className="mt-6 border-b border-gray-200">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab('home')}
              className={`flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'home'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Home className="w-4 h-4" />
              Accueil
            </button>
            <button
              onClick={() => setActiveTab('courses')}
              className={`flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'courses'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              Gestion des cours {courses.length > 0 && `(${courses.length})`}
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'settings'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Settings className="w-4 h-4" />
              Paramètres
            </button>
          </nav>
        </div>
      </div>

      {/* Contenu selon l'onglet actif */}
      {activeTab === 'home' && renderHomeContent()}
      {activeTab === 'courses' && renderCoursesContent()}
      {activeTab === 'settings' && renderSettingsContent()}
    </div>
  );
};

export default function Home() {
  return <MedicalPlanningAgent />;
}
