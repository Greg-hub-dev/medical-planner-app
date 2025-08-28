'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, Clock, Brain, Plus, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';

const MedicalPlanningAgent = () => {
  const [courses, setCourses] = useState<any[]>([]);
  const [constraints, setConstraints] = useState<any[]>([]);
  const [currentWeek, setCurrentWeek] = useState<number>(0);
  const [chatMessages, setChatMessages] = useState<{ type: string; content: string }[]>([
    {
      type: 'ai',
      content: '🎓 Bonjour ! Je suis votre agent de planning médical.\n\n📅 Planning: Lundi-Samedi • Dimanche = Repos automatique\n\n💡 Formats disponibles:\n• "Ajouter Anatomie avec 2 heures par jour"\n• "Ajouter Physiologie avec 1.5h démarrage le 15/03"\n• "J\'ai une contrainte le 20/03 de 9h à 12h"\n• "Rendez-vous médical le 15 septembre toute la journée"'
    }
  ]);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [stats, setStats] = useState<{
    totalCourses: number;
    todayHours: number;
    completionRate: number;
  }>({
    totalCourses: 0,
    todayHours: 0,
    completionRate: 0
  });

  const workingHours = {
    start: 9,
    end: 20,
    lunchBreak: { start: 13, end: 14 },
    availableHours: 10
  };

  const jIntervals = [
    { key: 'J0', days: 0, label: 'J0 (Apprentissage)', color: 'bg-blue-100 text-blue-700' },
    { key: 'J+1', days: 1, label: 'J+1', color: 'bg-red-100 text-red-700' },
    { key: 'J+3', days: 3, label: 'J+3', color: 'bg-orange-100 text-orange-700' },
    { key: 'J+7', days: 7, label: 'J+7', color: 'bg-yellow-100 text-yellow-700' },
    { key: 'J+15', days: 15, label: 'J+15', color: 'bg-green-100 text-green-700' },
    { key: 'J+30', days: 30, label: 'J+30', color: 'bg-purple-100 text-purple-700' },
    { key: 'J+90', days: 90, label: 'J+90', color: 'bg-pink-100 text-pink-700' }
  ];

  const createConstraint = (date: string | Date, startHour: number, endHour: number, description: string) => {
    return {
      id: Date.now(),
      date: new Date(date),
      startHour: startHour,
      endHour: endHour,
      description: description,
      createdAt: new Date()
    };
  };

  const hasConflict = (sessionDate: Date, sessionHours: number) => {
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

  const createCourseSessions = (courseName: string, startDate: Date = new Date()) => {
    const sessions = [];
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

  const createNewCourse = (name: string, hoursPerDay: number, startDate: Date = new Date()) => {
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

  const rebalanceSessions = (coursesToBalance: any[]) => {
    const updatedCourses = [...coursesToBalance];

    const allPendingSessions: any[] = [];
    updatedCourses.forEach(course => {
      course.sessions.forEach((session: any) => {
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
          const originalSession = course.sessions.find((s: any) => s.id === session.id);
          originalSession.date = new Date(targetDate);
          originalSession.rescheduled = targetDate.toDateString() !== session.originalDate.toDateString();

          break;
        } else {
          targetDate.setDate(targetDate.getDate() + 1);
        }
      }
    });

    return updatedCourses;
  };

  const getWeekDates = (weekOffset: number = 0) => {
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

  const getWeeklyPlan = (weekOffset: number = 0) => {
    const weekDates = getWeekDates(weekOffset);
    const weeklyPlan: { [key: string]: any } = {};

    weekDates.slice(0, 6).forEach((date, index) => {
      const dayName = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][index];
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);

      const daySessions: any[] = [];
      let totalHours = 0;

      courses.forEach((course: any) => {
        course.sessions.forEach((session: any) => {
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

  const getTodaySessions = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaySessions: any[] = [];

    courses.forEach((course: any) => {
      course.sessions.forEach((session: any) => {
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

  const processAICommand = (message: string) => {
    const lowerMsg = message.toLowerCase();

    if (lowerMsg.includes('contrainte') || lowerMsg.includes('empêche') || lowerMsg.includes('rendez-vous') || lowerMsg.includes('rdv') || lowerMsg.includes('occupation')) {
      let constraintDate = new Date();
      const datePatterns = [
        /(?:le\s*)?(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/,
        /(?:le\s*)?(\d{1,2})\s*(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)/i
      ];

      for (const pattern of datePatterns) {
        const match = message.match(pattern);
        if (match) {
          if (match[2] && !isNaN(match[2] as any)) {
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
        rebalanced.forEach((course: any) => {
          course.sessions.forEach((session: any) => {
            if (session.rescheduled) affectedSessions++;
          });
        });

        return `⚠️ Contrainte ajoutée avec succès !\n\n📅 ${description} le ${constraintDate.toLocaleDateString('fr-FR')} de ${startHour}h à ${endHour}h\n\n🔄 Réorganisation automatique effectuée :\n• ${affectedSessions} session(s) de cours reportée(s)\n• Toutes les sessions en conflit ont été décalées\n• Les règles de planning sont respectées (Lundi-Samedi, max 10h/jour)\n\n💡 Consultez votre planning mis à jour avec &quot;Planning de la semaine&quot;`;
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
          if (match[2] && !isNaN(match[2] as any)) {
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

      rebalanced.forEach((course: any) => {
        if (course.name === courseName) {
          course.sessions.forEach((session: any) => {
            if (session.rescheduled) {
              rescheduledCount++;
              if (hasConflict(session.originalDate, course.hoursPerDay)) {
                constraintAffected = true;
              }
            }
          });
        }
      });

      setStats((prev: any) => ({
        ...prev,
        totalCourses: prev.totalCourses + 1
      }));

      let response = `✅ Cours &quot;${courseName}&quot; ajouté avec ${hours}h/jour !\n\n🔄 Sessions programmées automatiquement :\n• J0 (${startDate.toLocaleDateString('fr-FR')}) - Apprentissage initial\n• J+1 - Première révision\n• J+3, J+7, J+15, J+30, J+90 - Révisions espacées`;

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
        return `📋 Aucune contrainte enregistrée.\n\n💡 Ajoutez une contrainte :\n• &quot;J&apos;ai une contrainte le 15/03 de 9h à 12h&quot;\n• &quot;Rendez-vous médical le 20 septembre toute la journée&quot;`;
      }

      let response = `📋 Vos contraintes enregistrées :\n\n`;

      constraints.forEach((constraint: any, index: number) => {
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

      Object.entries(weeklyPlan).forEach(([day, data]: [string, any]) => {
        const isToday = data.date.toDateString() === new Date().toDateString();

        const dayConstraints = constraints.filter((constraint: any) => {
          const constraintDate = new Date(constraint.date);
          constraintDate.setHours(0, 0, 0, 0);
          const dayDate = new Date(data.date);
          dayDate.setHours(0, 0, 0, 0);
          return constraintDate.getTime() === dayDate.getTime();
        });

        response += `${isToday ? '👉 ' : ''}${day} ${data.date.getDate()}/${data.date.getMonth() + 1}:\n`;

        dayConstraints.forEach((constraint: any) => {
          const timeRange = constraint.startHour === 0 && constraint.endHour === 24 ?
            'Toute la journée' :
            `${constraint.startHour}h-${constraint.endHour}h`;
          response += `   ⚠️ ${constraint.description} (${timeRange})\n`;
        });

        if (data.sessions.length === 0) {
          response += `   Repos - aucune session\n`;
        } else {
          data.sessions.forEach((session: any) => {
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

      let response = `📋 Planning d&apos;aujourd&apos;hui (${new Date().toLocaleDateString('fr-FR')}):\n\n`;

      const todayConstraints = constraints.filter((constraint: any) => {
        const constraintDate = new Date(constraint.date);
        constraintDate.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return constraintDate.getTime() === today.getTime();
      });

      if (todayConstraints.length > 0) {
        response += `⚠️ Contraintes du jour :\n`;
        todayConstraints.forEach((constraint: any) => {
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
        response += `✨ Aucune session programmée aujourd&apos;hui !`;
      } else {
        const totalHours = todaySessions.reduce((sum: number, s: any) => sum + s.hours, 0);
        response += `📊 ${todaySessions.length} session(s) • ${totalHours}h total\n\n📚 Sessions :\n`;

        todaySessions.forEach((item: any) => {
          const rescheduledIcon = item.session.rescheduled ? ' 🔄' : '';
          response += `• ${item.course.name} (${item.session.intervalLabel}) - ${item.hours}h${rescheduledIcon}\n`;
        });
      }

      return response;
    }

    if (lowerMsg.includes('aide')) {
      return `🤖 Commandes disponibles:\n\n📚 COURS :\n• &quot;Ajouter [nom] avec [X] heures par jour&quot;\n• &quot;Ajouter [nom] avec [X]h démarrage le [date]&quot;\n\n⚠️ CONTRAINTES :\n• &quot;J&apos;ai une contrainte le [date] de [heure] à [heure]&quot;\n• &quot;Rendez-vous médical le [date] toute la journée&quot;\n• &quot;Mes contraintes&quot;\n\n📋 PLANNING :\n• &quot;Mon planning du jour&quot;\n• &quot;Planning de la semaine&quot;`;
    }

    return `🤔 Je comprends que vous voulez &quot;${message}&quot;.\n\n💡 Essayez:\n• &quot;Ajouter [cours] avec [heures] heures par jour&quot;\n• &quot;J&apos;ai une contrainte le [date] de [heure] à [heure]&quot;\n• &quot;Mon planning du jour&quot;\n• &quot;Aide&quot; pour plus de commandes`;
  };

  const handleSendMessage = () => {
    if (!inputMessage.trim()) return;

    const userMsg = { type: 'user', content: inputMessage };
    const aiResponse = { type: 'ai', content: processAICommand(inputMessage) };

    setChatMessages([...chatMessages, userMsg, aiResponse]);
    setInputMessage('');
  };

  useEffect(() => {
    const todayHours = getTodaySessions().reduce((sum: number, s: any) => sum + s.hours, 0);
    const totalCompletedSessions = courses.reduce((sum: number, course: any) => sum + course.sessions.filter((s: any) => s.completed).length, 0);
    const totalSessions = courses.reduce((sum: number, course: any) => sum + course.sessions.length, 0);

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
              {Object.entries(getWeeklyPlan(currentWeek)).map(([dayName, dayData]: [string, any]) => {
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
                        {dayData.sessions.map((session: any, idx: number) => (
                          <div key={idx} className={`text-xs p-2 rounded ${session.color}`}>
                            <div className="font-medium truncate">{session.course}</div>
                            <div className="flex justify-between items-center">
                              <span>{session.intervalLabel}</span>
                              <span className="font-medium">{session.hours}h</span>
                            </div>
                            {session.rescheduled && (
                              <div className="mt-1 text-orange-600">🔄 Reporté</div>
                            )}
                          </div>
                        ))}
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
                💡 Contraintes : &quot;J&apos;ai une contrainte le [date] de [heure] à [heure]&quot;
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
              <li>• Max 10h/jour, Dimanche libre</li>
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
              {constraints.map((constraint: any) => (
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
              {courses.map((course: any) => {
                const rescheduledCount = course.sessions.filter((s: any) => s.rescheduled && !s.completed).length;
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
              <strong>Total :</strong> {courses.reduce((sum: number, course: any) => sum + course.hoursPerDay, 0)}h/jour
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
