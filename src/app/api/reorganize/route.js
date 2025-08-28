import { reorganizeAllSessions } from '../../../../lib/planning';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Vérification API Key
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'API Key invalide' });
  }

  try {
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

    res.status(200).json({
      success: true,
      affectedSessions: affectedSessions.length,
      message: `Planning réorganisé. ${affectedSessions.length} session(s) affectée(s).`
    });
  } catch (err) {
    console.error('Erreur réorganisation:', err);
    res.status(500).json({ error: 'Erreur réorganisation' });
  }
}
