import { MongoClient } from 'mongodb';

const mongoUri = process.env.MONGODB_URI || '';
const dbName = process.env.MONGODB_DATABASE || 'medical_planning';

if (!mongoUri) {
  console.error('MONGODB_URI environment variable is not set');
}

export async function GET() {
  if (!mongoUri) {
    return Response.json({ error: 'MongoDB URI not configured' }, { status: 500 });
  }

  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection('courses');

    const courses = await collection.find({}).toArray();

    return Response.json({ courses });
  } catch (error) {
    console.error('Erreur MongoDB GET courses:', error);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  } finally {
    await client.close();
  }
}

export async function POST(request) {
  if (!mongoUri) {
    return Response.json({ error: 'MongoDB URI not configured' }, { status: 500 });
  }

  const client = new MongoClient(mongoUri);

  try {
    const { courses } = await request.json();

    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection('courses');

    // Vider la collection et insérer les nouveaux cours
    await collection.deleteMany({});
    if (courses.length > 0) {
      await collection.insertMany(courses);
    }

    return Response.json({ success: true, count: courses.length });
  } catch (error) {
    console.error('Erreur MongoDB POST courses:', error);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  } finally {
    await client.close();
  }
}
