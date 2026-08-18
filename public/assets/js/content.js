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
    address: 'Saint-Affrique (12400)',
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
    venue: 'Stade municipal — Saint-Affrique'
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

  stats: {
    season: '2025 / 2026',
    groups: [
      {
        id: 'scorers',
        title: 'Meilleurs buteurs',
        unit: 'buts',
        accent: 'gold',
        icon: 'ball',
        players: [
          { name: 'Keks', photo: '/img/keks.jpg', value: 4 },
          { name: 'Silas', photo: '/img/silas.jpg', value: 2 },
          { name: 'Claude', photo: '/img/claude.jpg', value: 2 }
        ]
      },
      {
        id: 'assists',
        title: 'Meilleurs passeurs',
        unit: 'passes déc.',
        accent: 'blue',
        icon: 'boot',
        players: [
          { name: 'Valé', photo: '/img/val.jpg', value: 4 },
          { name: 'Noan', photo: '/img/noan.jpg', value: 3 },
          { name: 'Joris', photo: '/img/joris.jpg', value: 2 }
        ]
      },
      {
        id: 'owngoals',
        title: 'Contre son camp',
        unit: 'CSC',
        accent: 'red',
        icon: 'oops',
        players: [
          { name: 'Pierre', photo: '/img/pierre.jpg', value: 1 }
        ]
      }
    ]
  }
};

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
