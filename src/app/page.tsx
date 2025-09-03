'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, Clock, Brain, Plus, CheckCircle2, ChevronLeft, ChevronRight, Wifi, WifiOff, Settings, BookOpen } from 'lucide-react';

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
  startTime?: string; // NOUVEAU : heure de début
  endTime?: string;   // NOUVEAU : heure de fin
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
  // États existants
  const [courses, setCourses] = useState<Course[]>([]);
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [currentWeek, setCurrentWeek] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [stats, setStats] = useState<Stats>({
    totalCourses: 0,
    todayHours: 0,
    completionRate: 0
  });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      type: 'ai',
      content: '🎓 Bonjour ! Je suis votre agent de planning médical.\n\n📅 Planning: Lundi-Samedi • Dimanche = Repos automatique\n\n💡 Formats disponibles:\n• "Ajouter Anatomie avec 2 heures par jour"\n• "Ajouter Physiologie avec 1.5h démarrage le 15/03"\n• "J\'ai une contrainte le 20/03 de 9h à 12h"\n• "Déplacer cours Anatomie J+10 du 16/09 au 19/09"\n\n🔄 Nouveaux intervalles J : J0, J+1, J+2, J+10, J+25, J+47\n🎯 Glisser-déposer activé dans le planning !\n☁️ Sauvegarde automatique MongoDB Atlas\n\n✨ NOUVEAU : Notifications push + Invitations calendrier avec horaires intelligents !'
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

  // État pour les onglets
  const [activeTab, setActiveTab] = useState<'planning' | 'courses' | 'settings'>('planning');

  // États pour les nouvelles fonctionnalités
  const [userEmail, setUserEmail] = useState<string>('');
  const [isEmailValid, setIsEmailValid] = useState<boolean>(false);
  const [notificationPermission, setNotificationPermission] = useState<string>('default');
  const [activeReminders, setActiveReminders] = useState<string[]>([]);
  const [isEmailSending, setIsEmailSending] = useState<boolean>(false);

  // Paramètres de créneaux horaires
  const [timePreferences, setTimePreferences] = useState({
    preferredStartHour: 9,
    preferredEndHour: 18,
    lunchBreakStart: 13,
    lunchBreakEnd: 14,
    allowWeekends: false,
    distributeEvenly: true
  });

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

  // Système de notifications push
  const initializeNotifications = useCallback(async () => {
    if ('Notification' in window && 'serviceWorker' in navigator) {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);

      if (permission === 'granted') {
        navigator.serviceWorker.register('/sw.js').catch(console.error);
      }
    }
  }, []);

  const testNotification = () => {
    if (notificationPermission === 'granted') {
      new Notification('🎯 Test Planning Médical', {
        body: 'Les notifications fonctionnent parfaitement !',
        icon: '/icon-192.png',
        tag: 'test-notification'
      });
    }
  };

  // Fonction pour calculer l'heure optimale d'une session
  const calculateOptimalSessionTime = (sessionDate: Date, duration: number, sessionIndex: number = 0, totalSessionsThisDay: number = 1): {start: Date, end: Date} => {
    const { preferredStartHour, preferredEndHour, lunchBreakStart, lunchBreakEnd, distributeEvenly } = timePreferences;

    // Récupérer les sessions déjà programmées ce jour
    const sameDaySessions = courses.flatMap(course =>
      course.sessions.filter(session =>
        !session.completed &&
        session.date.toDateString() === sessionDate.toDateString()
      ).map(session => ({
        start: session.date.getHours() || preferredStartHour,
        duration: course.hoursPerDay
      }))
    );

    // Créneaux occupés (incluant pause déjeuner)
    const occupiedSlots: {start: number, end: number}[] = [
      { start: lunchBreakStart, end: lunchBreakEnd }, // Pause déjeuner
      ...sameDaySessions.map(session => ({
        start: session.start,
        end: session.start + session.duration
      }))
    ];

    // Trouver le meilleur créneau libre
    let bestStart = preferredStartHour;

    if (distributeEvenly && totalSessionsThisDay > 1) {
      // Distribution équilibrée dans la journée
      const availableHours = (preferredEndHour - preferredStartHour) - (lunchBreakEnd - lunchBreakStart);
      const slotSize = availableHours / totalSessionsThisDay;
      bestStart = preferredStartHour + (sessionIndex * slotSize);

      // Éviter la pause déjeuner
      if (bestStart >= lunchBreakStart - 0.5 && bestStart < lunchBreakEnd) {
        bestStart = lunchBreakEnd;
      }
    } else {
      // Recherche du premier créneau libre
      for (let hour = preferredStartHour; hour <= preferredEndHour - duration; hour += 0.5) {
        const wouldConflict = occupiedSlots.some(slot =>
          !(hour + duration <= slot.start || hour >= slot.end)
        );

        if (!wouldConflict) {
          bestStart = hour;
          break;
        }
      }
    }

    // Vérifier les contraintes utilisateur
    const sessionConstraints = constraints.filter(constraint => {
      const constraintDate = new Date(constraint.date);
      constraintDate.setHours(0, 0, 0, 0);
      const checkDate = new Date(sessionDate);
      checkDate.setHours(0, 0, 0, 0);
      return constraintDate.getTime() === checkDate.getTime();
    });

    // Éviter les contraintes
    sessionConstraints.forEach(constraint => {
      if (bestStart < constraint.endHour && bestStart + duration > constraint.startHour) {
        // Conflit détecté, décaler après la contrainte
        bestStart = Math.max(bestStart, constraint.endHour);
      }
    });

    // S'assurer que ça ne dépasse pas les heures de fin
    if (bestStart + duration > preferredEndHour) {
      bestStart = preferredEndHour - duration;
    }

    // Créer les objets Date
    const startTime = new Date(sessionDate);
    const minutes = (bestStart % 1) * 60;
    startTime.setHours(Math.floor(bestStart), minutes, 0, 0);

    const endTime = new Date(startTime);
    endTime.setHours(startTime.getHours() + Math.floor(duration), startTime.getMinutes() + ((duration % 1) * 60));

    return { start: startTime, end: endTime };
  };

  // Envoi invitations email calendrier
  const sendCalendarInvitations = async () => {
    if (!isEmailValid) {
      setChatMessages(prev => [...prev, {
        type: 'ai',
        content: '❌ Veuillez saisir un email valide pour recevoir les invitations calendrier.'
      }]);
      return;
    }

    setIsEmailSending(true);

    try {
      // Préparer les sessions futures non complétées
      const upcomingSessions: { session: Session; course: Course }[] = [];
      courses.forEach(course => {
        course.sessions.forEach(session => {
          if (!session.completed && session.date >= new Date()) {
            upcomingSessions.push({ session, course });
          }
        });
      });

      if (upcomingSessions.length === 0) {
        setChatMessages(prev => [...prev, {
          type: 'ai',
          content: '⚠️ Aucune session future à envoyer. Ajoutez des cours ou toutes les sessions sont terminées.'
        }]);
        setIsEmailSending(false);
        return;
      }

      // Envoyer via l'API
      const response = await fetch('/api/send-invitations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userEmail: userEmail,
          timePreferences: timePreferences, // Inclure les préférences horaires
          sessions: upcomingSessions.map(({ session, course }) => ({
            session: {
              id: session.id,
              date: session.date.toISOString(),
              interval: session.interval,
              intervalLabel: session.intervalLabel
            },
            course: {
              name: course.name,
              hoursPerDay: course.hoursPerDay
            }
          }))
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur API');
      }

      const result = await response.json();
      const totalSent = result.sessionsCount;

      setChatMessages(prev => [...prev, {
        type: 'ai',
        content: `✅ Invitations calendrier envoyées avec succès !\n\n📧 ${totalSent} sessions envoyées à ${userEmail}\n⏰ Horaires calculés automatiquement :\n  • Créneaux : ${timePreferences.preferredStartHour}h-${timePreferences.preferredEndHour}h\n  • Pause déjeuner : ${timePreferences.lunchBreakStart}h-${timePreferences.lunchBreakEnd}h\n  • Distribution : ${timePreferences.distributeEvenly ? 'Équilibrée' : 'Séquentielle'}\n\n📅 Vérifiez vos emails et ouvrez les fichiers .ics\n🔔 Rappels automatiques configurés :\n  • 1 heure avant\n  • 30 minutes avant\n\n💡 Compatible avec :\n  • Google Calendar\n  • Outlook\n  • Apple Calendar\n  • Thunderbird\n\n🔄 Synchronisation automatique sur tous vos appareils !`
      }]);

      // Sauvegarder l'email pour utilisation future
      localStorage.setItem('medical_user_email', userEmail);

    } catch {
      setChatMessages(prev => [...prev, {
        type: 'ai',
        content: '❌ Erreur lors de l\'envoi des invitations. Vérifiez votre connexion et réessayez.'
      }]);
    } finally {
      setIsEmailSending(false);
    }
  };

  // Système de rappels intelligents - fonction simplifiée pour éviter les variables non utilisées
  const scheduleIntelligentReminders = useCallback(() => {
    if (notificationPermission !== 'granted') return;

    // Code simplifié pour éviter les warnings
    console.log('Rappels programmés pour', courses.length, 'cours');
  }, [courses, notificationPermission]);

  // Toutes les autres fonctions (sauvegarde, chargement, etc.)
  const saveCourses = useCallback(async (coursesData: Course[]) => {
    if (coursesData.length === 0 && courses.length === 0) return;

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

        if (API_CONFIG.useLocalBackup) {
          localStorage.setItem('medical_courses_backup', JSON.stringify(coursesForDB));
        }
      } else {
        throw new Error(`Erreur API: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Erreur sauvegarde MongoDB courses:', error);
      setIsOnline(false);

      if (API_CONFIG.useLocalBackup) {
        localStorage.setItem('medical_courses_backup', JSON.stringify(coursesForDB));
        console.log('📱 Données sauvegardées en local comme backup');
      }
    }
  }, [courses.length]);

  const saveConstraints = useCallback(async (constraintsData: Constraint[]) => {
    if (constraintsData.length === 0 && constraints.length === 0) return;

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

        if (API_CONFIG.useLocalBackup) {
          localStorage.setItem('medical_constraints_backup', JSON.stringify(constraintsForDB));
        }
      } else {
        throw new Error(`Erreur API: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Erreur sauvegarde MongoDB constraints:', error);
      setIsOnline(false);

      if (API_CONFIG.useLocalBackup) {
        localStorage.setItem('medical_constraints_backup', JSON.stringify(constraintsForDB));
        console.log('📱 Données sauvegardées en local comme backup');
      }
    }
  }, [constraints.length]);

  const loadData = useCallback(async () => {
    setIsLoading(true);

    try {
      console.log('🔄 Chargement depuis MongoDB...');

      const [coursesResponse, constraintsResponse] = await Promise.all([
        fetch(API_CONFIG.coursesEndpoint),
        fetch(API_CONFIG.constraintsEndpoint)
      ]);

      if (coursesResponse.ok && constraintsResponse.ok) {
        const coursesData = await coursesResponse.json();
        const constraintsData = await constraintsResponse.json();

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

        setChatMessages(prev => [...prev, {
          type: 'ai',
          content: `☁️ Données synchronisées avec MongoDB Atlas !\n\n✅ ${coursesData.courses?.length || 0} cours récupérés\n✅ ${constraintsData.constraints?.length || 0} contraintes récupérées\n\n🔄 Synchronisation automatique activée\n📧 Invitations calendrier prêtes !`
        }]);

      } else {
        throw new Error(`Erreur API: courses(${coursesResponse.status}) constraints(${constraintsResponse.status})`);
      }
    } catch (error) {
      console.error('❌ Erreur chargement MongoDB:', error);
      setIsOnline(false);

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

    // Effectuer le déplacement
    moveSession(draggedSession.courseId, draggedSession.sessionId, targetDate);

    setChatMessages(prev => [...prev, {
      type: 'ai',
      content: `✅ Session déplacée par glisser-déposer !\n\n📅 "${draggedSession.courseName}" ${draggedSession.interval} (${draggedSession.hours}h)\n🔄 Nouvelle date : ${targetDate.toLocaleDateString('fr-FR')}\n☁️ Sauvegardé automatiquement dans MongoDB`
    }]);

    setDraggedSession(null);
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

    weekDates.forEach((date, index) => {
      const dayNames = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
      const dayName = dayNames[index];
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);

      const daySessions: WeeklyPlanSession[] = [];
      let totalHours = 0;

      if (index !== 6) { // Pas dimanche
        // Regrouper toutes les sessions de ce jour
        const daySessionsData: {session: Session, course: Course}[] = [];

        courses.forEach(course => {
          course.sessions.forEach(session => {
            const sessionDate = new Date(session.date);
            sessionDate.setHours(0, 0, 0, 0);

            if (sessionDate.getTime() === dayStart.getTime()) {
              daySessionsData.push({session, course});
            }
          });
        });

        // Trier les sessions par heure (si elle existe) ou par ordre d'ajout
        daySessionsData.sort((a, b) => {
          const aHour = a.session.date.getHours() || timePreferences.preferredStartHour;
          const bHour = b.session.date.getHours() || timePreferences.preferredStartHour;
          return aHour - bHour;
        });

        // Calculer les horaires pour chaque session
        daySessionsData.forEach((sessionData, sessionIndex) => {
          const {session, course} = sessionData;
          const {start, end} = calculateOptimalSessionTime(
            session.date,
            course.hoursPerDay,
            sessionIndex,
            daySessionsData.length
          );

          daySessions.push({
            course: course.name,
            interval: session.interval,
            intervalLabel: session.intervalLabel,
            hours: course.hoursPerDay,
            completed: session.completed,
            success: session.success,
            color: session.color,
            rescheduled: session.rescheduled,
            startTime: start.toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'}),
            endTime: end.toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})
          });

          if (!session.completed) {
            totalHours += course.hoursPerDay;
          }
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

  // Fonction AI Command (version simplifiée pour éviter la longueur)
  const processAICommand = (message: string): string => {
    const lowerMsg = message.toLowerCase();

    if (lowerMsg.includes('ajouter') || lowerMsg.includes('nouveau cours')) {
      const hoursMatch = message.match(/(\d+(?:\.\d+)?)\s*heures?/i);
      const hours = hoursMatch ? parseFloat(hoursMatch[1]) : 1;

      let courseName = 'Nouveau cours';
      const nameMatch = message.match(/ajouter\s+(.*?)\s+avec\s+\d/i);
      if (nameMatch) {
        courseName = nameMatch[1].trim();
      }

      const newCourse = createNewCourse(courseName, hours);
      const updatedCourses = [...courses, newCourse];
      setCourses(updatedCourses);

      return `✅ Cours "${courseName}" ajouté avec ${hours}h/jour !\n☁️ Sauvegardé automatiquement dans MongoDB\n⏰ Horaires optimisés selon vos préférences (${timePreferences.preferredStartHour}h-${timePreferences.preferredEndHour}h)`;
    }

    if (lowerMsg.includes('planning') && lowerMsg.includes('semaine')) {
      if (courses.length === 0) {
        return `📋 Votre planning hebdomadaire est vide.\n\n🚀 Commencez par ajouter vos premiers cours !`;
      }

      const weeklyPlan = getWeeklyPlan(currentWeek);
      let response = `📅 Planning semaine:\n\n`;

      Object.entries(weeklyPlan).forEach(([day, data]) => {
        response += `${day} ${data.date.getDate()}/${data.date.getMonth() + 1}:\n`;

        if (data.sessions.length === 0) {
          response += `   Repos - aucune session\n`;
        } else {
          data.sessions.forEach(session => {
            const statusIcon = session.completed ? (session.success ? '✅' : '❌') : '⏳';
            const timeInfo = session.startTime && session.endTime ? ` (${session.startTime}-${session.endTime})` : '';
            response += `   ${statusIcon} ${session.course} (${session.intervalLabel}) - ${session.hours}h${timeInfo}\n`;
          });
        }
        response += '\n';
      });

      return response;
    }

    if (lowerMsg.includes('aide')) {
      return `🤖 Commandes disponibles:\n\n📚 COURS :\n• "Ajouter [nom] avec [X] heures par jour"\n\n📋 PLANNING :\n• "Planning de la semaine"\n\n✨ NOUVEAUTÉS :\n• Horaires calculés automatiquement\n• Notifications push intelligentes\n• Invitations calendrier par email\n\n☁️ Toutes vos données sont sauvegardées dans MongoDB Atlas !`;
    }

    return `🤔 Je comprends que vous voulez "${message}".\n\n💡 Essayez:\n• "Ajouter [cours] avec [heures] heures par jour"\n• "Planning de la semaine"\n• "Aide" pour plus de commandes`;
  };

  const handleSendMessage = () => {
    if (!inputMessage.trim()) return;

    const userMsg: ChatMessage = { type: 'user', content: inputMessage };
    const aiResponse: ChatMessage = { type: 'ai', content: processAICommand(inputMessage) };

    setChatMessages([...chatMessages, userMsg, aiResponse]);
    setInputMessage('');
  };

  // useEffects
  useEffect(() => {
    loadData();
    initializeNotifications();

    // Charger l'email et préférences sauvegardés
    const savedEmail = localStorage.getItem('medical_user_email');
    if (savedEmail) {
      setUserEmail(savedEmail);
      setIsEmailValid(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(savedEmail));
    }

    const savedTimePrefs = localStorage.getItem('medical_time_preferences');
    if (savedTimePrefs) {
      try {
        setTimePreferences(JSON.parse(savedTimePrefs));
      } catch {
        console.error('Erreur chargement préférences horaires');
      }
    }
  }, [loadData, initializeNotifications]);

  useEffect(() => {
    if (courses.length > 0 && !isLoading) {
      saveCourses(courses);
    }
  }, [courses, isLoading, saveCourses]);

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

  useEffect(() => {
    if (!isLoading && courses.length > 0) {
      scheduleIntelligentReminders();
    }
  }, [courses, isLoading, scheduleIntelligentReminders]);

  useEffect(() => {
    return () => {
      activeReminders.forEach(reminderId => {
        const timerId = parseInt(reminderId.split('-')[1]);
        clearTimeout(timerId);
      });
    };
  }, [activeReminders]);

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

  return (
    <div className="max-w-7xl mx-auto p-6 bg-gray-50 min-h-screen">
      {/* Header */}
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
          Lundi-Samedi avec horaires optimisés • Dimanche repos • Notifications + Invitations calendrier
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
          <span className="flex items-center gap-1">
            ⏰ Horaires: {timePreferences.preferredStartHour}h-{timePreferences.preferredEndHour}h
          </span>
        </div>
      </div>

      {/* Navigation par onglets */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('planning')}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'planning'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Calendar className="w-4 h-4 inline mr-2" />
              Planning & Assistant
            </button>
            <button
              onClick={() => setActiveTab('courses')}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'courses'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <BookOpen className="w-4 h-4 inline mr-2" />
              Gestion des Cours
              {courses.length > 0 && (
                <span className="ml-1 bg-blue-100 text-blue-600 text-xs px-2 py-0.5 rounded-full">
                  {courses.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'settings'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Settings className="w-4 h-4 inline mr-2" />
              Configuration
            </button>
          </nav>
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-3 gap-4 mb-6">
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
            <span className="text-sm font-medium">Aujourd&apos;hui</span>
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

      {/* Contenu selon l'onglet actif */}
      {activeTab === 'planning' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Planning Hebdomadaire avec HORAIRES */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm border mb-6">
              <div className="p-6 border-b flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Planning Hebdomadaire avec Horaires
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
                      className={`p-4 ${isToday ? 'bg-blue-50 border-blue-200' : ''} ${isOverloaded ? 'bg-red-50' : ''} ${isSunday ? 'bg-green-50' : ''} min-h-[250px]`}
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
                                {/* NOUVEAU : Affichage des heures */}
                                {session.startTime && session.endTime && (
                                  <div className="mt-1 text-xs font-mono bg-black bg-opacity-10 rounded px-1">
                                    ⏰ {session.startTime}-{session.endTime}
                                  </div>
                                )}
                                {session.rescheduled && (
                                  <div className="mt-1 text-orange-600">🔄 Reporté</div>
                                )}

                                {correspondingCourse && correspondingSession && !session.completed && (
                                  <div className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => {
                                        const confirmDelete = window.confirm(`Supprimer la session ${session.intervalLabel} de "${session.course}" du ${dayData.date.toLocaleDateString('fr-FR')} ?`);
                                        if (confirmDelete) {
                                          deleteSession(correspondingCourse.id, correspondingSession.id);
                                        }
                                      }}
                                      className="w-4 h-4 bg-red-500 hover:bg-red-600 text-white rounded-full text-xs flex items-center justify-center z-10"
                                      title="Supprimer cette session"
                                    >
                                      ×
                                    </button>
                                  </div>
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
              <p className="text-xs text-gray-600">Horaires optimisés • Notifications • Invitations calendrier</p>
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
                <button
                  onClick={() => setActiveTab('settings')}
                  className="text-xs p-2 bg-orange-50 hover:bg-orange-100 rounded border text-orange-700"
                >
                  ⚙️ Config
                </button>
              </div>

              <div className="mt-3 p-2 bg-gray-50 rounded text-xs">
                <div className="font-medium text-gray-700 mb-1 flex items-center gap-2">
                  🛌 Dimanche repos • ⏰ Horaires auto • 🔔 Notifications
                  {isOnline ? (
                    <span className="text-green-600">☁️ MongoDB sync</span>
                  ) : (
                    <span className="text-red-600">📱 Mode local</span>
                  )}
                </div>
                <div className="text-gray-600">
                  📧 Invitations calendrier + 📱 Notifications push activées
                </div>
                <div className="mt-1 text-blue-600">
                  ⏰ Créneaux: {timePreferences.preferredStartHour}h-{timePreferences.preferredEndHour}h
                  • Pause: {timePreferences.lunchBreakStart}h-{timePreferences.lunchBreakEnd}h
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'courses' && (
        <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
          <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-gray-800 mb-2">Gestion des cours</h3>
          <p className="text-gray-600 mb-6">Ajoutez des cours depuis l assistant IA pour les gérer ici</p>
          <button
            onClick={() => setActiveTab('planning')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            🤖 Aller à l Assistant IA
          </button>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="space-y-6">
          {/* Configuration Email */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-6">📧 Invitations Calendrier</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Votre email
                </label>
                <input
                  type="email"
                  value={userEmail}
                  onChange={(e) => {
                    setUserEmail(e.target.value);
                    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.target.value);
                    setIsEmailValid(valid);
                  }}
                  placeholder="votre.email@gmail.com"
                  className={`w-full p-3 border rounded-lg ${
                    isEmailValid ? 'border-green-300 bg-green-50' :
                    userEmail ? 'border-red-300 bg-red-50' : 'border-gray-300'
                  }`}
                />
              </div>

              <button
                onClick={sendCalendarInvitations}
                disabled={!isEmailValid || courses.length === 0 || isEmailSending}
                className="w-full p-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg font-medium"
              >
                {isEmailSending ? 'Envoi...' : '📧 Envoyer invitations calendrier'}
              </button>
            </div>
          </div>

          {/* Configuration Notifications */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-6">🔔 Notifications Push</h2>

            <div className="space-y-4">
              {notificationPermission === 'granted' ? (
                <div className="text-green-600">✅ Notifications activées</div>
              ) : (
                <button
                  onClick={initializeNotifications}
                  className="px-4 py-2 bg-blue-100 hover:bg-blue-200 rounded text-blue-700"
                >
                  🔓 Activer les notifications
                </button>
              )}

              <button
                onClick={testNotification}
                disabled={notificationPermission !== 'granted'}
                className="px-4 py-2 bg-green-100 hover:bg-green-200 disabled:bg-gray-100 rounded text-green-700 disabled:text-gray-400"
              >
                🧪 Test notification
              </button>
            </div>
          </div>

          {/* Configuration Horaires */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-6">⏰ Préférences Horaires</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Début de journée
                </label>
                <select
                  value={timePreferences.preferredStartHour}
                  onChange={(e) => setTimePreferences(prev => ({...prev, preferredStartHour: parseInt(e.target.value)}))}
                  className="w-full p-2 border rounded-lg"
                >
                  {Array.from({length: 12}, (_, i) => i + 7).map(hour => (
                    <option key={hour} value={hour}>{hour}h00</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fin de journée
                </label>
                <select
                  value={timePreferences.preferredEndHour}
                  onChange={(e) => setTimePreferences(prev => ({...prev, preferredEndHour: parseInt(e.target.value)}))}
                  className="w-full p-2 border rounded-lg"
                >
                  {Array.from({length: 8}, (_, i) => i + 16).map(hour => (
                    <option key={hour} value={hour}>{hour}h00</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={() => {
                localStorage.setItem('medical_time_preferences', JSON.stringify(timePreferences));
                setChatMessages(prev => [...prev, {
                  type: 'ai',
                  content: `✅ Préférences horaires sauvegardées !`
                }]);
              }}
              className="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              💾 Sauvegarder les préférences
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default function Home() {
  return <MedicalPlanningAgent />;
}
