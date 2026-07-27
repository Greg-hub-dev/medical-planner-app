import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MémoMed — Révisions médicales",
  description: "Planificateur de révisions médicales par répétition espacée (méthode des J), 100 % local.",
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
