/**
 * Validation / normalisation du document de contenu.
 *
 * Objectif : ne jamais stocker que des données dont la forme est connue. Tout ce
 * qui sort du schéma est ignoré, tronqué ou remplacé par une valeur sûre — le
 * front n'a donc jamais à se défendre contre un contenu inattendu.
 */

const LIMITS = {
  news: 24,
  scorers: 20,
  calendarImages: 24,
  statGroups: 6,
  players: 24,
  body: 8000,
  short: 160,
  medium: 400
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function str(value, max = LIMITS.short) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function int(value, min, max, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return clamp(Math.round(number), min, max);
}

function arr(value, max, mapper) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, max).map(mapper).filter(Boolean);
}

/**
 * Chemin d'image accepté : une ressource servie par ce site uniquement.
 * (La CSP bloque de toute façon les images distantes ; on refuse donc
 * explicitement `javascript:`, `data:` et les URL externes.)
 */
function imagePath(value) {
  const path = str(value, 300);
  if (!path.startsWith('/') || path.startsWith('//')) return '';
  return path;
}

/** URL externe acceptée pour les réseaux sociaux : http(s) uniquement. */
function externalUrl(value) {
  const raw = str(value, 300);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function email(value) {
  const raw = str(value, 160).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw) ? raw : '';
}

/** Date ISO 8601 valide, ou chaîne vide. */
function isoDate(value) {
  const raw = str(value, 40);
  if (!raw) return '';
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? '' : raw;
}

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

/** Année ou plage d'années : « 2026 » ou « 2025–2026 ». Sinon, année courante. */
function copyrightYear(value) {
  const digits = str(value, 40).replace(/[^0-9–-]/g, '').slice(0, 9);
  return /^\d{4}(\s*[–-]\s*\d{4})?$/.test(digits) ? digits : String(new Date().getFullYear());
}

function team(value) {
  return {
    name: str(value?.name, 60) || 'Équipe',
    logo: imagePath(value?.logo) || '/img/osa.png'
  };
}

/** Identifiant stable, en kebab-case. */
function slug(value, fallback) {
  const base = str(value, 60)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || fallback;
}

/* ──────────────────────────────────────── Sections ── */

function sanitizeClub(input = {}) {
  return {
    name: str(input.name, 60) || 'OSA FOOT 7',
    tagline: str(input.tagline, 90) || 'Olympique Saint-Affrique',
    logo: imagePath(input.logo) || '/img/osa.png',
    email: email(input.email),
    address: str(input.address, 160),
    facebook: externalUrl(input.facebook),
    instagram: externalUrl(input.instagram),
    copyrightYear: copyrightYear(input.copyrightYear)
  };
}

function sanitizeLegal(input = {}) {
  return {
    entity: str(input.entity, 120),
    status: str(input.status, 90),
    address: str(input.address, 200),
    rna: str(input.rna, 40),
    siren: str(input.siren, 40),
    director: str(input.director, 90),
    email: email(input.email),
    updated: str(input.updated, 40)
  };
}

function sanitizeNextMatch(input = {}) {
  return {
    competition: str(input.competition, 90),
    home: team(input.home),
    away: team(input.away),
    kickoff: isoDate(input.kickoff),
    venue: str(input.venue, 160)
  };
}

function sanitizeNewsItem(input, index) {
  if (!input || typeof input !== 'object') return null;
  const title = str(input.title, 120);
  if (!title) return null;

  const hasScore =
    input.score && Number.isFinite(Number(input.score.osa)) && Number.isFinite(Number(input.score.opponent));

  return {
    id: slug(input.id || title, `actu-${index + 1}`),
    title,
    excerpt: str(input.excerpt, LIMITS.medium),
    body: str(input.body, LIMITS.body),
    image: imagePath(input.image),
    competition: str(input.competition, 60),
    opponent: str(input.opponent, 60),
    venue: oneOf(input.venue, ['home', 'away'], 'home'),
    score: hasScore
      ? { osa: int(input.score.osa, 0, 99), opponent: int(input.score.opponent, 0, 99) }
      : null,
    scorers: arr(input.scorers, LIMITS.scorers, (entry) => str(entry, 60) || null),
    date: isoDate(input.date)
  };
}

/**
 * Section faite d'images légendées : calendrier, classement. Une liste vide est
 * parfaitement valide — le site affiche alors son état « bientôt disponible ».
 */
function sanitizeImageSection(input = {}, fallbackTitle) {
  return {
    title: str(input.title, 90) || fallbackTitle,
    subtitle: str(input.subtitle, LIMITS.medium),
    images: arr(input.images, LIMITS.calendarImages, (image) => {
      const src = imagePath(image?.src);
      if (!src) return null;
      return {
        src,
        alt: str(image?.alt, LIMITS.short),
        caption: str(image?.caption, 90)
      };
    })
  };
}


function sanitizeStats(input = {}) {
  return {
    season: str(input.season, 30) || '2025 / 2026',
    groups: arr(input.groups, LIMITS.statGroups, (group, index) => {
      const title = str(group?.title, 60);
      if (!title) return null;
      return {
        id: slug(group?.id || title, `groupe-${index + 1}`),
        title,
        unit: str(group?.unit, 30),
        accent: oneOf(group?.accent, ['gold', 'blue', 'red'], 'blue'),
        icon: oneOf(group?.icon, ['ball', 'boot', 'oops'], 'ball'),
        players: arr(group?.players, LIMITS.players, (player) => {
          const name = str(player?.name, 60);
          if (!name) return null;
          return {
            name,
            photo: imagePath(player?.photo),
            value: int(player?.value, 0, 999)
          };
        })
      };
    })
  };
}

/* ─────────────────────────────────────── Document ── */

/**
 * Normalise le document complet reçu depuis l'admin.
 * @throws {Error} si l'entrée n'est pas un objet.
 */
export function sanitizeContent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Le contenu doit être un objet JSON.');
  }
  return {
    club: sanitizeClub(input.club),
    legal: sanitizeLegal(input.legal),
    nextMatch: sanitizeNextMatch(input.nextMatch),
    news: arr(input.news, LIMITS.news, sanitizeNewsItem),
    calendar: sanitizeImageSection(input.calendar, 'Calendrier & Résultats'),
    standings: sanitizeImageSection(input.standings, 'Classement'),
    stats: sanitizeStats(input.stats)
  };
}

/* ──────────────────────────── Formulaire de contact ── */

/**
 * @returns {{ok: true, data: object} | {ok: false, error: string}}
 */
export function sanitizeContactMessage(input) {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Requête invalide.' };
  }

  // Champ piège : rempli uniquement par les robots.
  if (str(input.website, 200)) {
    return { ok: false, error: 'Requête rejetée.' };
  }

  const name = str(input.name, 80);
  const mail = email(input.email);
  const message = str(input.message, 4000);
  const subject = str(input.subject, 90);

  if (name.length < 2) return { ok: false, error: "Merci d'indiquer votre nom." };
  if (!mail) return { ok: false, error: 'Adresse e-mail invalide.' };
  if (message.length < 10) return { ok: false, error: 'Votre message est trop court.' };

  return { ok: true, data: { name, email: mail, subject, message } };
}
