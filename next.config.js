/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produit un serveur autonome (.next/standalone) que l'app Electron peut lancer
  // localement, sans dépendance externe.
  output: 'standalone',
};

module.exports = nextConfig;
