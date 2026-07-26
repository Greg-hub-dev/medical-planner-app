import { readCollection, writeCollection } from '../../../../lib/localStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const courses = readCollection('courses');
    return Response.json({ courses });
  } catch (error) {
    console.error('Erreur lecture courses:', error);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { courses } = await request.json();
    const count = writeCollection('courses', courses || []);
    return Response.json({ success: true, count });
  } catch (error) {
    console.error('Erreur écriture courses:', error);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
