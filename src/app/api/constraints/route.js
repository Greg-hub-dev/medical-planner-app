import { connectDB, Constraint } from '../../../../lib/database';
import { reorganizeAllSessions } from '../../../../lib/planning';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    await connectDB();
    const constraints = await Constraint.find().sort({ date: 1 });
    return NextResponse.json(constraints);
  } catch (err) {
    console.error('Erreur GET constraints:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return NextResponse.json({ error: 'API Key invalide' }, { status: 401 });
    }

    await connectDB();
    const { date, startHour, endHour, description, type } = await request.json();

    if (!date) {
      return NextResponse.json({ error: 'Date requise' }, { status: 400 });
    }

    const constraint = await Constraint.create({
      date: new Date(date),
      startHour: startHour || 0,
      endHour: endHour || 24,
      description: description || 'Contrainte personnelle',
      type: type || 'manual'
    });

    const affectedSessions = await reorganizeAllSessions();

    if (process.env.WEBHOOK_URL) {
      await fetch(process.env.WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'constraint_added',
          constraint: constraint,
          affectedSessions: affectedSessions,
          timestamp: new Date().toISOString()
        })
      });
    }

    return NextResponse.json({
      constraint,
      affectedSessions: affectedSessions.length,
      message: `Contrainte ajoutée. ${affectedSessions.length} session(s) reportée(s).`
    }, { status: 201 });
  } catch (err) {
    console.error('Erreur création contrainte:', err);
    return NextResponse.json({ error: 'Erreur création contrainte' }, { status: 500 });
  }
}
