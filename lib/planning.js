import { Course, Constraint } from './database';

export const jIntervals = [
  { key: 'J0', days: 0 },
  { key: 'J+1', days: 1 },
  { key: 'J+3', days: 3 },
  { key: 'J+7', days: 7 },
  { key: 'J+15', days: 15 },
  { key: 'J+30', days: 30 },
  { key: 'J+90', days: 90 }
];

export function generateJSessions(startDate, hoursPerDay) {
  const sessions = [];

  jIntervals.forEach(interval => {
    const sessionDate = new Date(startDate);
    sessionDate.setDate(startDate.getDate() + interval.days);

    // Éviter le dimanche
    if (sessionDate.getDay() === 0) {
      sessionDate.setDate(sessionDate.getDate() + 1);
    }

    sessions.push({
      id: `${Date.now()}_${interval.key}`,
      interval: interval.key,
      date: sessionDate,
      originalDate: new Date(sessionDate),
      hoursNeeded: hoursPerDay,
      completed: false,
      rescheduled: false
    });
  });

  return sessions;
}

async function getDayTotalHours(targetDate) {
  try {
    const courses = await Course.find();
    let totalHours = 0;

    const targetDateString = targetDate.toDateString();

    courses.forEach(course => {
      course.sessions.forEach(session => {
        if (session.date.toDateString() === targetDateString && !session.completed) {
          totalHours += course.hoursPerDay;
        }
      });
    });

    return totalHours;
  } catch (err) {
    console.error('Erreur calcul heures quotidiennes:', err);
    return 0;
  }
}

export async function reorganizeAllSessions() {
  try {
    const [courses, constraints] = await Promise.all([
      Course.find(),
      Constraint.find()
    ]);

    const affectedSessions = [];
    const workingHours = { availableHours: 10 };

    // Algorithme de réorganisation avec contraintes
    for (const course of courses) {
      for (const session of course.sessions) {
        if (!session.completed) {
          let targetDate = new Date(Math.max(session.originalDate.getTime(), new Date().getTime()));

          while (true) {
            // Vérifier dimanche
            if (targetDate.getDay() === 0) {
              targetDate.setDate(targetDate.getDate() + 1);
              continue;
            }

            // Vérifier contraintes
            const hasConflict = constraints.some(constraint => {
              const constraintDate = new Date(constraint.date);
              constraintDate.setHours(0, 0, 0, 0);
              const checkDate = new Date(targetDate);
              checkDate.setHours(0, 0, 0, 0);

              if (constraintDate.getTime() !== checkDate.getTime()) return false;

              return constraint.startHour === 0 && constraint.endHour === 24;
            });

            if (!hasConflict) {
              // Vérifier capacité quotidienne
              const dayHours = await getDayTotalHours(targetDate);
              if (dayHours + session.hoursNeeded <= workingHours.availableHours) {
                // Date valide trouvée
                if (session.date.getTime() !== targetDate.getTime()) {
                  session.date = new Date(targetDate);
                  session.rescheduled = true;
                  affectedSessions.push(session);
                }
                break;
              }
            }

            targetDate.setDate(targetDate.getDate() + 1);
          }
        }
      }

      await course.save();
    }

    return affectedSessions;
  } catch (err) {
    console.error('Erreur réorganisation:', err);
    return [];
  }
}

export async function generateWeeklyPlan(weekOffset = 0) {
  try {
    const [courses, constraints] = await Promise.all([
      Course.find(),
      Constraint.find()
    ]);

    const today = new Date();
    const currentDay = today.getDay();
    const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;

    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset + (weekOffset * 7));

    const weekPlan = {};
    const dayNames = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

    // Générer les 6 jours de la semaine (Lundi à Samedi)
    for (let i = 0; i < 6; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);

      const dayName = dayNames[i];

      const sessions = [];
      let totalHours = 0;

      // Trouver les sessions pour ce jour
      courses.forEach(course => {
        course.sessions.forEach(session => {
          const sessionDate = new Date(session.date);
          sessionDate.setHours(0, 0, 0, 0);
          const currentDate = new Date(date);
          currentDate.setHours(0, 0, 0, 0);

          if (sessionDate.getTime() === currentDate.getTime()) {
            sessions.push({
              course: course.name,
              interval: session.interval,
              hours: course.hoursPerDay,
              completed: session.completed,
              rescheduled: session.rescheduled
            });

            if (!session.completed) {
              totalHours += course.hoursPerDay;
            }
          }
        });
      });

      // Trouver les contraintes pour ce jour
      const dayConstraints = constraints.filter(constraint => {
        const constraintDate = new Date(constraint.date);
        constraintDate.setHours(0, 0, 0, 0);
        const currentDate = new Date(date);
        currentDate.setHours(0, 0, 0, 0);
        return constraintDate.getTime() === currentDate.getTime();
      });

      weekPlan[dayName] = {
        date: date,
        sessions: sessions,
        totalHours: totalHours,
        constraints: dayConstraints
      };
    }

    return weekPlan;
  } catch (err) {
    console.error('Erreur génération planning hebdomadaire:', err);
    return {};
  }
}
