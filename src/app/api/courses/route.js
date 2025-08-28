import { connectDB, Course } from '../../../../lib/database';
import { generateJSessions, reorganizeAllSessions } from '../../../../lib/planning';
import { NextResponse } from 'next/server';

// GET /api/courses
export async function GET() {
  try {
    await connectDB();
    const courses = await Course.find().sort({ createdAt: -1 });
    return NextResponse.json(courses);
  } catch (error) {
    console.error('Erreur GET courses:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST /api/courses
export async function POST(request) {
  try {
    // Vérification API Key
    const apiKey = request.headers.get('x-api-key') || request.headers.get('authorization')?.replace('Bearer ', '');
    if (apiKey !== process.env.API_KEY) {
      return NextResponse.json({ error: 'API Key invalide ou manquante' }, { status: 401 });
    }

    await connectDB();

    const { name, hoursPerDay, startDate, description } = await request.json();

    if (!name || !hoursPerDay) {
      return NextResponse.json({
        error: 'Nom et heures par jour requis'
      }, { status: 400 });
    }

    const courseStartDate = startDate ? new Date(startDate) : new Date();

    const course = new Course({
      name,
      hoursPerDay: parseFloat(hoursPerDay),
      startDate: courseStartDate,
      description: description || '',
      sessions: generateJSessions(courseStartDate, parseFloat(hoursPerDay))
    });

    await course.save();

    // Réorganiser si nécessaire
    setTimeout(async () => {
      await reorganizeAllSessions();
    }, 100);

    // Webhook notification
    if (process.env.WEBHOOK_URL) {
      try {
        await fetch(process.env.WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'course_created',
            course: course,
            timestamp: new Date().toISOString()
          })
        });
      } catch (webhookError) {
        console.error('Erreur webhook:', webhookError);
      }
    }

    return NextResponse.json(course, { status: 201 });
  } catch (error) {
    console.error('Erreur POST course:', error);
    return NextResponse.json({ error: 'Erreur création cours' }, { status: 500 });
  }
}

// OPTIONS pour CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    },
  });
}
