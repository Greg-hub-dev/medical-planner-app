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
    const collection = db.collection('constraints');

    const constraints = await collection.find({}).toArray();

    return Response.json({ constraints });
  } catch (error) {
    console.error('Erreur MongoDB GET constraints:', error);
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
    const { constraints } = await request.json();

    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection('constraints');

    // Vider la collection et insérer les nouvelles contraintes
    await collection.deleteMany({});
    if (constraints.length > 0) {
      await collection.insertMany(constraints);
    }

    return Response.json({ success: true, count: constraints.length });
  } catch (error) {
    console.error('Erreur MongoDB POST constraints:', error);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  } finally {
    await client.close();
  }
}
