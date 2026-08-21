/**
 * Validation / normalisation du document de contenu.
 *
 * Objectif : ne jamais stocker que des données dont la forme est connue. Tout ce
 * qui sort du schéma est ignoré, tronqué ou remplacé par une valeur sûre — le
 * front n'a donc jamais à se défendre contre un contenu inattendu.
 */

/** Version du modèle : voir `migrateContent` dans public/assets/js/content.js. */
export const SCHEMA_VERSION = 8;

const LIMITS = {
  competitions: 12,
  teams: 40,
  matches: 240,
  palmares: 60,
  spotlights: 4,
  players: 60,
  scorers: 20,
  calendarImages: 24,
  galleryImages: 200,
  statGroups: 14,
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

/**
 * Adresse d'intégration Google Maps. On n'accepte que ce chemin précis : un
 * iframe pointant ailleurs s'exécuterait dans la page, avec tout ce que cela
 * suppose. La CSP l'interdirait de toute façon — ceci en est le pendant côté
 * données.
 */
function mapsEmbedUrl(value) {
  const raw = str(value, 600);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const bonHote = url.protocol === 'https:'
      && (url.hostname === 'www.google.com' || url.hostname === 'maps.google.com');
    return bonHote && url.pathname === '/maps/embed' ? url.toString() : '';
  } catch {
    return '';
  }
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
    address: str(input.address, 200),
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

function sanitizeVenue(input = {}) {
  return {
    title: str(input.title, 90) || 'Notre stade',
    subtitle: str(input.subtitle, LIMITS.medium),
    name: str(input.name, 120),
    mapsEmbed: mapsEmbedUrl(input.mapsEmbed)
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

/* ══════════════════════════════════════ Championnat ══ */

/** Identifiant unique dans une liste : deux clubs homonymes restent distincts. */
function uniqueId(raw, fallback, used) {
  let id = slug(raw, fallback);
  while (used.has(id)) id = `${id}-${used.size + 1}`;
  used.add(id);
  return id;
}

function sanitizeTeam(input, index, used) {
  const name = str(input?.name, 60);
  if (!name) return null;
  return {
    id: uniqueId(input?.id || name, `equipe-${index + 1}`, used),
    name,
    short: str(input?.short, 16) || name.slice(0, 16),
    logo: imagePath(input?.logo),
    // Points de penalite retires au classement (forfait, sanction).
    penalty: int(input?.penalty, 0, 99)
  };
}

/**
 * Une competition : ses clubs, et si elle tient un classement. C'est elle,
 * et non un drapeau sur chaque match, qui decide de ce qui compte.
 */
function sanitizeCompetition(input, index, used) {
  const name = str(input?.name, 60);
  if (!name) return null;

  const vus = new Set();
  return {
    id: uniqueId(input?.id || name, `competition-${index + 1}`, used),
    name,
    standings: input?.standings !== false,
    teamIds: arr(input?.teamIds, LIMITS.teams, (id) => {
      const club = slug(id, '');
      if (!club || vus.has(club)) return null;
      vus.add(club);
      return club;
    })
  };
}

/** Un score vide n'est pas un zero : c'est un match qui n'a pas encore eu lieu. */
function matchScore(value) {
  if (value === null || value === undefined || value === '') return null;
  return Number.isFinite(Number(value)) ? int(value, 0, 99) : null;
}

function sanitizeMatch(input, index, used, competitions) {
  if (!input || typeof input !== 'object') return null;

  // Les identifiants d'equipe sont conserves meme si le club a ete retire du
  // tableau : le remettre restaure le match au lieu de le laisser orphelin.
  const homeId = slug(input.homeId, '');
  const awayId = slug(input.awayId, '');
  if (!homeId && !awayId) return null;

  return {
    id: uniqueId(input.id || input.title || `${homeId}-${awayId}`, `match-${index + 1}`, used),
    day: int(input.day, 0, 99),
    /*
     * Un match rattache a une competition disparue serait invisible partout :
     * on le raccroche a la premiere plutot que de le laisser tomber.
     */
    competitionId: competitions.has(slug(input.competitionId, ''))
      ? slug(input.competitionId, '')
      : (competitions.values().next().value || ''),
    date: isoDate(input.date),
    venue: str(input.venue, 160),
    homeId,
    awayId,
    homeScore: matchScore(input.homeScore),
    awayScore: matchScore(input.awayScore),
    // Volet editorial, facultatif : un match sans titre ne fait pas d'actualite.
    title: str(input.title, 120),
    excerpt: str(input.excerpt, LIMITS.medium),
    body: str(input.body, LIMITS.body),
    image: imagePath(input.image),
    scorers: arr(input.scorers, LIMITS.scorers, (entry) => str(entry, 60) || null)
  };
}

/** « us-autan » → « Us Autan ». Voir `humanizeId` dans league.js. */
function humanize(id) {
  return String(id ?? '').split('-').filter(Boolean)
    .map((mot) => mot.charAt(0).toUpperCase() + mot.slice(1))
    .join(' ');
}

function sanitizeChampionship(input = {}) {
  const equipes = new Set();
  const teams = arr(input.teams, LIMITS.teams, (team, index) => sanitizeTeam(team, index, equipes));

  const nomsCompetitions = new Set();
  const competitions = arr(input.competitions, LIMITS.competitions,
    (competition, index) => sanitizeCompetition(competition, index, nomsCompetitions));

  const rencontres = new Set();
  const matches = arr(input.matches, LIMITS.matches,
    (match, index) => sanitizeMatch(match, index, rencontres, nomsCompetitions));

  /*
   * Un club supprime alors qu'un match ou une competition le cite encore
   * laissait une reference orpheline : le site affichait « — » a sa place, et
   * le classement l'ignorait en silence. On le recree sous un nom devine,
   * visible dans l'administration, ou il n'y a plus qu'a le renommer. Le
   * retirer de ses competitions et de ses matchs le fait disparaitre pour de bon.
   */
  const cites = [
    ...matches.flatMap((match) => [match.homeId, match.awayId]),
    ...competitions.flatMap((competition) => competition.teamIds)
  ];
  for (const id of cites) {
    if (!id || equipes.has(id) || teams.length >= LIMITS.teams) continue;
    equipes.add(id);
    teams.push({ id, name: humanize(id), short: humanize(id).slice(0, 16), logo: '', penalty: 0 });
  }

  return {
    title: str(input.title, 90) || 'Classement',
    subtitle: str(input.subtitle, LIMITS.medium),
    season: str(input.season, 30) || '2025 / 2026',
    homeTeamId: equipes.has(input.homeTeamId) ? input.homeTeamId : (teams[0]?.id || ''),
    // Toutes les poules ne jouent pas en 3-1-0 : le bareme se regle.
    points: {
      win: int(input.points?.win, 0, 10, 3),
      draw: int(input.points?.draw, 0, 10, 1),
      loss: int(input.points?.loss, 0, 10, 0)
    },
    competitions,
    teams,
    matches
  };
}

/* ═════════════════════════════════════════ Palmares ══ */

function sanitizePalmares(input = {}) {
  const used = new Set();
  return {
    title: str(input.title, 90) || 'Palmarès du club',
    subtitle: str(input.subtitle, LIMITS.medium),
    entries: arr(input.entries, LIMITS.palmares, (entry, index) => {
      const title = str(entry?.title, 120);
      if (!title) return null;
      return {
        id: uniqueId(entry?.id || title, `titre-${index + 1}`, used),
        title,
        year: str(entry?.year, 20),
        competition: str(entry?.competition, 90),
        rank: str(entry?.rank, 60),
        description: str(entry?.description, LIMITS.medium),
        image: imagePath(entry?.image),
        // Les lignes mises en avant recoivent le traitement « trophee ».
        highlight: entry?.highlight === true
      };
    })
  };
}

/** Le chant du club. Sans paroles, la section ne s'affiche pas. */
function sanitizeAnthem(input = {}) {
  return {
    title: str(input.title, 90) || 'Le chant du club',
    subtitle: str(input.subtitle, LIMITS.medium),
    lyrics: str(input.lyrics, LIMITS.body)
  };
}

/**
 * Section faite d'images légendées : calendrier, classement. Une liste vide est
 * parfaitement valide — le site affiche alors son état « bientôt disponible ».
 */
function sanitizeImageSection(input = {}, fallbackTitle, max = LIMITS.calendarImages) {
  return {
    title: str(input.title, 90) || fallbackTitle,
    subtitle: str(input.subtitle, LIMITS.medium),
    images: arr(input.images, max, (image) => {
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


/**
 * Les deux jeux de notes sont conservés côte à côte : basculer un joueur de
 * champ au poste de gardien, puis revenir, ne perd rien.
 */
const RATING_KEYS = [
  'pace', 'dribbling', 'shooting', 'passing', 'defending', 'physical',
  'reflexes', 'positioning', 'diving', 'kicking', 'handling', 'speed'
];

/** Effectif : fiches de joueurs façon carte de jeu. */
function sanitizeSquad(input = {}) {
  const used = new Set();

  const players = arr(input.players, LIMITS.players, (player, index) => {
      const firstName = str(player?.firstName, 60);
      const lastName = str(player?.lastName, 60);
      if (!firstName && !lastName) return null;

      // L'identifiant sert d'ancre partageable (/effectif#joueur-keks) :
      // il doit rester unique même si deux joueurs portent le même prénom.
      let id = slug(player?.id || `${firstName}-${lastName}`, `joueur-${index + 1}`);
      while (used.has(id)) id = `${id}-${used.size + 1}`;
      used.add(id);

      const ratings = {};
      for (const key of RATING_KEYS) ratings[key] = int(player?.ratings?.[key], 0, 99);

      return {
        id,
        firstName,
        lastName,
        photo: imagePath(player?.photo),
        age: int(player?.age, 0, 120),
        nationality: str(player?.nationality, 60),
        position: oneOf(player?.position, ['GB', 'DEF', 'MIL', 'ATT', 'COACH'], 'MIL'),
        since: int(player?.since, 0, 2200),
        // 0 = pas de numero attribue : la pastille disparait de la carte.
        number: int(player?.number, 0, 99),
        weakFoot: int(player?.weakFoot, 0, 5),
        skillMoves: int(player?.skillMoves, 0, 5),
        partner: str(player?.partner, 60),
        // Carte légendaire : un choix éditorial, indépendant de la note.
        legendary: player?.legendary === true,
        ratings,
        // 0 = pas de note imposée : le site retombe sur la moyenne des six notes.
        overall: int(player?.overall, 0, 99),
        description: str(player?.description, LIMITS.body),
        marketValue: str(player?.marketValue, 40)
      };
  });

  // Une mise en avant qui designe une fiche supprimee n'a plus de sens.
  const connus = new Set(players.map((player) => player.id));

  return {
    title: str(input.title, 90) || "L'effectif",
    subtitle: str(input.subtitle, LIMITS.medium),
    spotlights: arr(input.spotlights, LIMITS.spotlights, (spot) => {
      const playerId = slug(spot?.playerId, '');
      if (!playerId || !connus.has(playerId)) return null;
      return {
        playerId,
        label: str(spot?.label, 40) || 'En forme',
        reason: str(spot?.reason, LIMITS.medium)
      };
    }),
    players
  };
}

/**
 * Classements de la saison. Chaque groupe compte les joueurs de l'effectif par
 * identifiant : `playerIds` sert à écarter les compteurs devenus orphelins
 * après la suppression d'une fiche.
 */
function sanitizeStats(input = {}, playerIds = null) {
  return {
    season: str(input.season, 30) || '2025 / 2026',
    groups: arr(input.groups, LIMITS.statGroups, (group, index) => {
      const title = str(group?.title, 60);
      if (!title) return null;

      const values = {};
      const raw = group?.values;
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        for (const [key, value] of Object.entries(raw).slice(0, LIMITS.players)) {
          const id = slug(key, '');
          // Un compteur sans joueur en face n'a plus de sens : on le jette.
          if (!id || (playerIds && !playerIds.has(id))) continue;
          const count = int(value, 0, 999);
          if (count) values[id] = count;
        }
      }

      return {
        id: slug(group?.id || title, `groupe-${index + 1}`),
        title,
        unit: str(group?.unit, 30),
        accent: oneOf(group?.accent, ['gold', 'blue', 'red', 'green'], 'blue'),
        icon: oneOf(group?.icon, ['ball', 'boot', 'oops', 'card', 'shirt', 'check', 'glove'], 'ball'),
        // Vide = tout l'effectif. Sinon, seul ce poste figure au classement.
        only: oneOf(group?.only, ['GB', 'DEF', 'MIL', 'ATT', 'COACH'], ''),
        values
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
  const squad = sanitizeSquad(input.squad);
  const playerIds = new Set(squad.players.map((player) => player.id));

  return {
    /**
     * Estampille du modèle. Elle est **reprise telle quelle**, jamais imposée :
     * seul le client qui a réellement appliqué les migrations sait à quelle
     * version le contenu se trouve. La forcer ici marquerait « à jour » un
     * document enregistré depuis un onglet resté sur l'ancien code — et les
     * migrations manquantes ne seraient jamais rejouées.
     */
    version: int(input.version, 0, 99),
    club: sanitizeClub(input.club),
    legal: sanitizeLegal(input.legal),
    nextMatch: sanitizeNextMatch(input.nextMatch),
    venue: sanitizeVenue(input.venue),
    championship: sanitizeChampionship(input.championship),
    squad,
    palmares: sanitizePalmares(input.palmares),
    anthem: sanitizeAnthem(input.anthem),
    calendar: sanitizeImageSection(input.calendar, 'Calendrier & Résultats'),
    gallery: sanitizeImageSection(input.gallery, 'Galerie', LIMITS.galleryImages),
    stats: sanitizeStats(input.stats, playerIds)
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
