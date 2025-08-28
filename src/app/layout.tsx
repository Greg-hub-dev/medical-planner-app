import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Médical - Planning Intelligent",
  description: "Système de planning médical avec méthode d'espacement J pour optimiser la rétention mémorielle",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
