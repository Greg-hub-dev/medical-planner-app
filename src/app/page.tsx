'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, Clock, Brain, Plus, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';

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
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      type: 'ai',
      content: '🎓 Bonjour ! Je suis votre agent de planning médical.\n\n📅 Planning: Lundi-Samedi • Dimanche = Repos automatique\n\n💡 Formats disponibles:\n• "Ajouter Anatomie avec 2 heures par jour"\n• "Ajouter Physiologie avec 1.5h démarrage le 15/03"\n• "J\'ai une contrainte le 20/03 de 9h à 12h"\n• "Rendez-vous médical le 15 septembre toute la journée"'
    }
  ]);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [stats, setStats] = useState<Stats>({
    totalCourses: 0,
    todayHours: 0,
    completionRate: 0
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
    { key: 'J+3', days: 3, label: 'J+3', color: 'bg-orange-100 text-orange-700' },
    { key: 'J+7', days: 7, label: 'J+7', color: 'bg-yellow-100 text-yellow-700' },
    { key: 'J+15', days: 15, label: 'J+15', color: 'bg-green-100 text-green-700' },
    { key: 'J+30', days: 30, label: 'J+30', color: 'bg-purple-100 text-purple-700' },
    { key: 'J+90', days: 90, label: 'J+90', color: 'bg-pink-100 text-pink-700' }
  ];

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
    }).filter(course => course.sessions.length > 0); // Supprimer le cours s'il n'a plus de sessions

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

    weekDates.slice(0, 6).forEach((date, index) => {
      const dayName = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][index];
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);

      const daySessions: WeeklyPlanSession[] = [];
      let totalHours = 0;

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

    if (lowerMsg.includes('supprimer') || lowerMsg.includes('effacer') || lowerMsg.includes('retirer')) {

      // Supprimer tous les cours
      if (lowerMsg.includes('tous') && (lowerMsg.includes('cours') || lowerMsg.includes('tout'))) {
        if (courses.length === 0) {
          return `❌ Aucun cours à supprimer.\n\n💡 Ajoutez d'abord des cours avec "Ajouter [nom] avec [X] heures par jour"`;
        }

        const courseCount = courses.length;
        deleteAllCourses();
        return `🗑️ Tous les cours supprimés avec succès !\n\n📊 ${courseCount} cours et toutes leurs sessions ont été effacés.\n\n💡 Vous pouvez ajouter de nouveaux cours quand vous voulez !`;
      }

      // Supprimer un cours spécifique
      const courseMatch = message.match(/supprimer\s+(?:le\s+cours\s+)?([^,.\n]+?)(?:\s+|$)/i);
      if (courseMatch) {
        const courseName = courseMatch[1].trim().toLowerCase();
        const courseToDelete = courses.find(course => course.name.toLowerCase().includes(courseName));

        if (courseToDelete) {
          const sessionCount = courseToDelete.sessions.length;
          deleteCourse(courseToDelete.id);

          // Réorganiser les cours restants
          if (courses.length > 1) {
            const remainingCourses = courses.filter(c => c.id !== courseToDelete.id);
            const rebalanced = rebalanceSessions(remainingCourses);
            setCourses(rebalanced);
          }

          return `🗑️ Cours "${courseToDelete.name}" supprimé !\n\n📊 ${sessionCount} sessions supprimées\n• Planning automatiquement réorganisé\n\n💡 ${courses.length - 1} cours restant(s)`;
        } else {
          const availableCourses = courses.map(c => c.name).join(', ');
          return `❌ Cours "${courseName}" non trouvé.\n\n📚 Cours disponibles : ${availableCourses || 'Aucun'}\n\n💡 Utilisez le nom exact du cours.`;
        }
      }

      // Supprimer une session spécifique (un J)
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

        return `🗑️ Session ${jInterval} supprimée !\n\n📅 Session du ${session.date.toLocaleDateString('fr-FR')} retirée du planning\n• Cours "${course.name}" : ${course.sessions.length - 1} sessions restantes\n\n🔄 Planning automatiquement mis à jour`;
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

        return `⚠️ Contrainte ajoutée avec succès !\n\n📅 ${description} le ${constraintDate.toLocaleDateString('fr-FR')} de ${startHour}h à ${endHour}h\n\n🔄 Réorganisation automatique effectuée :\n• ${affectedSessions} session(s) de cours reportée(s)\n• Toutes les sessions en conflit ont été décalées\n• Les règles de planning sont respectées (Lundi-Samedi, max 10h/jour)\n\n💡 Consultez votre planning mis à jour avec "Planning de la semaine"`;
      }

      return `⚠️ Contrainte ajoutée avec succès !\n\n📅 ${description} le ${constraintDate.toLocaleDateString('fr-FR')} de ${startHour}h à ${endHour}h\n\n💡 Ajoutez des cours et ils seront automatiquement programmés en évitant cette période !`;
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

      let response = `✅ Cours "${courseName}" ajouté avec ${hours}h/jour !\n\n🔄 Sessions programmées automatiquement :\n• J0 (${startDate.toLocaleDateString('fr-FR')}) - Apprentissage initial\n• J+1 - Première révision\n• J+3, J+7, J+15, J+30, J+90 - Révisions espacées`;

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
            response += `   ${statusIcon} ${session.course} (${session.intervalLabel}) - ${session.hours}h${rescheduledIcon}\n`;
          });
          response += `   📊 Total: ${data.totalHours}h\n`;
        }
        response += '\n';
      });

      response += `🛌 Dimanche: Repos automatique`;
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

        todaySessions.forEach(item => {
          const rescheduledIcon = item.session.rescheduled ? ' 🔄' : '';
          response += `• ${item.course.name} (${item.session.intervalLabel}) - ${item.hours}h${rescheduledIcon}\n`;
        });
      }

      return response;
    }

    if (lowerMsg.includes('aide')) {
      return `🤖 Commandes disponibles:\n\n📚 COURS :\n• "Ajouter [nom] avec [X] heures par jour"\n• "Ajouter [nom] avec [X]h démarrage le [date]"\n\n🗑️ SUPPRESSION :\n• "Supprimer tous les cours"\n• "Supprimer le cours [nom]"\n• "Supprimer session J+7 de [cours]"\n\n⚠️ CONTRAINTES :\n• "J'ai une contrainte le [date] de [heure] à [heure]"\n• "Rendez-vous médical le [date] toute la journée"\n• "Mes contraintes"\n\n📋 PLANNING :\n• "Mon planning du jour"\n• "Planning de la semaine"`;
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

  return (
    <div className="max-w-7xl mx-auto p-6 bg-gray-50 min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-2 flex items-center gap-3">
          <Brain className="text-blue-600" />
          Agent IA - Planning Médical
        </h1>
        <p className="text-gray-600">Lundi-Samedi 9h-20h • Dimanche repos • Contraintes et réorganisation automatique</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
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

          {/* Section de gestion des cours */}
          {courses.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border mb-6">
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

                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
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
                                <div className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => {
                                      const confirmDelete = window.confirm(`Supprimer la session ${session.interval} du cours "${course.name}" ?`);
                                      if (confirmDelete) {
                                        deleteSession(course.id, session.id);
                                      }
                                    }}
                                    className="w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full text-xs flex items-center justify-center"
                                    title="Supprimer cette session"
                                  >
                                    ×
                                  </button>
                                </div>
                              )}

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

                      {/* Boutons d'action rapide pour le cours */}
                      <div className="mt-3 flex gap-2 flex-wrap">
                        <button
                          onClick={() => {
                            const incompleteSessions = course.sessions.filter(s => !s.completed);
                            const confirmDelete = window.confirm(`Supprimer toutes les sessions incomplètes de "${course.name}" (${incompleteSessions.length} sessions) ?`);
                            if (confirmDelete) {
                              incompleteSessions.forEach(session => {
                                deleteSession(course.id, session.id);
                              });
                            }
                          }}
                          className="text-xs px-2 py-1 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded"
                          disabled={course.sessions.filter(s => !s.completed).length === 0}
                        >
                          🗑️ Suppr. sessions restantes
                        </button>

                        <button
                          onClick={() => {
                            const allIncomplete = course.sessions.filter(s => !s.completed);
                            allIncomplete.forEach(session => {
                              markSessionComplete(course.id, session.id, true);
                            });
                          }}
                          className="text-xs px-2 py-1 bg-green-100 hover:bg-green-200 text-green-700 rounded"
                          disabled={course.sessions.filter(s => !s.completed).length === 0}
                        >
                          ✅ Tout marquer réussi
                        </button>
                      </div>
                    </div>
                  );
                })}

                <div className="pt-4 border-t">
                  <button
                    onClick={() => {
                      const confirmDelete = window.confirm(`Supprimer TOUS les cours (${courses.length}) et toutes leurs sessions ?`);
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
          )}

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

                return (
                  <div key={dayName} className={`p-4 ${isToday ? 'bg-blue-50 border-blue-200' : ''} ${isOverloaded ? 'bg-red-50' : ''}`}>
                    <div className="mb-2">
                      <h3 className={`font-medium ${isToday ? 'text-blue-800' : isOverloaded ? 'text-red-800' : 'text-gray-800'}`}>
                        {dayName}
                        {isToday && ' 👉'}
                      </h3>
                      <p className="text-xs text-gray-600">
                        {dayData.date.getDate()}/{dayData.date.getMonth() + 1}
                      </p>
                    </div>

                    {dayData.sessions.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">Repos</p>
                    ) : (
                      <div className="space-y-2">
                        {dayData.sessions.map((session, idx) => {
                          // Trouver le cours correspondant pour avoir l'ID
                          const correspondingCourse = courses.find(c => c.name === session.course);
                          const correspondingSession = correspondingCourse?.sessions.find(s =>
                            s.interval === session.interval &&
                            s.date.toDateString() === dayData.date.toDateString()
                          );

                          return (
                            <div key={idx} className={`relative group text-xs p-2 rounded ${session.color}`}>
                              <div className="font-medium truncate">{session.course}</div>
                              <div className="flex justify-between items-center">
                                <span>{session.intervalLabel}</span>
                                <span className="font-medium">{session.hours}h</span>
                              </div>
                              {session.rescheduled && (
                                <div className="mt-1 text-orange-600">🔄 Reporté</div>
                              )}

                              {/* Bouton de suppression qui apparaît au hover */}
                              {correspondingCourse && correspondingSession && !session.completed && (
                                <div className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => {
                                      const confirmDelete = window.confirm(`Supprimer la session ${session.intervalLabel} de "${session.course}" du ${dayData.date.toLocaleDateString('fr-FR')} ?`);
                                      if (confirmDelete) {
                                        deleteSession(correspondingCourse.id, correspondingSession.id);
                                      }
                                    }}
                                    className="w-4 h-4 bg-red-500 hover:bg-red-600 text-white rounded-full text-xs flex items-center justify-center"
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
              <div className="p-4 bg-green-50">
                <div className="mb-2">
                  <h3 className="font-medium text-green-800">Dimanche</h3>
                  <p className="text-xs text-gray-600">
                    {getWeekDates(currentWeek)[6].getDate()}/{getWeekDates(currentWeek)[6].getMonth() + 1}
                  </p>
                </div>
                <p className="text-xs text-green-600 italic">🛌 Repos automatique</p>
                <div className="text-xs font-medium mt-2 text-green-600">
                  📊 Total: 0h
                </div>
              </div>
            </div>
          </div>

          {courses.length === 0 && (
            <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
              <Brain className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-medium text-gray-800 mb-2">Aucun cours programmé</h3>
              <p className="text-gray-600 mb-6">Ajoutez vos cours et gérez vos contraintes</p>
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
        </div>

        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold text-gray-800">🤖 Assistant IA</h2>
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
                onClick={() => setInputMessage('Mes contraintes')}
                className="text-xs p-2 bg-yellow-50 hover:bg-yellow-100 rounded border text-yellow-700"
              >
                📋 Contraintes
              </button>
              <button
                onClick={() => setInputMessage('Supprimer tous les cours')}
                className="text-xs p-2 bg-gray-50 hover:bg-gray-100 rounded border text-gray-700"
                disabled={courses.length === 0}
              >
                🗑️ Suppr. tous
              </button>
              <button
                onClick={() => setInputMessage('Aide')}
                className="text-xs p-2 bg-green-50 hover:bg-green-100 rounded border text-green-700"
              >
                ❓ Aide
              </button>
            </div>

            <div className="mt-3 p-2 bg-gray-50 rounded text-xs">
              <div className="font-medium text-gray-700 mb-1">🛌 Dimanche repos • 🔄 Réorganisation auto avec contraintes</div>
              <div className="flex flex-wrap gap-1 mb-1">
                {jIntervals.map(interval => (
                  <span key={interval.key} className={`px-2 py-1 rounded ${interval.color}`}>
                    {interval.key}
                  </span>
                ))}
              </div>
              <div className="text-gray-600">
                💡 Contraintes : J ai une contrainte le [date] de [heure] à [heure]
              </div>
              {constraints.length > 0 && (
                <div className="mt-1 text-orange-600">
                  ⚠️ {constraints.length} contrainte(s) active(s) - Planning adapté automatiquement
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">📅 Gestion Avancée des Contraintes</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="font-medium text-blue-800 mb-2">🎯 Méthode des J</h3>
            <p className="text-sm text-blue-700 mb-2">Sessions automatiques</p>
            <ul className="text-xs space-y-1 text-blue-600">
              <li>• J0 : Apprentissage initial</li>
              <li>• J+1, J+3, J+7 : Consolidation</li>
              <li>• J+15, J+30, J+90 : Mémorisation</li>
            </ul>
          </div>

          <div className="bg-orange-50 p-4 rounded-lg">
            <h3 className="font-medium text-orange-800 mb-2">🔄 Réorganisation</h3>
            <p className="text-sm text-orange-700 mb-2">Évitement automatique</p>
            <ul className="text-xs space-y-1 text-orange-600">
              <li>• Report si conflit avec contraintes</li>
              <li>• Respect des intervalles J</li>
              <li>• Max 9h/jour, Dimanche libre</li>
            </ul>
          </div>

          <div className="bg-purple-50 p-4 rounded-lg">
            <h3 className="font-medium text-purple-800 mb-2">⚠️ Contraintes</h3>
            <p className="text-sm text-purple-700 mb-2">Événements imprévus</p>
            <ul className="text-xs space-y-1 text-purple-600">
              <li>• Rendez-vous médicaux</li>
              <li>• Formations, voyages</li>
              <li>• Créneaux personnalisés</li>
            </ul>
          </div>
        </div>

        {constraints.length > 0 && (
          <div className="mt-4 p-4 bg-red-50 rounded-lg">
            <h4 className="font-medium text-red-800 mb-2">⚠️ Contraintes actives ({constraints.length}) :</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {constraints.map(constraint => (
                <div key={constraint.id} className="text-sm text-red-700">
                  <div className="font-medium">{constraint.description}</div>
                  <div className="text-xs">
                    📅 {constraint.date.toLocaleDateString('fr-FR')} •
                    ⏰ {constraint.startHour === 0 && constraint.endHour === 24 ?
                        'Toute la journée' :
                        `${constraint.startHour}h-${constraint.endHour}h`}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-xs text-red-600">
              💡 Toutes les sessions de cours évitent automatiquement ces créneaux
            </div>
          </div>
        )}

        {courses.length > 0 && (
          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium text-blue-800 mb-2">📊 État actuel du planning :</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {courses.map(course => {
                const rescheduledCount = course.sessions.filter(s => s.rescheduled && !s.completed).length;
                return (
                  <div key={course.id} className="text-center">
                    <div className="font-medium text-blue-700">{course.name}</div>
                    <div className="text-sm text-blue-600">{course.hoursPerDay}h/jour</div>
                    {rescheduledCount > 0 && (
                      <div className="text-xs text-orange-600">🔄 {rescheduledCount} reportées</div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-2 text-sm text-blue-700">
              <strong>Total :</strong> {courses.reduce((sum, course) => sum + course.hoursPerDay, 0)}h/jour
              • <strong>Capacité :</strong> {workingHours.availableHours}h disponibles
              • <strong>Dimanche :</strong> Toujours libre 🛌
              {constraints.length > 0 && (
                <div className="mt-1">
                  <strong>Contraintes :</strong> {constraints.length} respectée(s) ⚠️
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default function Home() {
  return <MedicalPlanningAgent />;
}
