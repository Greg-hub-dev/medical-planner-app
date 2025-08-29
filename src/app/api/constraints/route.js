import { MongoClient } from 'mongodb';
import { NextRequest } from 'next/server';

const client = new MongoClient(process.env.MONGODB_URI!);
const dbName = process.env.MONGODB_DATABASE || 'medical_planning';

export async function GET() {
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

export async function POST(request: NextRequest) {
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
