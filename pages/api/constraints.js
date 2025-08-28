import { connectDB, Constraint } from '../../lib/database';
import { reorganizeAllSessions } from '../../lib/planning';

export default async function handler(req, res) {
  await connectDB();

  const { method } = req;

  // Vérification API Key pour les modifications
  if (['POST', 'PUT', 'DELETE'].includes(method)) {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'API Key invalide' });
    }
  }

  switch (method) {
    case 'GET':
      try {
        const constraints = await Constraint.find().sort({ date: 1 });
        res.status(200).json(constraints);
      } catch (err) {
        console.error('Erreur GET constraints:', err);
        res.status(500).json({ error: 'Erreur serveur' });
      }
      break;

    case 'POST':
      try {
        const { date, startHour, endHour, description, type } = req.body;

        // Validation
        if (!date) {
          return res.status(400).json({ error: 'Date requise' });
        }

        const constraint = await Constraint.create({
          date: new Date(date),
          startHour: startHour || 0,
          endHour: endHour || 24,
          description: description || 'Contrainte personnelle',
          type: type || 'manual'
        });

        // Réorganiser automatiquement tous les cours
        const affectedSessions = await reorganizeAllSessions();

        // Webhook notification
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

        res.status(201).json({
          constraint,
          affectedSessions: affectedSessions.length,
          message: `Contrainte ajoutée. ${affectedSessions.length} session(s) reportée(s).`
        });
      } catch (err) {
        console.error('Erreur création contrainte:', err);
        res.status(500).json({ error: 'Erreur création contrainte' });
      }
      break;

    default:
      res.setHeader('Allow', ['GET', 'POST']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
}
