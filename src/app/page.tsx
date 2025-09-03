'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, Clock, Brain, Plus, CheckCircle2, ChevronLeft, ChevronRight, Wifi, WifiOff, Settings, BookOpen } from 'lucide-react';

// Configuration API MongoDB
const API_CONFIG = {
  coursesEndpoint: '/api/courses',
  constraintsEndpoint: '/api/constraints',
  useLocalBackup: true // Garde localStorage comme backup
};

// Interfaces TypeScript (identiques à l'original)
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
  // États existants (identiques)
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

  // Nouvel état pour les onglets
  const [activeTab, setActiveTab] = useState<'planning' | 'courses' | 'settings'>('planning');

  // États pour les nouvelles fonctionnalités
  const [userEmail, setUserEmail] = useState<string>('');
  const [isEmailValid, setIsEmailValid] = useState<boolean>(false);
  const [notificationPermission, setNotificationPermission] = useState<string>('default');
  const [reminderSettings, setReminderSettings] = useState({
    beforeDay: true,
    morningOf: true,
    thirtyMinBefore: true,
    weeklyDigest: true
  });
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

  // Toutes les fonctions existantes (identiques à l'original)
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

  // ===== NOUVELLES FONCTIONNALITÉS =====

  // Système de notifications push
  const initializeNotifications = useCallback(async () => {
    if ('Notification' in window && 'serviceWorker' in navigator) {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);

      if (permission === 'granted') {
        // Enregistrer le service worker
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

  // Génération fichiers .ics pour email (version améliorée)
  const generateICSContent = (session: Session, course: Course, userEmail: string): string => {
    const { start: startTime, end: endTime } = calculateOptimalSessionTime(session.date, course.hoursPerDay);

    const formatDate = (date: Date) =>
      date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Planning Médical//FR
METHOD:REQUEST
BEGIN:VEVENT
UID:${session.id}@medical-planner.com
DTSTAMP:${formatDate(new Date())}
DTSTART:${formatDate(startTime)}
DTEND:${formatDate(endTime)}
SUMMARY:📚 ${course.name} (${session.intervalLabel})
DESCRIPTION:Session de révision - Méthode des J\\n\\nDurée: ${course.hoursPerDay}h\\nIntervalle: ${session.intervalLabel}\\n\\nHoraire optimisé selon vos préférences\\n\\nGénéré par Planning Médical IA
LOCATION:Bureau/Bibliothèque
ORGANIZER:MAILTO:planning@medical-ia.com
ATTENDEE:MAILTO:${userEmail}
STATUS:CONFIRMED
SEQUENCE:0
BEGIN:VALARM
TRIGGER:-PT30M
ACTION:DISPLAY
DESCRIPTION:Session dans 30 minutes
END:VALARM
BEGIN:VALARM
TRIGGER:-PT1H
ACTION:EMAIL
DESCRIPTION:Session dans 1 heure
ATTENDEE:MAILTO:${userEmail}
END:VALARM
END:VEVENT
END:VCALENDAR`;
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
      const upcomingSessions = [];
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

    } catch (error) {
      setChatMessages(prev => [...prev, {
        type: 'ai',
        content: '❌ Erreur lors de l\'envoi des invitations. Vérifiez votre connexion et réessayez.'
      }]);
    } finally {
      setIsEmailSending(false);
    }
  };

  // Système de rappels intelligents
  const scheduleIntelligentReminders = useCallback(() => {
    if (notificationPermission !== 'granted') return;

    // Nettoyer les anciens rappels
    activeReminders.forEach(reminderId => {
      const timerId = parseInt(reminderId.split('-')[1]);
      clearTimeout(timerId);
    });
    setActiveReminders([]);

    const newReminders: string[] = [];

    courses.forEach(course => {
      course.sessions.forEach(session => {
        if (!session.completed && session.date >= new Date()) {
          const sessionDate = new Date(session.date);
          const now = Date.now();

          // Rappel la veille à 20h (si activé)
          if (reminderSettings.beforeDay) {
            const reminderBefore = new Date(sessionDate);
            reminderBefore.setDate(sessionDate.getDate() - 1);
            reminderBefore.setHours(20, 0, 0, 0);

            const delayBefore = reminderBefore.getTime() - now;
            if (delayBefore > 0 && delayBefore < 7 * 24 * 3600 * 1000) {
              const timerId = window.setTimeout(() => {
                new Notification('📅 Planning Médical - Demain', {
                  body: `${course.name} (${session.intervalLabel}) - ${course.hoursPerDay}h`,
                  icon: '/icon-192.png',
                  tag: `reminder-before-${session.id}`,
                  requireInteraction: true
                });
              }, delayBefore);

              newReminders.push(`before-${timerId}`);
            }
          }

          // Rappel le matin à 8h (si activé)
          if (reminderSettings.morningOf) {
            const reminderMorning = new Date(sessionDate);
            reminderMorning.setHours(8, 0, 0, 0);

            const delayMorning = reminderMorning.getTime() - now;
            if (delayMorning > 0 && delayMorning < 7 * 24 * 3600 * 1000) {
              const timerId = window.setTimeout(() => {
                new Notification('🌅 Planning Médical - Aujourd\'hui', {
                  body: `${course.name} (${session.intervalLabel}) - ${course.hoursPerDay}h`,
                  icon: '/icon-192.png',
                  tag: `reminder-morning-${session.id}`,
                  requireInteraction: true
                });
              }, delayMorning);

              newReminders.push(`morning-${timerId}`);
            }
          }

          // Rappel 30min avant (si activé et session dans les 24h)
          if (reminderSettings.thirtyMinBefore) {
            const reminder30min = new Date(sessionDate);
            reminder30min.setHours(sessionDate.getHours() - 0.5);

            const delay30min = reminder30min.getTime() - now;
            if (delay30min > 0 && delay30min < 24 * 3600 * 1000) {
              const timerId = window.setTimeout(() => {
                new Notification('⏰ Planning Médical - Dans 30 minutes', {
                  body: `${course.name} (${session.intervalLabel}) commence bientôt !`,
                  icon: '/icon-192.png',
                  tag: `reminder-30min-${session.id}`,
                  requireInteraction: true,
                  actions: [
                    { action: 'mark-done', title: '✅ Fait' },
                    { action: 'reschedule', title: '🔄 Reporter' }
                  ]
                });
              }, delay30min);

              newReminders.push(`30min-${timerId}`);
            }
          }
        }
      });
    });

    setActiveReminders(newReminders);
  }, [courses, notificationPermission, reminderSettings, activeReminders]);

  // Notifications pour sessions du jour
  const scheduleTodayNotifications = useCallback(() => {
    if (notificationPermission !== 'granted') return;

    const todaySessions = getTodaySessions();
    const now = new Date();
    now.setHours(8, 0, 0, 0); // 8h ce matin

    if (todaySessions.length > 0) {
      const totalHours = todaySessions.reduce((sum, s) => sum + s.hours, 0);

      // Notification matinale si pas encore passée
      if (now.getTime() > Date.now()) {
        setTimeout(() => {
          new Notification('🌅 Planning Médical - Sessions du jour', {
            body: `${todaySessions.length} session(s) programmée(s) - ${totalHours}h total`,
            icon: '/icon-192.png',
            tag: 'daily-summary',
            requireInteraction: true
          });
        }, now.getTime() - Date.now());
      }
    }
  }, [getTodaySessions, notificationPermission]);

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

  // Fonction AI Command (identique)
  const processAICommand = (message: string): string => {
    const lowerMsg = message.toLowerCase();

    if (lowerMsg.includes('déplacer') || lowerMsg.includes('deplacer') || lowerMsg.includes('déplacer cours')) {
      const movePattern = /déplacer\s+(?:cours\s+)?([^J]+?)\s+(j\+?\d+)\s+du\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+au\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i;
      const altMovePattern = /deplacer\s+(?:cours\s+)?([^J]+?)\s+(j\+?\d+)\s+du\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+au\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i;

      const match = message.match(movePattern) || message.match(altMovePattern);

      if (match) {
        const courseName = match[1].trim();
        const sessionInterval = match[2].toUpperCase().replace('+', '+');
        const fromDateStr = match[3];
        const toDateStr = match[4];

        const parseDate = (dateStr: string): Date => {
          const parts = dateStr.split('/');
          const day = parseInt(parts[0]);
          const month = parseInt(parts[1]) - 1;
          const year = parts[2] ? parseInt(parts[2]) : new Date().getFullYear();
          return new Date(year, month, day);
        };

        const fromDate = parseDate(fromDateStr);
        const toDate = parseDate(toDateStr);

        const course = courses.find(c => c.name.toLowerCase().includes(courseName.toLowerCase()));
        if (!course) {
          return `❌ Cours "${courseName}" non trouvé.\n\n📚 Cours disponibles : ${courses.map(c => c.name).join(', ')}`;
        }

        const session = course.sessions.find(s =>
          s.interval === sessionInterval &&
          s.date.toDateString() === fromDate.toDateString()
        );

        if (!session) {
          return `❌ Session ${sessionInterval} du cours "${course.name}" non trouvée le ${fromDate.toLocaleDateString('fr-FR')}.\n\n📋 Sessions disponibles pour ce cours :\n${course.sessions.map(s => `• ${s.interval} le ${s.date.toLocaleDateString('fr-FR')}`).join('\n')}`;
        }

        if (session.completed) {
          return `⚠️ Impossible de déplacer une session déjà terminée.\n\nSession ${sessionInterval} de "${course.name}" déjà ${session.success ? 'réussie ✅' : 'échouée ❌'}.`;
        }

        if (hasConflict(toDate, course.hoursPerDay)) {
          return `❌ Conflit détecté le ${toDate.toLocaleDateString('fr-FR')} !\n\n⚠️ Une contrainte empêche ce déplacement.\n💡 Choisissez une autre date ou vérifiez vos contraintes avec "Mes contraintes".`;
        }

        if (toDate.getDay() === 0) {
          const mondayDate = new Date(toDate);
          mondayDate.setDate(toDate.getDate() + 1);
          return `❌ Impossible de programmer le dimanche !\n\n🛌 Dimanche = repos automatique.\n💡 La session serait automatiquement décalée au lundi ${mondayDate.toLocaleDateString('fr-FR')}.`;
        }

        moveSession(course.id, session.id, toDate);

        // Calculer l'heure optimale pour le message de confirmation
        const {start, end} = calculateOptimalSessionTime(toDate, course.hoursPerDay);
        const timeRange = `${start.toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})}-${end.toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})}`;

        return `✅ Session déplacée avec succès !\n\n📅 "${course.name}" ${sessionInterval} (${course.hoursPerDay}h)\n🔄 Du ${fromDate.toLocaleDateString('fr-FR')} → ${toDate.toLocaleDateString('fr-FR')}\n⏰ Horaire optimisé : ${timeRange}\n☁️ Sauvegardé automatiquement dans MongoDB\n\n💡 Consultez votre planning mis à jour avec "Planning de la semaine"`;
      }

      return `❓ Format de déplacement non reconnu.\n\n💡 Utilisez :\n• "Déplacer cours [nom] [J+X] du [DD/MM] au [DD/MM]"\n• Exemple : "Déplacer cours Anatomie J+10 du 16/09 au 19/09"`;
    }

    if (lowerMsg.includes('supprimer') || lowerMsg.includes('effacer') || lowerMsg.includes('retirer')) {
      if (lowerMsg.includes('tous') && (lowerMsg.includes('cours') || lowerMsg.includes('tout'))) {
        if (courses.length === 0) {
          return `❌ Aucun cours à supprimer.\n\n💡 Ajoutez d'abord des cours avec "Ajouter [nom] avec [X] heures par jour"`;
        }

        const courseCount = courses.length;
        deleteAllCourses();
        return `🗑️ Tous les cours supprimés avec succès !\n\n📊 ${courseCount} cours et toutes leurs sessions ont été effacés.\n☁️ Sauvegardé automatiquement dans MongoDB\n\n💡 Vous pouvez ajouter de nouveaux cours quand vous voulez !`;
      }

      const courseMatch = message.match(/supprimer\s+(?:le\s+cours\s+)?([^,.\n]+?)(?:\s+|$)/i);
      if (courseMatch) {
        const courseName = courseMatch[1].trim().toLowerCase();
        const courseToDelete = courses.find(course => course.name.toLowerCase().includes(courseName));

        if (courseToDelete) {
          const sessionCount = courseToDelete.sessions.length;
          deleteCourse(courseToDelete.id);

          if (courses.length > 1) {
            const remainingCourses = courses.filter(c => c.id !== courseToDelete.id);
            const rebalanced = rebalanceSessions(remainingCourses);
            setCourses(rebalanced);
            saveCourses(rebalanced);
          }

          return `🗑️ Cours "${courseToDelete.name}" supprimé !\n\n📊 ${sessionCount} sessions supprimées\n• Planning automatiquement réorganisé\n☁️ Sauvegardé automatiquement dans MongoDB\n\n💡 ${courses.length - 1} cours restant(s)`;
        } else {
          const availableCourses = courses.map(c => c.name).join(', ');
          return `❌ Cours "${courseName}" non trouvé.\n\n📚 Cours disponibles : ${availableCourses || 'Aucun'}\n\n💡 Utilisez le nom exact du cours.`;
        }
      }

      const sessionMatch = message.match(/supprimer\s+(?:session\s+)?(j\+?\d+)\s+(?:de\s+|du\s+cours\s+)?([^,.\n]+)/i);
      if (sessionMatch) {
        const jInterval = sessionMatch[1].toUpperCase().replace('+', '+');
        const courseName = sessionMatch[2].trim().toLowerCase();

        const course = courses.find(c => c.name.toLowerCase().includes(courseName));
        if (!course) {
          return `❌ Cours "${courseName}" non trouvé.\n\n📚 Cours disponibles : ${courses.map(c => c.name).join(', ')}`;
        }

        const session = course.sessions.find(s => s.interval === jInterval);
        if (!session) {
          return `❌ Session ${jInterval} non trouvée pour "${course.name}".\n\n📋 Sessions disponibles : ${course.sessions.map(s => s.interval).join(', ')}`;
        }

        if (session.completed) {
          return `⚠️ Session ${jInterval} de "${course.name}" déjà terminée.\n\n💡 Impossible de supprimer une session complétée.`;
        }

        deleteSession(course.id, session.id);

        return `🗑️ Session ${jInterval} supprimée !\n\n📅 Session du ${session.date.toLocaleDateString('fr-FR')} retirée du planning\n• Cours "${course.name}" : ${course.sessions.length - 1} sessions restantes\n☁️ Sauvegardé automatiquement dans MongoDB\n\n🔄 Planning automatiquement mis à jour`;
      }

      return `❓ Commande de suppression non reconnue.\n\n💡 Essayez :\n• "Supprimer tous les cours"\n• "Supprimer le cours Anatomie"\n• "Supprimer session J+7 de Physiologie"`;
    }

    if (lowerMsg.includes('contrainte') || lowerMsg.includes('empêche') || lowerMsg.includes('rendez-vous') || lowerMsg.includes('rdv') || lowerMsg.includes('occupation')) {
      let constraintDate = new Date();
      const datePatterns = [
        /(?:le\s*)?(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/,
        /(?:le\s*)?(\d{1,2})\s*(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)/i
      ];

      for (const pattern of datePatterns) {
        const match = message.match(pattern);
        if (match) {
          if (match[2] && !isNaN(match[2] as unknown as number)) {
            const day = parseInt(match[1]);
            const month = parseInt(match[2]) - 1;
            const year = match[3] ? parseInt(match[3]) : new Date().getFullYear();
            constraintDate = new Date(year, month, day);
          } else if (match[2]) {
            const day = parseInt(match[1]);
            const monthNames = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
            const month = monthNames.indexOf(match[2].toLowerCase());
            if (month !== -1) {
              constraintDate = new Date(new Date().getFullYear(), month, day);
            }
          }
          break;
        }
      }

      let startHour = 0;
      let endHour = 24;

      const timePatterns = [
        /(?:de\s*)?(\d{1,2})h?\s*(?:à |jusqu'à |-)\s*(\d{1,2})h?/,
        /(?:entre\s*)?(\d{1,2})h?\s*et\s*(\d{1,2})h?/,
        /(?:à \s*)?(\d{1,2})h(?:\d{2})?/
      ];

      for (const pattern of timePatterns) {
        const match = message.match(pattern);
        if (match) {
          if (match[2]) {
            startHour = parseInt(match[1]);
            endHour = parseInt(match[2]);
          } else {
            startHour = parseInt(match[1]);
            endHour = startHour + 1;
          }
          break;
        }
      }

      if (lowerMsg.includes('toute la journée') || lowerMsg.includes('journée complète') || lowerMsg.includes('toute la matinée')) {
        startHour = 0;
        endHour = 24;
      }

      let description = 'Contrainte personnelle';
      if (lowerMsg.includes('rendez-vous') || lowerMsg.includes('rdv')) {
        description = 'Rendez-vous';
      } else if (lowerMsg.includes('médical')) {
        description = 'Rendez-vous médical';
      } else if (lowerMsg.includes('formation')) {
        description = 'Formation';
      } else if (lowerMsg.includes('voyage') || lowerMsg.includes('déplacement')) {
        description = 'Voyage/Déplacement';
      }

      const newConstraint = createConstraint(constraintDate, startHour, endHour, description);
      const updatedConstraints = [...constraints, newConstraint];
      setConstraints(updatedConstraints);

      if (courses.length > 0) {
        const rebalanced = rebalanceSessions(courses);
        setCourses(rebalanced);

        let affectedSessions = 0;
        rebalanced.forEach(course => {
          course.sessions.forEach(session => {
            if (session.rescheduled) affectedSessions++;
          });
        });

        return `⚠️ Contrainte ajoutée avec succès !\n\n📅 ${description} le ${constraintDate.toLocaleDateString('fr-FR')} de ${startHour}h à ${endHour}h\n☁️ Sauvegardé automatiquement dans MongoDB\n\n🔄 Réorganisation automatique effectuée :\n• ${affectedSessions} session(s) de cours reportée(s)\n• Toutes les sessions en conflit ont été décalées\n• Les règles de planning sont respectées (Lundi-Samedi, max 9h/jour)\n⏰ Horaires recalculés automatiquement\n\n💡 Consultez votre planning mis à jour avec "Planning de la semaine"`;
      }

      return `⚠️ Contrainte ajoutée avec succès !\n\n📅 ${description} le ${constraintDate.toLocaleDateString('fr-FR')} de ${startHour}h à ${endHour}h\n☁️ Sauvegardé automatiquement dans MongoDB\n\n💡 Ajoutez des cours et ils seront automatiquement programmés en évitant cette période !`;
    }

    if (lowerMsg.includes('ajouter') || lowerMsg.includes('nouveau cours')) {
      const hoursMatch = message.match(/(\d+(?:\.\d+)?)\s*heures?/i);
      const hours = hoursMatch ? parseFloat(hoursMatch[1]) : 1;

      let startDate = new Date();
      const datePatterns = [
        /(?:démarrage|début|commencer|partir)\s*(?:le\s*)?(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/i,
        /(?:démarrage|début|commencer|partir)\s*(?:le\s*)?(\d{1,2})\s*(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)/i,
        /(?:à \s*partir\s*du|depuis\s*le)\s*(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/i
      ];

      for (const pattern of datePatterns) {
        const match = message.match(pattern);
        if (match) {
          if (match[2] && !isNaN(match[2] as unknown as number)) {
            const day = parseInt(match[1]);
            const month = parseInt(match[2]) - 1;
            const year = match[3] ? parseInt(match[3]) : new Date().getFullYear();
            startDate = new Date(year, month, day);
          } else if (match[2]) {
            const day = parseInt(match[1]);
            const monthNames = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
            const month = monthNames.indexOf(match[2].toLowerCase());
            if (month !== -1) {
              startDate = new Date(new Date().getFullYear(), month, day);
            }
          }
          break;
        }
      }

      let courseName = 'Nouveau cours';
      const nameMatch = message.match(/ajouter\s+(.*?)\s+avec\s+\d/i);
      if (nameMatch) {
        courseName = nameMatch[1].trim();
        courseName = courseName.replace(/(?:démarrage|début|commencer|partir|à \s*partir\s*du|depuis\s*le).*$/i, '').trim();
      } else {
        const subjectPatterns = [
          /(anatomie[^,.\n]*)/i,
          /(physiologie[^,.\n]*)/i,
          /(pharmacologie[^,.\n]*)/i,
          /(pathologie[^,.\n]*)/i,
          /(histologie[^,.\n]*)/i,
          /(biochimie[^,.\n]*)/i
        ];

        for (const pattern of subjectPatterns) {
          const match = message.match(pattern);
          if (match) {
            courseName = match[1].charAt(0).toUpperCase() + match[1].slice(1);
            break;
          }
        }
      }

      const newCourse = createNewCourse(courseName, hours, startDate);
      const updatedCourses = [...courses, newCourse];

      const rebalanced = rebalanceSessions(updatedCourses);
      setCourses(rebalanced);

      let rescheduledCount = 0;
      let constraintAffected = false;

      rebalanced.forEach(course => {
        if (course.name === courseName) {
          course.sessions.forEach(session => {
            if (session.rescheduled) {
              rescheduledCount++;
              if (hasConflict(session.originalDate, course.hoursPerDay)) {
                constraintAffected = true;
              }
            }
          });
        }
      });

      setStats(prev => ({
        ...prev,
        totalCourses: prev.totalCourses + 1
      }));

      let response = `✅ Cours "${courseName}" ajouté avec ${hours}h/jour !\n☁️ Sauvegardé automatiquement dans MongoDB\n\n🔄 Sessions programmées automatiquement :\n• J0 (${startDate.toLocaleDateString('fr-FR')}) - Apprentissage initial\n• J+1 - Première révision\n• J+2, J+10, J+25, J+47 - Révisions espacées\n⏰ Horaires optimisés selon vos préférences (${timePreferences.preferredStartHour}h-${timePreferences.preferredEndHour}h)`;

      if (rescheduledCount > 0) {
        response += `\n\n🔄 ${rescheduledCount} session(s) reportée(s) automatiquement`;
        if (constraintAffected) {
          response += `\n⚠️ Certaines sessions évitent vos contraintes existantes`;
        }
      }

      if (constraints.length > 0) {
        response += `\n\n📋 Le planning respecte vos ${constraints.length} contrainte(s) existante(s)`;
      }

      return response;
    }

    if (lowerMsg.includes('contraintes') || (lowerMsg.includes('liste') && lowerMsg.includes('rdv'))) {
      if (constraints.length === 0) {
        return `📋 Aucune contrainte enregistrée.\n\n💡 Ajoutez une contrainte :\n• "J'ai une contrainte le 15/03 de 9h à 12h"\n• "Rendez-vous médical le 20 septembre toute la journée"`;
      }

      let response = `📋 Vos contraintes enregistrées :\n\n`;

      constraints.forEach((constraint, index) => {
        const timeRange = constraint.startHour === 0 && constraint.endHour === 24 ?
          'Toute la journée' :
          `${constraint.startHour}h à ${constraint.endHour}h`;

        response += `${index + 1}. ${constraint.description}\n`;
        response += `   📅 Le ${constraint.date.toLocaleDateString('fr-FR')}\n`;
        response += `   ⏰ ${timeRange}\n\n`;
      });

      return response;
    }

    if (lowerMsg.includes('planning') && (lowerMsg.includes('semaine') || lowerMsg.includes('hebdo'))) {
      if (courses.length === 0) {
        return `📋 Votre planning hebdomadaire est vide.\n\n🚀 Commencez par ajouter vos premiers cours !`;
      }

      const weeklyPlan = getWeeklyPlan(currentWeek);
      let response = `📅 Planning semaine ${currentWeek === 0 ? '(actuelle)' : currentWeek > 0 ? `(+${currentWeek})` : `(${currentWeek})`}:\n\n`;

      Object.entries(weeklyPlan).forEach(([day, data]) => {
        const isToday = data.date.toDateString() === new Date().toDateString();

        const dayConstraints = constraints.filter(constraint => {
          const constraintDate = new Date(constraint.date);
          constraintDate.setHours(0, 0, 0, 0);
          const dayDate = new Date(data.date);
          dayDate.setHours(0, 0, 0, 0);
          return constraintDate.getTime() === dayDate.getTime();
        });

        response += `${isToday ? '👉 ' : ''}${day} ${data.date.getDate()}/${data.date.getMonth() + 1}:\n`;

        dayConstraints.forEach(constraint => {
          const timeRange = constraint.startHour === 0 && constraint.endHour === 24 ?
            'Toute la journée' :
            `${constraint.startHour}h-${constraint.endHour}h`;
          response += `   ⚠️ ${constraint.description} (${timeRange})\n`;
        });

        if (data.sessions.length === 0) {
          response += `   Repos - aucune session\n`;
        } else {
          data.sessions.forEach(session => {
            const statusIcon = session.completed ? (session.success ? '✅' : '❌') : '⏳';
            const rescheduledIcon = session.rescheduled ? ' 🔄' : '';
            const timeInfo = session.startTime && session.endTime ? ` (${session.startTime}-${session.endTime})` : '';
            response += `   ${statusIcon} ${session.course} (${session.intervalLabel}) - ${session.hours}h${timeInfo}${rescheduledIcon}\n`;
          });
          response += `   📊 Total: ${data.totalHours}h\n`;
        }
        response += '\n';
      });

      response += `🛌 Dimanche: Repos automatique\n⏰ Horaires calculés automatiquement (${timePreferences.preferredStartHour}h-${timePreferences.preferredEndHour}h)`;
      if (constraints.length > 0) {
        response += `\n⚠️ ${constraints.length} contrainte(s) prise(s) en compte`;
      }

      return response;
    }

    if (lowerMsg.includes('planning') || lowerMsg.includes('aujourd')) {
      const todaySessions = getTodaySessions();
      const isSunday = new Date().getDay() === 0;

      let response = `📋 Planning d'aujourd'hui (${new Date().toLocaleDateString('fr-FR')}):\n\n`;

      const todayConstraints = constraints.filter(constraint => {
        const constraintDate = new Date(constraint.date);
        constraintDate.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return constraintDate.getTime() === today.getTime();
      });

      if (todayConstraints.length > 0) {
        response += `⚠️ Contraintes du jour :\n`;
        todayConstraints.forEach(constraint => {
          const timeRange = constraint.startHour === 0 && constraint.endHour === 24 ?
            'Toute la journée' :
            `${constraint.startHour}h à ${constraint.endHour}h`;
          response += `• ${constraint.description} (${timeRange})\n`;
        });
        response += '\n';
      }

      if (isSunday) {
        response += `🛌 Dimanche = Jour de repos automatique !`;
      } else if (todaySessions.length === 0) {
        response += `✨ Aucune session programmée aujourd'hui !`;
      } else {
        const totalHours = todaySessions.reduce((sum, s) => sum + s.hours, 0);
        response += `📊 ${todaySessions.length} session(s) • ${totalHours}h total\n\n📚 Sessions :\n`;

        todaySessions.forEach((item, index) => {
          const rescheduledIcon = item.session.rescheduled ? ' 🔄' : '';
          const {start, end} = calculateOptimalSessionTime(item.session.date, item.course.hoursPerDay, index, todaySessions.length);
          const timeInfo = `${start.toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})}-${end.toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})}`;
          response += `• ${item.course.name} (${item.session.intervalLabel}) - ${item.hours}h (${timeInfo})${rescheduledIcon}\n`;
        });
      }

      return response;
    }

    if (lowerMsg.includes('aide')) {
      return `🤖 Commandes disponibles:\n\n📚 COURS :\n• "Ajouter [nom] avec [X] heures par jour"\n• "Ajouter [nom] avec [X]h démarrage le [date]"\n\n🗑️ SUPPRESSION :\n• "Supprimer tous les cours"\n• "Supprimer le cours [nom]"\n• "Supprimer session J+10 de [cours]"\n\n⚠️ CONTRAINTES :\n• "J'ai une contrainte le [date] de [heure] à [heure]"\n• "Rendez-vous médical le [date] toute la journée"\n• "Mes contraintes"\n\n📋 PLANNING :\n• "Mon planning du jour"\n• "Planning de la semaine"\n\n🔄 DÉPLACEMENT :\n• "Déplacer cours [nom] [J+X] du [DD/MM] au [DD/MM]"\n• Glisser-déposer dans le planning hebdomadaire\n\n✨ NOUVEAUTÉS :\n• Notifications push intelligentes\n• Invitations calendrier par email\n• Horaires optimisés automatiquement\n\n☁️ Toutes vos données sont sauvegardées automatiquement dans MongoDB Atlas !`;
    }

    return `🤔 Je comprends que vous voulez "${message}".\n\n💡 Essayez:\n• "Ajouter [cours] avec [heures] heures par jour"\n• "J'ai une contrainte le [date] de [heure] à [heure]"\n• "Mon planning du jour"\n• "Aide" pour plus de commandes`;
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

    // Initialiser les notifications
    initializeNotifications();

    // Charger l'email sauvegardé
    const savedEmail = localStorage.getItem('medical_user_email');
    if (savedEmail) {
      setUserEmail(savedEmail);
      setIsEmailValid(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(savedEmail));
    }

    // Charger les préférences horaires
    const savedTimePrefs = localStorage.getItem('medical_time_preferences');
    if (savedTimePrefs) {
      try {
        setTimePreferences(JSON.parse(savedTimePrefs));
      } catch (error) {
        console.error('Erreur chargement préférences horaires:', error);
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

  // Programmer les rappels intelligents quand les cours changent
  useEffect(() => {
    if (!isLoading && courses.length > 0) {
      scheduleIntelligentReminders();
      scheduleTodayNotifications();
    }
  }, [courses, reminderSettings, isLoading, scheduleIntelligentReminders, scheduleTodayNotifications]);

  // Nettoyer les timers au démontage
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

      {/* Statistiques (toujours visibles) */}
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
            <span className="text-sm font-medium">Aujourd hui</span>
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

            {courses.length === 0 && (
              <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
                <Brain className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-xl font-medium text-gray-800 mb-2">Aucun cours programmé</h3>
                <p className="text-gray-600 mb-6">Ajoutez vos cours et gérez vos contraintes</p>
                {!isOnline && (
                  <div className="mb-4 p-3 bg-orange-50 rounded-lg">
                    <p className="text-orange-700 text-sm">⚠️ Mode hors ligne - Les données seront synchronisées avec MongoDB dès que la connexion sera rétablie</p>
                  </div>
                )}
                <div className="space-y-2">
                  <button
                    onClick={() => setInputMessage('Ajouter Anatomie Cardiaque avec 2 heures par jour')}
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
