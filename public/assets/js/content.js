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

/**
 * Version du modèle de contenu. Un document enregistré sous une version
 * antérieure passe par `migrateContent` avant d'être affiché ou réenregistré.
 */
export const SCHEMA_VERSION = 8;

export const DEFAULT_CONTENT = {
  /*
   * Le contenu par défaut est déjà à la version courante : sans cette
   * estampille, une première installation produirait un document sans version,
   * que le serveur refuserait d'enregistrer comme il refuse un onglet périmé.
   */
  version: SCHEMA_VERSION,
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

  /**
   * Le championnat : les clubs de la poule et tous les matchs de la saison.
   *
   * C’est la seule saisie du site pour tout ce qui touche aux résultats.
   * Le classement s’en déduit, la forme du moment aussi, la page Résultats
   * les affiche journée par journée, et un match encore à jouer devient
   * l’affiche de la page d’accueil, celle sur laquelle les supporters
   * pronostiquent. Corriger un score corrige donc tout le site d’un coup.
   */
  championship: {
    title: 'Classement',
    subtitle: 'Le classement de la poule, recalculé à chaque résultat saisi.',
    season: '2025 / 2026',
    /** Notre équipe : sa ligne est mise en valeur dans le tableau. */
    homeTeamId: 'osa',
    /** Barème de points : toutes les poules ne jouent pas en 3-1-0. */
    points: { win: 3, draw: 1, loss: 0 },
    /**
     * Les compétitions de la saison. Chacune a ses clubs et, si on le demande,
     * son propre classement — le championnat et la coupe n'opposent pas les
     * mêmes équipes, et n'ont donc rien à faire dans le même tableau.
     *
     * `standings: false` pour les amicaux : on les joue, on ne les compte pas.
     */
    competitions: [
      {
        id: 'championnat',
        name: 'Championnat D2 UFOLEP',
        standings: true,
        teamIds: ['osa', 'carlus', 'serenac', 'escoussens', 'lo-capial-st-juery', 'cambon']
      },
      {
        id: 'coupe',
        name: 'Coupe',
        standings: true,
        teamIds: ['osa', 'cambon-2', 'berlats']
      },
      {
        id: 'amicaux',
        name: 'Matchs amicaux',
        standings: false,
        teamIds: ['osa']
      }
    ],

    /** Catalogue des clubs. L'appartenance à une compétition se règle ci-dessus. */
    teams: [
      { id: 'osa', name: 'OSA FOOT 7', short: 'OSA', logo: '/img/osa.png', penalty: 0 },
      { id: 'cambon-2', name: 'Cambon 2', short: 'Cambon 2', logo: '', penalty: 0 },
      { id: 'carlus', name: 'Carlus', short: 'Carlus', logo: '', penalty: 0 },
      { id: 'serenac', name: 'Sérénac', short: 'Sérénac', logo: '', penalty: 0 },
      { id: 'escoussens', name: 'Escoussens', short: 'Escoussens', logo: '', penalty: 0 },
      { id: 'berlats', name: 'Berlats', short: 'Berlats', logo: '', penalty: 0 },
      { id: 'lo-capial-st-juery', name: 'Lo Capial St-Juéry', short: 'Lo Capial', logo: '', penalty: 0 },
      { id: 'cambon', name: 'Cambon', short: 'Cambon', logo: '/img/cambon.png', penalty: 0 }
    ],
    /**
     * Un match dont les deux scores sont vides est un match à venir. Les
     * champs éditoriaux (titre, texte, photo) sont facultatifs : un match sans
     * titre figure aux résultats sans apparaître dans les actualités.
     *
     * `competitionId` dit où il compte. C'est lui, et non un drapeau posé sur
     * le match, qui décide s'il pèse sur un classement.
     */
    matches: [
      {
        id: 'osa-cambon-j6',
        day: 6,
        competitionId: 'championnat',
        date: '2026-09-05T20:30:00+02:00',
        venue: 'Stade de Saint-Affrique-les-Montagnes',
        homeId: 'osa', awayId: 'cambon',
        homeScore: null, awayScore: null,
        title: '', excerpt: '', body: '', image: '',
        scorers: []
      },
      {
        id: 'cambon-coupe',
        day: 0,
        competitionId: 'coupe',
        date: '',
        venue: '',
        homeId: 'cambon-2', awayId: 'osa',
        homeScore: 1, awayScore: 5,
        title: 'Victoire éclatante !',
        excerpt: "L'équipe s'impose avec brio et se qualifie pour le tour suivant.",
        body: "L'équipe a réalisé une performance XXL ce week-end en coupe. Menés par un doublé de Joris dès l'entame (5' et 12'), les hommes de l'OSA n'ont jamais tremblé. Keks a enfoncé le clou avec deux nouvelles réalisations (33' et 55'), avant qu'un but contre son camp adverse ne vienne parachever la démonstration à la 68e. Un 5-1 à l'extérieur qui envoie un message clair à toute la compétition.",
        image: '/img/match-7.jpg',
        scorers: ["Joris 5'", "Joris 12'", "Keks 33'", "Keks 55'", "CSC 68'"],
      },
      {
        id: 'carlus-j5',
        day: 5,
        competitionId: 'championnat',
        date: '',
        venue: '',
        homeId: 'carlus', awayId: 'osa',
        homeScore: 3, awayScore: 1,
        title: 'Déplacement amer',
        excerpt: 'Un match compliqué à Carlus, sanctionné par une lourde addition.',
        body: "Défaite 3-1 à Carlus lors de la 5e journée. Malgré une réduction du score signée Claude juste avant la pause (45'), l'OSA n'a jamais réussi à renverser la vapeur. Trop d'espaces concédés dans l'entrejeu et un manque de réalisme dans les 30 derniers mètres : ce match laisse un goût d'inachevé. Il faudra vite se remobiliser.",
        image: '/img/match-3.jpg',
        scorers: ["Claude 45'"],
      },
      {
        id: 'serenac-j4',
        day: 4,
        competitionId: 'championnat',
        date: '',
        venue: '',
        homeId: 'osa', awayId: 'serenac',
        homeScore: 0, awayScore: 1,
        title: 'Frustration à domicile',
        excerpt: 'Il a manqué le petit plus devant le but.',
        body: "Défaite 1-0 à domicile face à Sérénac pour cette 4e journée. Le scénario le plus cruel : une équipe qui pousse, qui occupe le camp adverse, mais qui bute sur un bloc bien organisé. Il a manqué un peu de confiance et d'envie devant le but. Le contenu est là, le résultat viendra.",
        image: '/img/match-1.jpg',
        scorers: [],
      },
      {
        id: 'escoussens-j3',
        day: 3,
        competitionId: 'championnat',
        date: '',
        venue: '',
        homeId: 'escoussens', awayId: 'osa',
        homeScore: 3, awayScore: 1,
        title: 'Escoussens',
        excerpt: 'Le score ne reflète pas la physionomie du match.',
        body: "Défaite 3-1 à Escoussens lors de la 3e journée. Val avait pourtant lancé les hostilités dès la 8e minute. Malgré le score final, l'équipe a montré du jeu et de l'envie face à un adversaire redoutable à domicile. Des enseignements à tirer, mais aucune raison de baisser la tête.",
        image: '/img/match-4.jpg',
        scorers: ["Val 8'"],
      },
      {
        id: 'berlats-coupe',
        day: 0,
        competitionId: 'coupe',
        date: '',
        venue: '',
        homeId: 'berlats', awayId: 'osa',
        homeScore: 1, awayScore: 5,
        title: 'Festival offensif',
        excerpt: 'Pluie de buts à Berlats !',
        body: "Victoire 5-1 à Berlats en coupe. Cinq buteurs différents : Claude (25'), Samy (32'), Julien (63'), Silas (65') et Noan (68'). Une belle victoire construite collectivement, avec un pressing haut et des transitions tranchantes. Super performance collective, et une ambiance de fin de match qui restera dans les mémoires du vestiaire.",
        image: '/img/match-2.jpg',
        scorers: ["Claude 25'", "Samy 32'", "Julien 63'", "Silas 65'", "Noan 68'"],
      },
      {
        id: 'lo-capial-j2',
        day: 2,
        competitionId: 'championnat',
        date: '',
        venue: '',
        homeId: 'osa', awayId: 'lo-capial-st-juery',
        homeScore: 2, awayScore: 2,
        title: 'Nul intense',
        excerpt: 'Un combat de tous les instants.',
        body: "Match nul 2-2 à domicile face à Lo Capial St-Juéry pour la 2e journée. Keks ouvre le score à la 30e, Val double la mise à la 55e, mais l'adversaire revient dans les dernières minutes. Un match très disputé, intense physiquement, où les deux équipes ont tout donné. Un point qui se prend, même si le goût est un peu amer.",
        image: '/img/match-6.jpg',
        scorers: ["Keks 30'", "Val 55'"],
      }
    ]
  },

  /**
   * Effectif. Toutes les valeurs ci-dessous sont des repères de départ,
   * destinés à être ajustés depuis l'onglet « Effectif » de l'administration :
   * l'âge est laissé à 0 (la ligne se masque alors), et les notes sont des
   * estimations, pas des mesures.
   */
  squad: {
    title: "L'effectif",
    subtitle: 'Les joueurs qui font vivre l\'OSA cette saison.',
    /**
     * Joueurs mis en avant : « en forme », « à surveiller »… Le libellé est
     * libre, le motif aussi. Choisis à la main depuis l'administration.
     */
    spotlights: [],
    players: [
      {
        id: 'keks',
        firstName: 'Keks', lastName: '',
        photo: '/img/keks.jpg',
        number: 0,
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
        number: 0,
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
        number: 0,
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
        number: 0,
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
        number: 0,
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
        number: 0,
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
        number: 0,
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
        number: 0,
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
        number: 0,
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

  /**
   * Palmarès : les titres et les places qui comptent, du plus récent au plus
   * ancien. Une entrée sans année reste affichée, sans repère de date.
   */
  palmares: {
    title: 'Palmarès du club',
    subtitle: 'Les saisons qui ont marqué le club.',
    entries: []
  },

  /** Le chant du club. Vide, la section ne s'affiche pas du tout. */
  anthem: {
    title: 'Le chant du club',
    subtitle: "À reprendre en chœur, au coup d’envoi comme à la troisième mi-temps.",
    lyrics: ''
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
 * Correction d'adresse : le site annonçait Saint-Affrique (12400), en Aveyron,
 * alors que le stade est à Saint-Affrique-les-Montagnes, dans le Tarn — cent
 * kilomètres d'écart.
 *
 * Contrairement aux autres étapes, celle-ci ne dépend pas du numéro de version.
 * Elle ne remplace que trois valeurs précises, connues pour être fausses, ce qui
 * la rend inoffensive à rejouer : une adresse déjà personnalisée n'est jamais
 * touchée. C'est ce qui permet de rattraper un document mal estampillé.
 */
const ADRESSES_ERRONEES = ['', 'Saint-Affrique (12400)', 'Saint-Affrique'];
const LIEUX_ERRONES = ['', 'Stade municipal — Saint-Affrique', 'Stade municipal - Saint-Affrique'];

function toV5(content) {
  if (ADRESSES_ERRONEES.includes(String(content.club?.address ?? '').trim())) {
    content.club = { ...content.club, address: DEFAULT_CONTENT.club.address };
  }
  if (LIEUX_ERRONES.includes(String(content.nextMatch?.venue ?? '').trim())) {
    content.nextMatch = { ...content.nextMatch, venue: DEFAULT_CONTENT.nextMatch.venue };
  }
  return content;
}

/**
 * v5 → v6 : les actualités deviennent des matchs, et le championnat devient
 * calculable.
 *
 * Jusqu'ici un résultat se saisissait comme un article (« adversaire »,
 * « domicile / extérieur », score), et le classement n'était qu'une capture
 * d'écran téléversée. Les deux vivaient chacun de leur côté. Désormais une
 * seule liste de matchs alimente le classement, la forme du moment, la page
 * Résultats et l'affiche du prochain match.
 *
 * La conversion ne perd rien : chaque article devient un match qui garde son
 * titre, son texte, sa photo et ses buteurs, et chaque adversaire rencontré
 * entre dans la liste des clubs de la poule.
 */
const NON_CLASSANTES = /coupe|amical|tournoi/i;

function slugId(value, fallback) {
  const base = String(value ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || fallback;
}

/** Abréviation tenant dans une colonne étroite, sans couper un mot en deux. */
function shortName(name) {
  const mots = String(name ?? '').split(/\s+/).filter(Boolean);
  const garde = [];
  for (const mot of mots) {
    if (garde.length && [...garde, mot].join(' ').length > 10) break;
    garde.push(mot);
  }
  return garde.join(' ') || String(name ?? '');
}

/** Numéro de journée lu dans un libellé libre : « 5e journée » → 5. */
function dayOf(competition) {
  const trouve = /(\d+)\s*(?:re|e|eme|ème)?\s*journ/i.exec(String(competition ?? ''));
  return trouve ? Number(trouve[1]) : 0;
}

function toV6(content) {
  // Un document déjà converti n'est pas retouché : la conversion n'est pas
  // idempotente. Mais un championnat *vide* accompagné d'actualités trahit une
  // conversion qui n'a pas eu lieu — là, il faut la rejouer, sinon les matchs
  // resteraient perdus pour toujours.
  if (Array.isArray(content.championship?.matches) && content.championship.matches.length) {
    return content;
  }

  const nomClub = String(content.club?.name || 'OSA FOOT 7').trim();
  const idClub = slugId(nomClub, 'osa');
  const equipes = new Map([['osa', {
    id: 'osa', name: nomClub, short: 'OSA',
    logo: content.club?.logo || '/img/osa.png', penalty: 0
  }]]);

  /** « OSA », « OSA FOOT 7 », « Olympique Saint-Affrique » : c'est nous. */
  const estNous = (nom) => {
    const id = slugId(nom, '');
    return Boolean(id) && (id === 'osa' || id === idClub
      || idClub.startsWith(`${id}-`) || id.startsWith(idClub));
  };

  const ajouterEquipe = (nom, logo = '') => {
    const label = String(nom ?? '').trim();
    if (!label) return '';
    if (estNous(label)) return 'osa';
    const id = slugId(label, 'equipe');
    if (!equipes.has(id)) {
      equipes.set(id, { id, name: label, short: shortName(label), logo, penalty: 0 });
    } else if (logo && !equipes.get(id).logo) {
      equipes.get(id).logo = logo;
    }
    return id;
  };

  const nombre = (value) => (Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : null);

  const matches = (Array.isArray(content.news) ? content.news : []).map((item, index) => {
    const adversaire = ajouterEquipe(item?.opponent || `Adversaire ${index + 1}`);
    const aDomicile = item?.venue !== 'away';
    const marques = nombre(item?.score?.osa);
    const encaisses = nombre(item?.score?.opponent);
    const day = dayOf(item?.competition);

    return {
      id: slugId(item?.id || item?.title, `match-${index + 1}`),
      day,
      competition: String(item?.competition ?? ''),
      ranked: day > 0 || !NON_CLASSANTES.test(String(item?.competition ?? '')),
      date: item?.date || '',
      venue: '',
      homeId: aDomicile ? 'osa' : adversaire,
      awayId: aDomicile ? adversaire : 'osa',
      homeScore: aDomicile ? marques : encaisses,
      awayScore: aDomicile ? encaisses : marques,
      title: String(item?.title ?? ''),
      excerpt: String(item?.excerpt ?? ''),
      body: String(item?.body ?? ''),
      image: String(item?.image ?? ''),
      scorers: Array.isArray(item?.scorers) ? item.scorers.slice() : []
    };
  });

  // L'affiche du prochain match rejoint la liste : sans elle, les pronostics
  // n'auraient aucune rencontre ouverte le jour de la mise en ligne.
  const affiche = content.nextMatch;
  if (affiche?.kickoff) {
    const domicile = ajouterEquipe(affiche.home?.name, affiche.home?.logo);
    const exterieur = ajouterEquipe(affiche.away?.name, affiche.away?.logo);
    const id = slugId(`${domicile}-${exterieur}-${String(affiche.kickoff).slice(0, 10)}`, 'prochain-match');
    if (domicile && exterieur && domicile !== exterieur && !matches.some((match) => match.id === id)) {
      matches.unshift({
        id, day: 0,
        competition: String(affiche.competition ?? ''),
        // Une affiche annoncee comme amicale ou de coupe ne compte pas au tableau.
        ranked: !NON_CLASSANTES.test(String(affiche.competition ?? '')),
        date: affiche.kickoff,
        venue: String(affiche.venue ?? ''),
        homeId: domicile, awayId: exterieur,
        homeScore: null, awayScore: null,
        title: '', excerpt: '', body: '', image: '', scorers: []
      });
    }
  }

  content.championship = {
    title: DEFAULT_CONTENT.championship.title,
    subtitle: DEFAULT_CONTENT.championship.subtitle,
    season: content.stats?.season || DEFAULT_CONTENT.championship.season,
    homeTeamId: 'osa',
    points: { ...DEFAULT_CONTENT.championship.points },
    teams: [...equipes.values()],
    matches
  };

  // Les deux sections que le championnat remplace.
  delete content.news;
  delete content.standings;

  content.palmares = content.palmares || cloneContent(DEFAULT_CONTENT.palmares);
  content.anthem = content.anthem || cloneContent(DEFAULT_CONTENT.anthem);

  const squad = content.squad || {};
  content.squad = {
    ...squad,
    spotlights: Array.isArray(squad.spotlights) ? squad.spotlights : [],
    players: (Array.isArray(squad.players) ? squad.players : []).map((player) => ({
      number: 0,
      ...player
    }))
  };

  return content;
}

/**
 * v6 → v7 : distinguer les clubs de la poule des simples adversaires.
 *
 * Le classement listait toutes les équipes enregistrées, y compris celles
 * rencontrées en amical ou en coupe — qui n'ont rien à y faire. Chaque club
 * reçoit donc un drapeau, déduit de ses matchs : au moins une rencontre
 * comptant pour le championnat, et il est de la poule ; que des matchs hors
 * championnat, et il n'y est pas. Un club sans aucun match est supposé de la
 * poule : c'est le cas d'un adversaire ajouté en début de saison.
 */
function toV7(content) {
  const champ = content.championship;
  if (!champ || !Array.isArray(champ.teams)) return content;

  const matches = Array.isArray(champ.matches) ? champ.matches : [];
  const joue = (id, seulementClassantes) => matches.some((match) =>
    (match?.homeId === id || match?.awayId === id)
    && (!seulementClassantes || match?.ranked !== false));

  champ.teams = champ.teams.map((team) => {
    if (typeof team?.inLeague === 'boolean') return team;
    // Notre propre club reste au classement quoi qu'il arrive : une saison qui
    // débute par un amical ne doit pas nous en faire sortir.
    const nous = team?.id === champ.homeTeamId;
    return { ...team, inLeague: nous || !joue(team?.id, false) || joue(team?.id, true) };
  });

  return content;
}

/**
 * v7 → v8 : le championnat devient *les* compétitions.
 *
 * Une seule liste d'équipes et un drapeau « compte pour le classement » posé
 * sur chaque match ne suffisaient plus : un club rencontré en coupe n'affronte
 * pas la même poule qu'en championnat, et méritait son propre tableau. Chaque
 * compétition porte donc ses clubs et, si on le demande, son classement.
 *
 * La conversion range les matchs existants d'après leur ancien libellé —
 * « coupe » et « amical » se reconnaissent, le reste est du championnat — et
 * inscrit dans chaque compétition les clubs qui y ont joué.
 */
const COMPETITIONS_CONNUES = [
  { id: 'coupe', motif: /coupe/i },
  { id: 'amicaux', motif: /amical|tournoi/i }
];

function toV8(content) {
  const champ = content.championship;
  if (!champ || Array.isArray(champ.competitions)) return content;

  const modele = DEFAULT_CONTENT.championship.competitions;
  const competitions = modele.map((competition) => ({ ...competition, teamIds: [] }));
  const parId = new Map(competitions.map((competition) => [competition.id, competition]));

  const matches = Array.isArray(champ.matches) ? champ.matches : [];
  for (const match of matches) {
    const libelle = String(match?.competition ?? '');
    const trouve = COMPETITIONS_CONNUES.find((connue) => connue.motif.test(libelle));
    // Un match qui ne comptait pour aucun classement et dont le libellé ne dit
    // rien reste un amical : c'est le seul rangement qui ne fausse personne.
    const id = trouve?.id || (match?.ranked === false ? 'amicaux' : 'championnat');

    match.competitionId = id;
    delete match.competition;
    delete match.ranked;

    for (const club of [match?.homeId, match?.awayId]) {
      if (club && !parId.get(id).teamIds.includes(club)) parId.get(id).teamIds.push(club);
    }
  }

  // Les clubs de la poule qui n'ont pas encore joué rejoignent le championnat.
  const poule = parId.get('championnat');
  for (const team of Array.isArray(champ.teams) ? champ.teams : []) {
    if (team?.inLeague !== false && team?.id && !poule.teamIds.includes(team.id)) {
      poule.teamIds.push(team.id);
    }
    delete team.inLeague;
  }

  // Notre club est de toutes les compétitions : il les dispute toutes.
  const nous = champ.homeTeamId;
  if (nous) {
    for (const competition of competitions) {
      if (!competition.teamIds.includes(nous)) competition.teamIds.unshift(nous);
    }
  }

  champ.competitions = competitions;
  return content;
}

/**
 * Met à niveau un document enregistré avant la version courante. Les étapes
 * s'enchaînent : un document v1 passe par toutes.
 */
export function migrateContent(stored) {
  if (!stored || typeof stored !== 'object') return stored;
  const version = Number(stored.version) || 1;
  // La correction d'adresse se rejoue même sur un document à jour : elle répare
  // les documents estampillés par une version du panel qui ne l'avait pas.
  if (version >= SCHEMA_VERSION) return toV5(cloneContent(stored));

  let migrated = cloneContent(stored);
  if (version < 2) migrated = toV2(migrated);
  if (version < 3) migrated = toV3(migrated);
  if (version < 4) migrated = toV4(migrated);
  if (version < 6) migrated = toV6(migrated);
  if (version < 7) migrated = toV7(migrated);
  if (version < 8) migrated = toV8(migrated);
  migrated = toV5(migrated);
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
