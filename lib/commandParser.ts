// Analyseur de commandes local (sans modèle) — français & anglais.
// Transforme une phrase libre en intention typée que l'UI applique.

import type { Lang } from './i18n';

export type Intent =
  | { action: 'help' }
  | { action: 'week' }
  | { action: 'today' }
  | { action: 'list_courses' }
  | { action: 'add_course'; name: string; hours: number; startDate: Date | null }
  | { action: 'move_course'; name: string; toDate: Date }
  | {
      action: 'add_constraint';
      date: Date;
      endDate: Date | null;
      allDay: boolean;
      startHour: number;
      endHour: number;
    }
  | { action: 'unknown'; text: string };

const MONTHS: Record<string, number> = {
  janvier: 0, january: 0, jan: 0,
  fevrier: 1, février: 1, february: 1, feb: 1,
  mars: 2, march: 2, mar: 2,
  avril: 3, april: 3, apr: 3,
  mai: 4, may: 4,
  juin: 5, june: 5, jun: 5,
  juillet: 6, july: 6, jul: 6,
  aout: 7, août: 7, august: 7, aug: 7,
  septembre: 8, september: 8, sep: 8, sept: 8,
  octobre: 9, october: 9, oct: 9,
  novembre: 10, november: 10, nov: 10,
  decembre: 11, décembre: 11, december: 11, dec: 11,
};

function norm(s: string): string {
  return s.toLowerCase().trim();
}

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function currentYearFor(month: number, day: number): number {
  const now = new Date();
  const y = now.getFullYear();
  const candidate = new Date(y, month, day);
  // Si la date est déjà bien passée, viser l'année suivante.
  const daysPast = (now.getTime() - candidate.getTime()) / 86400000;
  return daysPast > 60 ? y + 1 : y;
}

/** Extrait une date d'un fragment. Gère jj/mm(/aaaa), « 15 mars », demain, aujourd'hui. */
function parseDate(fragment: string, lang: Lang): Date | null {
  const f = stripAccents(norm(fragment));

  if (/\b(aujourd|today)\b/.test(f)) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (/\b(demain|tomorrow)\b/.test(f)) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // jj/mm ou jj/mm/aaaa (ou avec -)
  const numeric = f.match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/);
  if (numeric) {
    const a = parseInt(numeric[1], 10);
    const b = parseInt(numeric[2], 10);
    // Ordre jour/mois ambigu : on désambiguïse par la valeur puis par la langue
    // (anglais → mm/dd, français → jj/mm).
    let day: number, month: number;
    if (a > 12) { day = a; month = b - 1; }
    else if (b > 12) { month = a - 1; day = b; }
    else if (lang === 'en') { month = a - 1; day = b; }
    else { day = a; month = b - 1; }
    let year = numeric[3] ? parseInt(numeric[3], 10) : currentYearFor(month, day);
    if (year < 100) year += 2000;
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const d = new Date(year, month, day);
      d.setHours(0, 0, 0, 0);
      return d;
    }
  }

  // « 15 mars » ou « march 15 »
  const monthNames = Object.keys(MONTHS).join('|');
  let named = f.match(new RegExp(`\\b(\\d{1,2})\\s+(${monthNames})\\b`));
  if (!named) {
    const rev = f.match(new RegExp(`\\b(${monthNames})\\s+(\\d{1,2})\\b`));
    if (rev) named = [rev[0], rev[2], rev[1]] as unknown as RegExpMatchArray;
  }
  if (named) {
    const day = parseInt(named[1], 10);
    const month = MONTHS[named[2]];
    if (month !== undefined && day >= 1 && day <= 31) {
      const d = new Date(currentYearFor(month, day), month, day);
      d.setHours(0, 0, 0, 0);
      return d;
    }
  }
  return null;
}

/** Détecte une plage « du 12 au 16 mars » / « from 12 to 16 march ». */
function parseRange(f: string, lang: Lang): { start: Date; end: Date } | null {
  const cleaned = stripAccents(norm(f));
  const monthNames = Object.keys(MONTHS).join('|');
  // du 12 au 16 mars
  const m = cleaned.match(
    new RegExp(`\\b(?:du|from)\\s+(\\d{1,2})\\s+(?:au|to|-)\\s+(\\d{1,2})\\s+(${monthNames})\\b`)
  );
  if (m) {
    const d1 = parseInt(m[1], 10);
    const d2 = parseInt(m[2], 10);
    const month = MONTHS[m[3]];
    const year = currentYearFor(month, d1);
    return {
      start: new Date(year, month, d1),
      end: new Date(year, month, d2),
    };
  }
  // du 12/03 au 16/03
  const m2 = cleaned.match(
    /\b(?:du|from)\s+(\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?)\s+(?:au|to)\s+(\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?)/
  );
  if (m2) {
    const start = parseDate(m2[1], lang);
    const end = parseDate(m2[2], lang);
    if (start && end) return { start, end };
  }
  return null;
}

/** Extrait une plage horaire « de 9h à 12h » / « from 9 to 12 ». */
function parseHourRange(f: string): { start: number; end: number } | null {
  const cleaned = stripAccents(norm(f));
  const m = cleaned.match(/\b(?:de|from)\s+(\d{1,2})\s*h?\s+(?:a|à|to|-)\s+(\d{1,2})\s*h?\b/);
  if (m) {
    return { start: parseInt(m[1], 10), end: parseInt(m[2], 10) };
  }
  return null;
}

function parseHours(text: string): number {
  const f = norm(text);
  const h = f.match(/(\d+(?:[.,]\d+)?)\s*(?:h(?:eures?|ours?|rs?)?|heures?|hours?)\b/i);
  if (h) return parseFloat(h[1].replace(',', '.'));
  const min = f.match(/(\d+)\s*(?:min|minutes?)\b/i);
  if (min) return Math.round((parseInt(min[1], 10) / 60) * 10) / 10;
  return 1;
}

export function parseCommand(input: string, lang: Lang): Intent {
  const raw = input.trim();
  const f = stripAccents(norm(raw));

  if (!raw) return { action: 'unknown', text: raw };

  if (/\b(aide|help|commandes|commands)\b/.test(f)) return { action: 'help' };

  if (/\b(mes cours|my courses|liste des cours|list courses)\b/.test(f))
    return { action: 'list_courses' };

  if (/\b(planning|plan)\b/.test(f) && /\b(semaine|week|hebdo)\b/.test(f))
    return { action: 'week' };
  if (/\b(planning|plan)\b/.test(f) && /\b(jour|today|aujourd|day)\b/.test(f))
    return { action: 'today' };

  // Contrainte / indisponibilité
  if (
    /\b(contrainte|indispo|indisponible|occupe|occupé|rendez-?vous|rdv|stage|conge|congé|constraint|busy|unavailable|appointment|holiday|off)\b/.test(
      f
    )
  ) {
    const range = parseRange(raw, lang);
    const hours = parseHourRange(raw);
    const allDay = !hours || /\b(toute la journee|toute la journée|all day|journee complete)\b/.test(f);
    if (range) {
      return {
        action: 'add_constraint',
        date: range.start,
        endDate: range.end,
        allDay: true,
        startHour: 0,
        endHour: 24,
      };
    }
    const date = parseDate(raw, lang);
    if (date) {
      return {
        action: 'add_constraint',
        date,
        endDate: null,
        allDay,
        startHour: hours ? hours.start : 0,
        endHour: hours ? hours.end : 24,
      };
    }
  }

  // Déplacer un cours
  if (/\b(deplacer|deplace|move|reporter|report)\b/.test(f)) {
    const date = parseDate(raw, lang);
    if (date) {
      // nom = mot(s) après le verbe, avant préposition de date
      const m = raw.match(
        /(?:déplacer|deplacer|déplace|deplace|move|reporter|report)\s+(?:le cours\s+|cours\s+|course\s+)?(.+?)\s+(?:au|vers|à|a|to|le|on|du)\b/i
      );
      const name = m ? m[1].trim() : '';
      if (name) return { action: 'move_course', name, toDate: date };
    }
  }

  // Ajouter un cours
  if (/\b(ajouter|ajoute|add|nouveau cours|new course|creer|créer|create)\b/.test(f)) {
    const hours = parseHours(raw);
    const startDate = parseDate(raw, lang);
    // Nom : entre le verbe et « avec / X heures / démarrage / start »
    let name = '';
    const m = raw.match(
      /(?:ajouter|ajoute|add|créer|creer|create)\s+(?:le cours\s+|cours\s+|course\s+)?(.+?)(?=\s+(?:avec|with|\d|démarrage|demarrage|start|le\b|on\b)|$)/i
    );
    if (m) name = m[1].trim();
    name = name.replace(/[«»"'"]/g, '').trim();
    if (name) {
      return { action: 'add_course', name, hours, startDate: startDate || null };
    }
  }

  return { action: 'unknown', text: raw };
}
