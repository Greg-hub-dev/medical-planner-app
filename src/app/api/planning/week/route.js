import { connectDB } from '../../../../../lib/database';
import { generateWeeklyPlan } from '../../../../../lib/planning';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const offset = parseInt(searchParams.get('offset') || '0');

    await connectDB();
    const weeklyPlan = await generateWeeklyPlan(offset);

    return NextResponse.json({
      weekOffset: offset,
      planning: weeklyPlan,
      summary: {
        totalSessions: Object.values(weeklyPlan).reduce((sum, day) => sum + day.sessions.length, 0),
        totalHours: Object.values(weeklyPlan).reduce((sum, day) => sum + day.totalHours, 0),
        constraintsCount: Object.values(weeklyPlan).reduce((sum, day) => sum + day.constraints.length, 0)
      }
    });
  } catch (err) {
    console.error('Erreur génération planning:', err);
    return NextResponse.json({ error: 'Erreur génération planning' }, { status: 500 });
  }
}
