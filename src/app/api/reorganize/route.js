import { reorganizeAllSessions } from '../../../../lib/planning';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    // Vérification API Key
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return NextResponse.json({ error: 'API Key invalide' }, { status: 401 });
    }

    const affectedSessions = await reorganizeAllSessions();

    // Webhook notification
    if (process.env.WEBHOOK_URL) {
      await fetch(process.env.WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'planning_reorganized',
          affectedSessions: affectedSessions.length,
          timestamp: new Date().toISOString()
        })
      });
    }

    return NextResponse.json({
      success: true,
      affectedSessions: affectedSessions.length,
      message: `Planning réorganisé. ${affectedSessions.length} session(s) affectée(s).`
    });
  } catch (err) {
    console.error('Erreur réorganisation:', err);
    return NextResponse.json({ error: 'Erreur réorganisation' }, { status: 500 });
  }
}
