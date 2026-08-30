import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Protection par mot de passe du déploiement en ligne (authentification HTTP Basic).
// Activée UNIQUEMENT si la variable APP_PASSWORD est définie : l'application
// Electron et le mode dev local ne la définissent pas et restent donc ouverts.
//
// Identifiants : n'importe quel nom d'utilisateur + APP_PASSWORD comme mot de passe
// (ou APP_USER si vous souhaitez imposer un identifiant précis).

export function middleware(req: NextRequest) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return NextResponse.next();

  const header = req.headers.get('authorization') || '';
  if (header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      const sep = decoded.indexOf(':');
      const user = sep >= 0 ? decoded.slice(0, sep) : '';
      const pass = sep >= 0 ? decoded.slice(sep + 1) : '';
      const expectedUser = process.env.APP_USER;
      if (pass === expected && (!expectedUser || user === expectedUser)) {
        return NextResponse.next();
      }
    } catch {
      // en-tête malformé → on redemande les identifiants
    }
  }

  return new NextResponse('Authentification requise', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="MémoMed", charset="UTF-8"' },
  });
}

// On protège tout sauf les fichiers statiques de Next.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
