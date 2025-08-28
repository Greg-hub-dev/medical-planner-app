import { connectDB, Course, Constraint } from '../../../../lib/database';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    await connectDB();

    const [courses, constraints] = await Promise.all([
      Course.find(),
      Constraint.find()
    ]);

    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      data: {
        courses: courses,
        constraints: constraints,
        settings: {
          workingHours: { start: 9, end: 20, lunchBreak: { start: 13, end: 14 } },
          jIntervals: [0, 1, 3, 7, 15, 30, 90]
        }
      }
    };

    return NextResponse.json(exportData);
  } catch (err) {
    console.error('Erreur export:', err);
    return NextResponse.json({ error: 'Erreur export' }, { status: 500 });
  }
}
