import { readCollection, writeCollection } from '../../../../lib/localStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const constraints = readCollection('constraints');
    return Response.json({ constraints });
  } catch (error) {
    console.error('Erreur lecture constraints:', error);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { constraints } = await request.json();
    const count = writeCollection('constraints', constraints || []);
    return Response.json({ success: true, count });
  } catch (error) {
    console.error('Erreur écriture constraints:', error);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
