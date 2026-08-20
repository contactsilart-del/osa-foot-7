/**
 * Contenu par défaut du site OSA FOOT 7.
 *
 * C'est l'unique source de vérité tant qu'aucune modification n'a été
 * enregistrée depuis le panel d'administration. Dès qu'un contenu existe en
 * base (Cloudflare D1), l'API `/api/content` le renvoie et il remplace
 * intégralement cet objet.
 *
 * Toute modification faite ici est donc un « reset usine » : elle ne réapparaît
 * sur le site que si la base est vide (ou après un « Réinitialiser » dans l'admin).
 */

/** @typedef {{name: string, logo: string}} Team */

export const DEFAULT_CONTENT = {
  club: {
    name: 'OSA FOOT 7',
    tagline: 'Olympique Saint-Affrique',
    logo: '/img/osa.png',
    email: 'contact@osafoot7.fr',
    address: '21 Rte du Stade, 81290 Saint-Affrique-les-Montagnes',
    facebook: 'https://www.facebook.com/osafoot7',
    instagram: 'https://www.instagram.com/olympique.saint.affrique/',
    copyrightYear: '2026'
  },


  /**
   * Mentions légales. Les valeurs vides laissent apparaître la mention
   * « À compléter » sur la page : c'est le signal qu'il reste à les renseigner
   * depuis l'onglet « Mentions légales » de l'administration.
   */
  legal: {
    entity: 'OSA FOOT 7 — Olympique Saint-Affrique',
    status: 'Association loi 1901',
    address: '',
    rna: '',
    siren: '',
    director: '',
    email: '',            // vide → on retombe automatiquement sur club.email
    updated: 'Janvier 2026'
  },

  nextMatch: {
    competition: 'Championnat UFOLEP — Foot à 7',
    home: { name: 'OSA', logo: '/img/osa.png' },
    away: { name: 'Cambon', logo: '/img/cambon.png' },
    /** Date ISO 8601 avec fuseau horaire. Modifiable depuis l'admin. */
    kickoff: '2026-09-05T20:30:00+02:00',
    venue: 'Stade de Saint-Affrique-les-Montagnes'
  },

  /**
   * Le stade, avec sa carte. `mapsEmbed` est l'adresse d'intégration fournie
   * par Google (bouton « Partager » → « Intégrer une carte ») : seul le lien,
   * pas le code de l'iframe. Vide = la section affiche l'adresse sans carte.
   */
  venue: {
    title: 'Notre stade',
    subtitle: 'C’est ici qu’on joue à domicile. Venez nous voir, l’entrée est libre.',
    name: 'Stade de Saint-Affrique-les-Montagnes',
    mapsEmbed: 'https://www.google.com/maps/embed?pb=!4v1787216107105!6m8!1m7!1swks-0fh3G_gcwxZo6v61Lw!2m2!1d43.53481788434512!2d2.212477912054208!3f245.89353672967366!4f4.870021632036583!5f0.7820865974627469'
  },

  news: [
    {
      id: 'cambon-coupe',
      title: 'Victoire éclatante !',
      excerpt: "L'équipe s'impose avec brio et se qualifie pour le tour suivant.",
      body: "L'équipe a réalisé une performance XXL ce week-end en coupe. Menés par un doublé de Joris dès l'entame (5' et 12'), les hommes de l'OSA n'ont jamais tremblé. Keks a enfoncé le clou avec deux nouvelles réalisations (33' et 55'), avant qu'un but contre son camp adverse ne vienne parachever la démonstration à la 68e. Un 5-1 à l'extérieur qui envoie un message clair à toute la compétition.",
      image: '/img/match-7.jpg',
      competition: 'Coupe',
      opponent: 'Cambon 2',
      venue: 'away',
      score: { osa: 5, opponent: 1 },
      scorers: ["Joris 5'", "Joris 12'", "Keks 33'", "Keks 55'", "CSC 68'"],
      date: ''
    },
    {
      id: 'carlus-j5',
      title: 'Déplacement amer',
      excerpt: 'Un match compliqué à Carlus, sanctionné par une lourde addition.',
      body: "Défaite 3-1 à Carlus lors de la 5e journée. Malgré une réduction du score signée Claude juste avant la pause (45'), l'OSA n'a jamais réussi à renverser la vapeur. Trop d'espaces concédés dans l'entrejeu et un manque de réalisme dans les 30 derniers mètres : ce match laisse un goût d'inachevé. Il faudra vite se remobiliser.",
      image: '/img/match-3.jpg',
      competition: '5e journée',
      opponent: 'Carlus',
      venue: 'away',
      score: { osa: 1, opponent: 3 },
      scorers: ["Claude 45'"],
      date: ''
    },
    {
      id: 'serenac-j4',
      title: 'Frustration à domicile',
      excerpt: 'Il a manqué le petit plus devant le but.',
      body: "Défaite 1-0 à domicile face à Sérénac pour cette 4e journée. Le scénario le plus cruel : une équipe qui pousse, qui occupe le camp adverse, mais qui bute sur un bloc bien organisé. Il a manqué un peu de confiance et d'envie devant le but. Le contenu est là, le résultat viendra.",
      image: '/img/match-1.jpg',
      competition: '4e journée',
      opponent: 'Sérénac',
      venue: 'home',
      score: { osa: 0, opponent: 1 },
      scorers: [],
      date: ''
    },
    {
      id: 'escoussens-j3',
      title: 'Escoussens',
      excerpt: 'Le score ne reflète pas la physionomie du match.',
      body: "Défaite 3-1 à Escoussens lors de la 3e journée. Val avait pourtant lancé les hostilités dès la 8e minute. Malgré le score final, l'équipe a montré du jeu et de l'envie face à un adversaire redoutable à domicile. Des enseignements à tirer, mais aucune raison de baisser la tête.",
      image: '/img/match-4.jpg',
      competition: '3e journée',
      opponent: 'Escoussens',
      venue: 'away',
      score: { osa: 1, opponent: 3 },
      scorers: ["Val 8'"],
      date: ''
    },
    {
      id: 'berlats-coupe',
      title: 'Festival offensif',
      excerpt: 'Pluie de buts à Berlats !',
      body: "Victoire 5-1 à Berlats en coupe. Cinq buteurs différents : Claude (25'), Samy (32'), Julien (63'), Silas (65') et Noan (68'). Une belle victoire construite collectivement, avec un pressing haut et des transitions tranchantes. Super performance collective, et une ambiance de fin de match qui restera dans les mémoires du vestiaire.",
      image: '/img/match-2.jpg',
      competition: 'Coupe',
      opponent: 'Berlats',
      venue: 'away',
      score: { osa: 5, opponent: 1 },
      scorers: ["Claude 25'", "Samy 32'", "Julien 63'", "Silas 65'", "Noan 68'"],
      date: ''
    },
    {
      id: 'lo-capial-j2',
      title: 'Nul intense',
      excerpt: 'Un combat de tous les instants.',
      body: "Match nul 2-2 à domicile face à Lo Capial St-Juéry pour la 2e journée. Keks ouvre le score à la 30e, Val double la mise à la 55e, mais l'adversaire revient dans les dernières minutes. Un match très disputé, intense physiquement, où les deux équipes ont tout donné. Un point qui se prend, même si le goût est un peu amer.",
      image: '/img/match-6.jpg',
      competition: '2e journée',
      opponent: 'Lo Capial St-Juéry',
      venue: 'home',
      score: { osa: 2, opponent: 2 },
      scorers: ["Keks 30'", "Val 55'"],
      date: ''
    }
  ],

  /**
   * Effectif. Toutes les valeurs ci-dessous sont des repères de départ,
   * destinés à être ajustés depuis l'onglet « Effectif » de l'administration :
   * l'âge est laissé à 0 (la ligne se masque alors), et les notes sont des
   * estimations, pas des mesures.
   */
  squad: {
    title: "L'effectif",
    subtitle: 'Les joueurs qui font vivre l\'OSA cette saison.',
    players: [
      {
        id: 'keks',
        firstName: 'Keks', lastName: '',
        photo: '/img/keks.jpg',
        age: 0, nationality: 'France', position: 'ATT', since: 2022,
        weakFoot: 3, skillMoves: 3,
        ratings: { pace: 78, dribbling: 74, shooting: 84, passing: 66, defending: 40, physical: 72 },
        description: "Le renard des surfaces. Toujours au bon endroit au bon moment : meilleur buteur du groupe, avec un sens du placement qui fait la différence dans les seize mètres.",
        marketValue: '240 000 €'
      },
      {
        id: 'silas',
        firstName: 'Silas', lastName: 'Clamens Albert',
        photo: '/img/silas.jpg',
        age: 0, nationality: 'France', position: 'MIL', since: 2021,
        weakFoot: 4, skillMoves: 4,
        ratings: { pace: 74, dribbling: 79, shooting: 70, passing: 81, defending: 58, physical: 64 },
        description: "Relayeur créatif, à l'aise des deux pieds. Casse les lignes par la passe et se projette volontiers pour finir l'action.",
        marketValue: '210 000 €'
      },
      {
        id: 'claude',
        firstName: 'Claude', lastName: '',
        photo: '/img/claude.jpg',
        age: 0, nationality: 'France', position: 'ATT', since: 2023,
        weakFoot: 3, skillMoves: 3,
        ratings: { pace: 80, dribbling: 73, shooting: 76, passing: 63, defending: 38, physical: 66 },
        description: "Attaquant de profondeur. Prend systématiquement l'espace dans le dos de la défense et pèse sur les derniers défenseurs.",
        marketValue: '185 000 €'
      },
      {
        id: 'vale',
        firstName: 'Valé', lastName: '',
        photo: '/img/val.jpg',
        age: 0, nationality: 'France', position: 'MIL', since: 2020,
        weakFoot: 4, skillMoves: 3,
        ratings: { pace: 69, dribbling: 75, shooting: 64, passing: 84, defending: 62, physical: 61 },
        description: "Le métronome de l'entrejeu. Meilleur passeur de la saison, il dicte le tempo et trouve toujours la solution la plus simple.",
        marketValue: '225 000 €'
      },
      {
        id: 'noan',
        firstName: 'Noan', lastName: '',
        photo: '/img/noan.jpg',
        age: 0, nationality: 'France', position: 'MIL', since: 2023,
        weakFoot: 3, skillMoves: 4,
        ratings: { pace: 82, dribbling: 78, shooting: 68, passing: 74, defending: 52, physical: 58 },
        description: "Ailier percutant, très difficile à cadrer en un contre un. Sa vitesse déséquilibre les blocs bas.",
        marketValue: '195 000 €'
      },
      {
        id: 'joris',
        firstName: 'Joris', lastName: '',
        photo: '/img/joris.jpg',
        age: 0, nationality: 'France', position: 'ATT', since: 2022,
        weakFoot: 2, skillMoves: 3,
        ratings: { pace: 77, dribbling: 71, shooting: 79, passing: 65, defending: 41, physical: 69 },
        description: "Buteur opportuniste, auteur d'un doublé en coupe. Frappe sans se poser de questions dès que l'angle s'ouvre.",
        marketValue: '175 000 €'
      },
      {
        id: 'pierre',
        firstName: 'Pierre', lastName: '',
        photo: '/img/pierre.jpg',
        age: 0, nationality: 'France', position: 'DEF', since: 2019,
        weakFoot: 2, skillMoves: 2,
        ratings: { pace: 62, dribbling: 55, shooting: 45, passing: 64, defending: 80, physical: 78 },
        description: "Patron de la défense, présent depuis les débuts de l'équipe. Un CSC au compteur, et tout le vestiaire qui le lui rappelle.",
        marketValue: '160 000 €'
      },
      {
        id: 'samy',
        firstName: 'Samy', lastName: '',
        photo: '',
        age: 0, nationality: 'France', position: 'MIL', since: 2024,
        weakFoot: 3, skillMoves: 3,
        ratings: { pace: 72, dribbling: 70, shooting: 66, passing: 72, defending: 60, physical: 63 },
        description: "Milieu polyvalent, capable de dépanner à tous les postes de l'entrejeu.",
        marketValue: '120 000 €'
      },
      {
        id: 'julien',
        firstName: 'Julien', lastName: '',
        photo: '',
        age: 0, nationality: 'France', position: 'DEF', since: 2024,
        weakFoot: 2, skillMoves: 2,
        ratings: { pace: 66, dribbling: 54, shooting: 50, passing: 61, defending: 74, physical: 73 },
        description: "Défenseur solide sur l'homme, qui n'hésite pas à monter sur coup de pied arrêté.",
        marketValue: '110 000 €'
      }
    ]
  },

  calendar: {
    title: 'Calendrier & Résultats',
    subtitle: "Toutes les journées de la saison en un coup d'œil.",
    /** Vide → le site affiche l'état « bientôt disponible ». */
    images: []
  },

  standings: {
    title: 'Classement',
    subtitle: "La position de l'OSA dans la poule, mise à jour après chaque journée.",
    /** Une ou plusieurs captures du classement, téléversées depuis l'admin. */
    images: []
  },

  /** Galerie photo : alimentée depuis l'onglet « Galerie » de l'administration. */
  gallery: {
    title: 'Galerie',
    subtitle: "Les moments du club, match après match. Cliquez sur une photo pour l'agrandir.",
    images: []
  },

  /**
   * Les classements ne listent plus de noms : ils comptent les joueurs de
   * l'effectif, par identifiant. Ajouter, renommer ou supprimer une fiche dans
   * l'onglet Effectif se répercute donc partout, sans double saisie.
   */
  stats: {
    season: '2025 / 2026',
    groups: [
      { id: 'scorers',   title: 'Meilleurs buteurs',    unit: 'buts',        accent: 'gold',  icon: 'ball',  values: {} },
      { id: 'assists',   title: 'Meilleurs passeurs',   unit: 'passes déc.', accent: 'blue',  icon: 'boot',  values: {} },
      { id: 'owngoals',  title: 'Contre son camp',      unit: 'CSC',         accent: 'red',   icon: 'oops',  values: {} },
      { id: 'penalties', title: 'Penaltys concédés',    unit: 'penaltys',    accent: 'red',   icon: 'card',  values: {} },
      { id: 'caps',      title: 'Matchs joués',         unit: 'matchs',      accent: 'blue',  icon: 'shirt', values: {} },
      { id: 'training',  title: "Présence à l'entraînement", unit: 'séances', accent: 'green', icon: 'check', values: {} },
      { id: 'freekicks', title: 'Buts sur coup franc',   unit: 'buts',     accent: 'gold',  icon: 'ball',  values: {} },
      { id: 'penaltygoals', title: 'Buts sur penalty',   unit: 'buts',     accent: 'gold',  icon: 'ball',  values: {} },
      // Le seul classement réservé à un poste : les arrêts ne concernent que le but.
      { id: 'saves',     title: 'Arrêts',                unit: 'arrêts',   accent: 'blue',  icon: 'glove', values: {}, only: 'GB' }
    ]
  }
};

/**
 * Version du modèle de contenu. Le serveur l'estampille à chaque
 * enregistrement ; un document plus ancien passe par `migrateContent`.
 */
export const SCHEMA_VERSION = 4;

/**
 * v1 → v2 : les classements listaient des noms libres, sans lien avec
 * l'effectif. Ils comptent désormais les joueurs par identifiant, et les
 * anciens compteurs repartent de zéro — c'est ce qui a été demandé.
 */
function toV2(content) {
  content.stats = {
    ...content.stats,
    groups: cloneContent(DEFAULT_CONTENT.stats.groups)
  };
  return content;
}

/**
 * v2 → v3 : trois classements s'ajoutent (coup franc, penalty, arrêts). Cette
 * fois les compteurs déjà saisis sont conservés : on complète la liste au lieu
 * de la remplacer, et un classement supprimé exprès ne revient pas.
 */
function toV3(content) {
  const groups = Array.isArray(content.stats?.groups) ? content.stats.groups : [];
  const connus = new Set(groups.map((group) => group?.id));
  const ajouts = DEFAULT_CONTENT.stats.groups.filter(
    (group) => ['freekicks', 'penaltygoals', 'saves'].includes(group.id) && !connus.has(group.id)
  );
  content.stats = { ...content.stats, groups: [...groups, ...cloneContent(ajouts)] };
  return content;
}

/**
 * Les cinq cartes légendaires demandées par le club. La liste ne sert qu'une
 * fois, à la migration : ensuite, c'est la case « Carte légendaire » de
 * l'administration qui fait foi, et en ajouter ou en retirer se fait là.
 */
const LEGENDES_INITIALES = ['vale', 'noan', 'joris', 'stephane-ruiz', 'patrice-calmettes'];

/** v3 → v4 : les légendaires sont désignées à la main, plus par la note. */
function toV4(content) {
  const players = Array.isArray(content.squad?.players) ? content.squad.players : [];
  content.squad = {
    ...content.squad,
    players: players.map((player) => ({
      ...player,
      legendary: player?.legendary === true || LEGENDES_INITIALES.includes(player?.id)
    }))
  };
  return content;
}

/**
 * Met à niveau un document enregistré avant la version courante. Les étapes
 * s'enchaînent : un document v1 passe par toutes.
 */
export function migrateContent(stored) {
  if (!stored || typeof stored !== 'object') return stored;
  const version = Number(stored.version) || 1;
  if (version >= SCHEMA_VERSION) return stored;

  let migrated = cloneContent(stored);
  if (version < 2) migrated = toV2(migrated);
  if (version < 3) migrated = toV3(migrated);
  if (version < 4) migrated = toV4(migrated);
  // Estampiller évite de rejouer la migration à chaque rendu de la page.
  migrated.version = SCHEMA_VERSION;
  return migrated;
}

/** Copie profonde sûre (structuredClone n'est pas garanti sur tous les navigateurs cibles). */
export function cloneContent(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Fusion profonde : les valeurs de `patch` écrasent celles de `base`, les clés
 * absentes de `patch` conservent celles de `base`.
 *
 * Indispensable des deux côtés : un champ ajouté au modèle après le dernier
 * enregistrement doit apparaître rempli, et non pas vide — sinon le prochain
 * « Enregistrer » le persisterait vide.
 */
export function deepMerge(base, patch) {
  if (Array.isArray(patch)) return cloneContent(patch);
  if (patch === null || typeof patch !== 'object') return patch === undefined ? base : patch;
  const out = (base && typeof base === 'object' && !Array.isArray(base)) ? { ...base } : {};
  for (const [key, value] of Object.entries(patch)) {
    out[key] = deepMerge(out[key], value);
  }
  return out;
}
