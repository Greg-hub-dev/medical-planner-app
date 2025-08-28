import { connectDB, Course, Constraint } from '../../../../lib/database';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    // Vérification API Key
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return NextResponse.json({ error: 'API Key invalide' }, { status: 401 });
    }

    await connectDB();
    const importData = await request.json();

    if (!importData.data || !importData.data.courses || !importData.data.constraints) {
      return NextResponse.json({ error: 'Format de données invalide' }, { status: 400 });
    }

    // Nettoyer les collections existantes
    await Promise.all([
      Course.deleteMany({}),
      Constraint.deleteMany({})
    ]);

    // Importer les nouvelles données
    const [importedCourses, importedConstraints] = await Promise.all([
      Course.insertMany(importData.data.courses),
      Constraint.insertMany(importData.data.constraints)
    ]);

    // Webhook notification
    if (process.env.WEBHOOK_URL) {
      await fetch(process.env.WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'data_imported',
          coursesCount: importedCourses.length,
          constraintsCount: importedConstraints.length,
          timestamp: new Date().toISOString()
        })
      });
    }

    return NextResponse.json({
      success: true,
      imported: {
        courses: importedCourses.length,
        constraints: importedConstraints.length
      },
      message: `Import réussi: ${importedCourses.length} cours et ${importedConstraints.length} contraintes.`
    });
  } catch (err) {
    console.error('Erreur import:', err);
    return NextResponse.json({ error: 'Erreur import des données' }, { status: 500 });
  }
}
