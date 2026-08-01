/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produit un serveur autonome (.next/standalone) que l'app Electron peut lancer
  // localement, sans dépendance externe.
  output: 'standalone',
  // better-sqlite3 est un module natif : il ne doit pas être bundlé par webpack,
  // mais tracé tel quel dans la sortie standalone.
  serverExternalPackages: ['better-sqlite3'],
};

module.exports = nextConfig;
