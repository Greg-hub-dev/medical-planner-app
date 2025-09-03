// src/app/api/send-invitations/route.ts
// Route API pour envoyer les invitations calendrier par email

import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

// Interface pour les données reçues
interface SessionData {
  session: {
    id: string;
    date: string;
    interval: string;
    intervalLabel: string;
  };
  course: {
    name: string;
    hoursPerDay: number;
  };
}

interface RequestBody {
  userEmail: string;
  sessions: SessionData[];
}

// Configuration du transporteur email
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail', // ou 'smtp.ethereal.email' pour test
    auth: {
      user: process.env.EMAIL_USER, // votre.email@gmail.com
      pass: process.env.EMAIL_APP_PASSWORD // mot de passe d'application Gmail
    }
  });
};

// Génération du contenu .ics
const generateICSContent = (sessionData: SessionData, userEmail: string): string => {
  const { session, course } = sessionData;
  const startDate = new Date(session.date);
  startDate.setHours(9, 0, 0); // 9h par défaut

  const endDate = new Date(startDate);
  endDate.setHours(startDate.getHours() + course.hoursPerDay);

  const formatDate = (date: Date) =>
    date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Planning Médical IA//FR
METHOD:REQUEST
BEGIN:VEVENT
UID:${session.id}@medical-planner.com
DTSTAMP:${formatDate(new Date())}
DTSTART:${formatDate(startDate)}
DTEND:${formatDate(endDate)}
SUMMARY:📚 ${course.name} (${session.intervalLabel})
DESCRIPTION:Session de révision - Méthode des J\\n\\nDurée: ${course.hoursPerDay}h\\nIntervalle: ${session.intervalLabel}\\n\\nOptimisé pour la mémorisation à long terme\\n\\nGénéré par Planning Médical IA
LOCATION:Bureau/Bibliothèque
ORGANIZER:MAILTO:${process.env.EMAIL_USER}
ATTENDEE:MAILTO:${userEmail}
STATUS:CONFIRMED
SEQUENCE:0
PRIORITY:5
CATEGORIES:EDUCATION,MEDICAL,REVISION
BEGIN:VALARM
TRIGGER:-PT1H
ACTION:DISPLAY
DESCRIPTION:Session dans 1 heure - ${course.name}
END:VALARM
BEGIN:VALARM
TRIGGER:-PT30M
ACTION:DISPLAY
DESCRIPTION:Session dans 30 minutes - Préparez vos supports !
END:VALARM
END:VEVENT
END:VCALENDAR`;
};

// Fonction pour obtenir la clé de la semaine
const getWeekKey = (date: Date): string => {
  const monday = new Date(date);
  const day = monday.getDay();
  const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
  monday.setDate(diff);
  return monday.toLocaleDateString('fr-FR');
};

// Génération du contenu HTML de l'email
const generateEmailHTML = (weekKey: string, weekSessions: SessionData[]): string => {
  const sessionsList = weekSessions.map(({ session, course }) =>
    `<tr>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">
        <strong>${course.name}</strong>
      </td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">
        ${session.intervalLabel}
      </td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">
        ${new Date(session.date).toLocaleDateString('fr-FR')}
      </td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">
        ${course.hoursPerDay}h
      </td>
    </tr>`
  ).join('');

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Planning Médical - Semaine du ${weekKey}</title>
  </head>
  <body style="font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #374151; background-color: #f9fafb; margin: 0; padding: 20px;">
    <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">

      <!-- Header -->
      <div style="background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; padding: 24px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">🎓 Planning Médical IA</h1>
        <p style="margin: 8px 0 0 0; opacity: 0.9;">Semaine du ${weekKey}</p>
      </div>

      <!-- Contenu principal -->
      <div style="padding: 24px;">
        <h2 style="color: #1f2937; margin-top: 0;">📅 Vos sessions de révision</h2>
        <p>Voici vos sessions programmées pour cette semaine selon la méthode des J :</p>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="padding: 12px 8px; text-align: left; font-weight: 600; border-bottom: 2px solid #e5e7eb;">Cours</th>
              <th style="padding: 12px 8px; text-align: left; font-weight: 600; border-bottom: 2px solid #e5e7eb;">Intervalle</th>
              <th style="padding: 12px 8px; text-align: left; font-weight: 600; border-bottom: 2px solid #e5e7eb;">Date</th>
              <th style="padding: 12px 8px; text-align: left; font-weight: 600; border-bottom: 2px solid #e5e7eb;">Durée</th>
            </tr>
          </thead>
          <tbody>
            ${sessionsList}
          </tbody>
        </table>

        <!-- Instructions -->
        <div style="background-color: #dbeafe; border: 1px solid #93c5fd; border-radius: 8px; padding: 16px; margin: 24px 0;">
          <h3 style="color: #1e40af; margin-top: 0;">📱 Comment ajouter à votre calendrier :</h3>
          <ol style="color: #1e3a8a; margin: 0;">
            <li><strong>Ouvrez les pièces jointes</strong> (.ics) de cet email</li>
            <li><strong>Cliquez sur "Ajouter au calendrier"</strong> ou "Ouvrir avec Calendrier"</li>
            <li><strong>Confirmez l'ajout</strong> - les sessions apparaîtront avec des rappels automatiques</li>
            <li><strong>Synchronisation automatique</strong> sur tous vos appareils (iPhone, Android, PC...)</li>
          </ol>
        </div>

        <!-- Rappels -->
        <div style="background-color: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; padding: 16px;">
          <h4 style="color: #92400e; margin-top: 0;">🔔 Rappels configurés :</h4>
          <ul style="color: #92400e; margin: 0;">
            <li><strong>1 heure avant</strong> chaque session</li>
            <li><strong>30 minutes avant</strong> chaque session</li>
          </ul>
        </div>

        <!-- Méthode des J -->
        <div style="margin-top: 24px; padding: 16px; background-color: #f0fdf4; border: 1px solid #86efac; border-radius: 8px;">
          <h4 style="color: #166534; margin-top: 0;">🧠 Méthode des J - Optimisation mémorielle :</h4>
          <p style="color: #166534; margin: 0; font-size: 14px;">
            <strong>J0</strong> : Apprentissage initial •
            <strong>J+1, J+2</strong> : Consolidation •
            <strong>J+10, J+25, J+47</strong> : Mémorisation long terme
          </p>
        </div>
      </div>

      <!-- Footer -->
      <div style="background-color: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0; color: #6b7280; font-size: 14px;">
          Généré par <strong>Planning Médical IA</strong><br>
          <a href="${process.env.NEXTAUTH_URL}" style="color: #3b82f6;">Modifier mon planning</a> •
          <a href="mailto:${process.env.EMAIL_USER}" style="color: #3b82f6;">Support</a>
        </p>
      </div>
    </div>
  </body>
  </html>`;
};

export async function POST(request: NextRequest) {
  try {
    // Vérifier la configuration email
    if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
      return NextResponse.json(
        { error: 'Configuration email manquante. Vérifiez EMAIL_USER et EMAIL_APP_PASSWORD.' },
        { status: 500 }
      );
    }

    const body: RequestBody = await request.json();
    const { userEmail, sessions } = body;

    // Validation des données
    if (!userEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) {
      return NextResponse.json({ error: 'Email invalide' }, { status: 400 });
    }

    if (!sessions || sessions.length === 0) {
      return NextResponse.json({ error: 'Aucune session à envoyer' }, { status: 400 });
    }

    // Créer le transporteur
    const transporter = createTransporter();

    // Grouper les sessions par semaine
    const sessionsByWeek: { [key: string]: SessionData[] } = {};
    sessions.forEach((sessionData) => {
      const weekKey = getWeekKey(new Date(sessionData.session.date));

      if (!sessionsByWeek[weekKey]) {
        sessionsByWeek[weekKey] = [];
      }
      sessionsByWeek[weekKey].push(sessionData);
    });

    let totalSent = 0;
    const errors: string[] = [];

    // Envoyer un email par semaine
    for (const [weekKey, weekSessions] of Object.entries(sessionsByWeek)) {
      try {
        // Créer les pièces jointes .ics
        const icsAttachments = weekSessions.map((sessionData) => {
          return {
            filename: `${sessionData.course.name.replace(/\s+/g, '-')}-${sessionData.session.interval}.ics`,
            content: generateICSContent(sessionData, userEmail),
            contentType: 'text/calendar; charset=utf-8; method=REQUEST'
          };
        });

        // Envoyer l'email
        const mailOptions = {
          from: `"📚 Planning Médical IA" <${process.env.EMAIL_USER}>`,
          to: userEmail,
          subject: `📅 Vos sessions de révision - Semaine du ${weekKey}`,
          html: generateEmailHTML(weekKey, weekSessions),
          attachments: icsAttachments
        };

        await transporter.sendMail(mailOptions);
        totalSent += weekSessions.length;

      } catch (error) {
        console.error(`Erreur envoi semaine ${weekKey}:`, error);
        errors.push(`Semaine ${weekKey}: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
      }
    }

    if (errors.length > 0 && totalSent === 0) {
      return NextResponse.json(
        { error: 'Échec complet de l\'envoi', details: errors },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Invitations envoyées avec succès à ${userEmail}`,
      sessionsCount: totalSent,
      weeksCount: Object.keys(sessionsByWeek).length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Erreur API send-invitations:', error);
    return NextResponse.json(
      { error: 'Erreur serveur lors de l\'envoi des invitations' },
      { status: 500 }
    );
  }
}

// Route GET pour tester la configuration
export async function GET() {
  const isConfigured = !!(process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD);

  return NextResponse.json({
    configured: isConfigured,
    emailUser: process.env.EMAIL_USER ? process.env.EMAIL_USER.replace(/(.{2}).*(@.*)/, '$1***$2') : 'Non configuré',
    message: isConfigured ? 'Configuration email OK' : 'Veuillez configurer EMAIL_USER et EMAIL_APP_PASSWORD'
  });
}
