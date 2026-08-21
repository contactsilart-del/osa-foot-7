/**
 * OSA FOOT 7 — le championnat : matchs, classement, forme du moment.
 *
 * Ce module ne fait que calculer. Il ne touche ni au DOM ni au réseau, ce qui
 * lui permet de servir aussi bien à la page d'accueil qu'au serveur, quand
 * celui-ci doit départager un pronostic.
 *
 * Règle centrale : **rien n'est saisi deux fois**. Le classement, la forme du
 * moment, la page Résultats et l'affiche du prochain match découlent tous de la
 * même liste de matchs. Corriger un score corrige donc tout le site d'un coup.
 */

/** Barème par défaut. Modifiable depuis l'administration : l'UFOLEP varie. */
export const DEFAULT_POINTS = { win: 3, draw: 1, loss: 0 };

/** Nombre de résultats affichés dans la pastille « forme du moment ». */
export const FORM_LENGTH = 5;

export const OUTCOME_LABEL = { win: 'Victoire', draw: 'Match nul', loss: 'Défaite' };

/* ═══════════════════════════════════════════ Accès ══ */

export function teamsOf(championship) {
  return Array.isArray(championship?.teams) ? championship.teams : [];
}

export function matchesOf(championship) {
  return Array.isArray(championship?.matches) ? championship.matches : [];
}

export function teamById(championship, id) {
  if (!id) return null;
  return teamsOf(championship).find((team) => team.id === id) || null;
}

/**
 * Nom lisible reconstruit depuis un identifiant : « us-autan » → « Us Autan ».
 *
 * Sert quand un match cite un club retire du tableau. Approximatif sur la
 * casse, mais infiniment preferable a un tiret vide sur la page d'accueil —
 * et l'administration recree le club, ce qui permet de le renommer.
 */
export function humanizeId(id) {
  return String(id ?? '')
    .split('-')
    .filter(Boolean)
    .map((mot) => mot.charAt(0).toUpperCase() + mot.slice(1))
    .join(' ');
}

/**
 * Nom d'affichage d'une équipe. Un match dont l'adversaire a été supprimé du
 * tableau reste lisible plutôt que de disparaître.
 */
export function teamName(championship, id) {
  return teamById(championship, id)?.name || humanizeId(id) || 'Équipe inconnue';
}

/** Abréviation pour les colonnes étroites : « OSA » plutôt que « OSA FOOT 7 ». */
export function teamShort(championship, id) {
  const team = teamById(championship, id);
  return team?.short || team?.name || humanizeId(id) || '—';
}

export function teamLogo(championship, id) {
  return teamById(championship, id)?.logo || '';
}

/** L'équipe du club, celle dont le site raconte la saison. */
export function homeTeamId(championship) {
  const declared = championship?.homeTeamId;
  if (declared && teamById(championship, declared)) return declared;
  return teamsOf(championship)[0]?.id || '';
}

/* ═══════════════════════════════════════════ Matchs ══ */

const isScore = (value) => typeof value === 'number' && Number.isFinite(value);

/** Un match est « joué » dès que les deux scores sont renseignés. */
export function isPlayed(match) {
  return isScore(match?.homeScore) && isScore(match?.awayScore);
}

/** Instant du coup d'envoi, ou `null` si la date n'est pas renseignée. */
export function kickoffTime(match) {
  const raw = match?.date;
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? time : null;
}

/**
 * Tri chronologique. Les matchs sans date partent toujours en fin de liste,
 * dans l'ordre où ils ont été saisis : `sort` est stable, on s'appuie dessus.
 * @param {number} dir  1 = du plus ancien au plus récent, -1 = l'inverse.
 */
export function sortByDate(matches, dir = -1) {
  return matches.slice().sort((a, b) => {
    const ta = kickoffTime(a);
    const tb = kickoffTime(b);
    if (ta === null && tb === null) return 0;
    if (ta === null) return 1;
    if (tb === null) return -1;
    return (ta - tb) * dir;
  });
}

export function involves(match, teamId) {
  return Boolean(teamId) && (match?.homeId === teamId || match?.awayId === teamId);
}

/** Matchs disputés, du plus récent au plus ancien. */
export function playedMatches(championship, teamId = null) {
  const matches = matchesOf(championship)
    .filter((match) => isPlayed(match) && (!teamId || involves(match, teamId)));
  return sortByDate(matches, -1);
}

/**
 * Matchs à venir, du plus proche au plus lointain. Un match sans date en fait
 * partie : il est programmé, on ne sait juste pas encore quand.
 */
export function upcomingMatches(championship, teamId = null) {
  const matches = matchesOf(championship)
    .filter((match) => !isPlayed(match) && (!teamId || involves(match, teamId)));
  return sortByDate(matches, 1);
}

/**
 * L'affiche du prochain match du club.
 *
 * On privilégie une rencontre dont le coup d'envoi est encore à venir. Un match
 * daté d'hier mais dont le score n'a pas été saisi reste « à jouer » pour le
 * modèle : le mettre à l'affiche donnerait une page d'accueil qui regarde en
 * arrière. Il sert malgré tout de dernier recours, faute de mieux.
 */
export function nextMatchFor(championship, teamId = homeTeamId(championship), now = Date.now()) {
  const aVenir = upcomingMatches(championship, teamId);
  const futur = aVenir.find((match) => {
    const heure = kickoffTime(match);
    return heure === null || heure > now;
  });
  return futur || aVenir[0] || null;
}

/** 'win' | 'draw' | 'loss' | null — du point de vue de `teamId`. */
export function outcomeFor(match, teamId) {
  if (!isPlayed(match) || !involves(match, teamId)) return null;
  const pour = match.homeId === teamId ? match.homeScore : match.awayScore;
  const contre = match.homeId === teamId ? match.awayScore : match.homeScore;
  if (pour > contre) return 'win';
  if (pour < contre) return 'loss';
  return 'draw';
}

/**
 * La forme du moment : les cinq derniers résultats, **du plus ancien au plus
 * récent** — c'est le sens de lecture attendu, le carré de droite est le
 * dernier match joué.
 */
export function formOf(championship, teamId, limit = FORM_LENGTH) {
  return playedMatches(championship, teamId)
    .slice(0, Math.max(0, limit))
    .map((match) => ({ match, outcome: outcomeFor(match, teamId) }))
    .reverse();
}

/* ═════════════════════════════════════════ Classement ══ */

function emptyRow(team) {
  return {
    id: team.id,
    team,
    // Un adversaire d'amical ou de coupe compte pour ses adversaires, mais ne
    // figure pas au tableau : on calcule sa ligne, puis on la retire.
    inLeague: team.inLeague !== false,
    played: 0, won: 0, drawn: 0, lost: 0,
    goalsFor: 0, goalsAgainst: 0, diff: 0,
    points: 0, penalty: 0, rank: 0
  };
}

function pointsFor(championship) {
  const barème = championship?.points || {};
  const lire = (clé) => (Number.isFinite(Number(barème[clé])) ? Number(barème[clé]) : DEFAULT_POINTS[clé]);
  return { win: lire('win'), draw: lire('draw'), loss: lire('loss') };
}

/**
 * Le classement, calculé depuis les seuls matchs joués et comptant pour le
 * championnat. Un match de coupe (`ranked: false`) nourrit la forme du moment
 * mais pas le tableau — c'est ce qu'on attend d'un classement de poule.
 *
 * Départage : points, puis différence de buts, puis buts marqués, puis nom.
 */
export function computeStandings(championship) {
  const barème = pointsFor(championship);
  const rows = new Map();

  for (const team of teamsOf(championship)) {
    if (!team?.id || rows.has(team.id)) continue;
    const row = emptyRow(team);
    row.penalty = Number(team.penalty) || 0;
    // `-0` s'affiche « -0 » : on ne le laisse pas apparaitre dans le tableau.
    row.points = row.penalty ? -row.penalty : 0;
    rows.set(team.id, row);
  }

  /*
   * Un club retire du tableau mais encore engage dans des matchs reprend sa
   * ligne, sous un nom devine depuis son identifiant. Sans cela le tableau
   * changerait tout seul au prochain enregistrement, puisque le serveur, lui,
   * recree le club. Les deux disent desormais la meme chose.
   */
  for (const match of matchesOf(championship)) {
    for (const id of [match?.homeId, match?.awayId]) {
      if (!id || rows.has(id)) continue;
      const inLeague = matchesOf(championship).some((autre) =>
        (autre?.homeId === id || autre?.awayId === id) && autre?.ranked !== false);
      rows.set(id, emptyRow({ id, name: humanizeId(id), short: humanizeId(id), logo: '', penalty: 0, inLeague }));
    }
  }

  for (const match of matchesOf(championship)) {
    if (!isPlayed(match) || match.ranked === false) continue;
    const domicile = rows.get(match.homeId);
    const exterieur = rows.get(match.awayId);
    // Un match dont une équipe a été retirée du tableau ne fausse pas le total.
    if (!domicile || !exterieur || domicile === exterieur) continue;

    domicile.played += 1; exterieur.played += 1;
    domicile.goalsFor += match.homeScore; domicile.goalsAgainst += match.awayScore;
    exterieur.goalsFor += match.awayScore; exterieur.goalsAgainst += match.homeScore;

    if (match.homeScore > match.awayScore) {
      domicile.won += 1; exterieur.lost += 1;
      domicile.points += barème.win; exterieur.points += barème.loss;
    } else if (match.homeScore < match.awayScore) {
      exterieur.won += 1; domicile.lost += 1;
      exterieur.points += barème.win; domicile.points += barème.loss;
    } else {
      domicile.drawn += 1; exterieur.drawn += 1;
      domicile.points += barème.draw; exterieur.points += barème.draw;
    }
  }

  // Le filtrage vient après le calcul : les points marqués contre un adversaire
  // hors poule restent acquis à celui qui les a pris.
  const classées = [...rows.values()].filter((row) => row.inLeague);
  for (const row of classées) row.diff = row.goalsFor - row.goalsAgainst;

  classées.sort((a, b) =>
    b.points - a.points
    || b.diff - a.diff
    || b.goalsFor - a.goalsFor
    || String(a.team.name).localeCompare(String(b.team.name), 'fr'));

  classées.forEach((row, index) => { row.rank = index + 1; });
  return classées;
}

/* ══════════════════════════════════════════ Journées ══ */

/**
 * Regroupe les matchs par journée, de la plus récente à la plus ancienne.
 * Les matchs sans numéro de journée sont rassemblés à part, sous leur
 * compétition — c'est là que tombent les matchs de coupe.
 */
export function matchesByDay(championship, { playedOnly = false } = {}) {
  const groupes = new Map();

  for (const match of sortByDate(matchesOf(championship), -1)) {
    if (playedOnly && !isPlayed(match)) continue;
    const day = Number(match?.day) || 0;
    const clé = day > 0 ? `j${day}` : `autre:${match?.competition || ''}`;
    if (!groupes.has(clé)) {
      groupes.set(clé, {
        key: clé,
        day,
        label: day > 0 ? `${day}${day === 1 ? 're' : 'e'} journée` : (match?.competition || 'Hors championnat'),
        matches: []
      });
    }
    groupes.get(clé).matches.push(match);
  }

  // Les journées numérotées d'abord, décroissantes ; le reste ensuite.
  return [...groupes.values()].sort((a, b) => {
    if (a.day && b.day) return b.day - a.day;
    if (a.day) return -1;
    if (b.day) return 1;
    return 0;
  });
}

/* ═══════════════════════════════════════ Pronostics ══ */

/** '1' | 'N' | '2' — le sens d'un score, indépendamment de son ampleur. */
export function resultKey(home, away) {
  if (home > away) return '1';
  if (home < away) return '2';
  return 'N';
}

/**
 * Un match n'accepte les pronostics que s'il est programmé, daté, et que le
 * coup d'envoi n'est pas passé. Sans date, impossible de fermer les paris à
 * temps : on préfère ne pas les ouvrir du tout.
 */
export function isPredictable(match, now = Date.now()) {
  if (!match || isPlayed(match)) return false;
  const heure = kickoffTime(match);
  return heure !== null && heure > now;
}

export function predictableMatches(championship, now = Date.now()) {
  return upcomingMatches(championship).filter((match) => isPredictable(match, now));
}
