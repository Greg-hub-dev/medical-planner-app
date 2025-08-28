import { connectDB } from '../../../../lib/database';
import { generateWeeklyPlan } from '../../../../lib/planning';

export default async function handler(req, res) {
  const { offset = 0 } = req.query;

  try {
    await connectDB();
    const weeklyPlan = await generateWeeklyPlan(parseInt(offset));

    res.status(200).json({
      weekOffset: parseInt(offset),
      planning: weeklyPlan,
      summary: {
        totalSessions: Object.values(weeklyPlan).reduce((sum, day) => sum + day.sessions.length, 0),
        totalHours: Object.values(weeklyPlan).reduce((sum, day) => sum + day.totalHours, 0),
        constraintsCount: Object.values(weeklyPlan).reduce((sum, day) => sum + day.constraints.length, 0)
      }
    });
  } catch (err) {
    console.error('Erreur génération planning:', err);
    res.status(500).json({ error: 'Erreur génération planning' });
  }
}
