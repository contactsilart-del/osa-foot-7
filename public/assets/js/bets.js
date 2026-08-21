/**
 * OSA FOOT 7 — le moteur des paris.
 *
 * Calcul pur, sans DOM ni réseau : le site l'utilise pour dessiner, le serveur
 * pour arbitrer. Les deux lisent donc exactement les mêmes règles — un pari ne
 * peut pas rapporter à l'écran ce qu'il ne rapporte pas en base.
 *
 * Trois natures de paris, et pas une de plus :
 *
 *   `score`   deux nombres à deviner sur un match. Trois paliers — score exact,
 *             bon résultat, participation — jamais cumulés. Se règle tout seul
 *             dès que le score est saisi dans l'administration.
 *   `result`  1 / N / 2 sur un match. Même règlement automatique, deux paliers.
 *   `choice`  une question, des réponses au choix. C'est le moule commun du
 *             buteur, du passeur, de l'homme du match et du pari pour rire :
 *             seule change la liste des options. Le bureau désigne la bonne
 *             réponse — personne d'autre ne peut le faire.
 *
 * Le pari `choice` ne se règle donc pas au temps qui passe mais à la main. Deux
 * gestes distincts : clore les mises, puis, plus tard, désigner la réponse.
 * « Nathan perd deux kilos d'ici la fin de saison » se parie en septembre et ne
 * se tranche qu'en juin.
 */

import { isPlayed, kickoffTime, matchesOf, resultKey, teamName } from './league.js';

/** Les trois natures. Toute autre valeur retombe sur `choice`. */
export const BET_TYPES = ['score', 'result', 'choice'];

/** Barème par défaut des paris de match, réglable depuis l'administration. */
export const DEFAULT_MATCH_REWARDS = { exact: 15, result: 3, played: 1 };

/** Barème par défaut d'un pari créé à la main. */
export const DEFAULT_BET_REWARDS = { exact: 5, result: 0, played: 1 };

export const OUTCOME_LABELS = {
  exact: 'Score exact',
  result: 'Bon résultat',
  played: 'Participation'
};

/** Le même palier ne se dit pas pareil selon la nature du pari. */
export function outcomeLabel(bet, outcome) {
  if (outcome === 'exact' && bet?.type !== 'score') return 'Bonne réponse';
  return OUTCOME_LABELS[outcome] || '';
}

/** Raccourci de saisie : le pari pour rire répond par oui ou par non. */
export const YES_NO = [{ id: 'oui', label: 'Oui' }, { id: 'non', label: 'Non' }];

/** Préfixe des paris ouverts d'office sur les matchs. Voir `autoBets`. */
export const AUTO_PREFIX = 'match:';

function betsBlock(content) {
  return (content && typeof content.bets === 'object' && content.bets) || {};
}

function championshipOf(content) {
  return (content && typeof content.championship === 'object' && content.championship) || {};
}

/* ═══════════════════════════════════════ Le catalogue ══ */

/**
 * Un pronostic de score ouvert d'office sur chaque match daté.
 *
 * Il est *dérivé*, jamais stocké : le calendrier fait foi, et supprimer un match
 * emporte son pari. Un pari saisi à la main sur le même match le remplace — sans
 * quoi le visiteur verrait deux fois la même question.
 */
export function autoBets(content) {
  const bets = betsBlock(content);
  if (bets.autoMatch === false) return [];

  const champ = championshipOf(content);
  const rewards = { ...DEFAULT_MATCH_REWARDS, ...(bets.matchRewards || {}) };
  /*
   * Seul un pari de score saisi a la main remplace celui du match : c'est la
   * meme question, elle ne doit pas etre posee deux fois. Un pari « qui marque
   * en premier ? » rattache au meme match, lui, s'ajoute — le supprimer
   * emporterait le pronostic de score sans que personne ne l'ait demande.
   */
  const repris = new Set(
    (bets.items || []).filter((item) => item?.type === 'score')
      .map((item) => item.matchId).filter(Boolean)
  );

  return matchesOf(champ)
    .filter((match) => match?.id && kickoffTime(match) !== null && !repris.has(match.id))
    .map((match) => ({
      id: AUTO_PREFIX + match.id,
      type: 'score',
      question: `${teamName(champ, match.homeId)} – ${teamName(champ, match.awayId)}`,
      note: '',
      matchId: match.id,
      options: [],
      answers: [],
      closesAt: '',
      closed: false,
      rewards,
      auto: true
    }));
}

/** Tous les paris : ceux du bureau d'abord, les automatiques ensuite. */
export function allBets(content) {
  const saisis = (betsBlock(content).items || []).filter(Boolean);
  return [...saisis, ...autoBets(content)];
}

export function betById(content, id) {
  return allBets(content).find((bet) => bet.id === id) || null;
}

export function matchOf(content, bet) {
  if (!bet?.matchId) return null;
  return matchesOf(championshipOf(content)).find((match) => match.id === bet.matchId) || null;
}

/* ═══════════════════════════════════════════ Statut ══ */

/**
 * L'instant où les mises ferment, ou `null` si rien ne les ferme.
 *
 * La date saisie l'emporte sur le coup d'envoi : un pari « qui marque en
 * premier ? » peut très bien fermer un quart d'heure avant le match.
 */
export function deadlineOf(content, bet) {
  const saisie = bet?.closesAt ? Date.parse(bet.closesAt) : NaN;
  if (Number.isFinite(saisie)) return saisie;
  const match = matchOf(content, bet);
  return match ? kickoffTime(match) : null;
}

/**
 * Le pari a-t-il sa réponse ?
 *
 * Sur un match, c'est le score saisi qui tranche — personne n'a à intervenir.
 * Ailleurs, c'est le bureau qui désigne : la réponse existe ou n'existe pas.
 */
export function isResolved(content, bet) {
  if (!bet) return false;
  if (bet.type === 'score' || bet.type === 'result') {
    const match = matchOf(content, bet);
    return Boolean(match && isPlayed(match));
  }
  return Array.isArray(bet.answers) && bet.answers.length > 0;
}

/**
 * Peut-on encore miser ?
 *
 * Désigner la bonne réponse ferme le pari du même geste : laisser miser après
 * coup reviendrait à distribuer les packs à qui lit la page d'administration.
 */
export function isOpen(content, bet, now = Date.now()) {
  if (!bet || bet.closed === true) return false;
  if (isResolved(content, bet)) return false;
  const limite = deadlineOf(content, bet);
  if (limite !== null && limite <= now) return false;
  // Un pari de match sans date n'ouvre pas : impossible de fermer à temps.
  if ((bet.type === 'score' || bet.type === 'result') && limite === null) return false;
  return true;
}

/** @returns {'open'|'locked'|'settled'} */
export function betStatus(content, bet, now = Date.now()) {
  if (isResolved(content, bet)) return 'settled';
  return isOpen(content, bet, now) ? 'open' : 'locked';
}

export function openBets(content, now = Date.now()) {
  return allBets(content)
    .filter((bet) => isOpen(content, bet, now))
    .sort((a, b) => {
      const da = deadlineOf(content, a);
      const db = deadlineOf(content, b);
      // Les paris sans échéance ferment la marche : rien ne presse.
      if (da === null) return db === null ? 0 : 1;
      if (db === null) return -1;
      return da - db;
    });
}

/* ══════════════════════════════════════════ Options ══ */

/**
 * Les réponses proposées. Un pari 1/N/2 tire les siennes du match : écrire
 * « Victoire de Carlus » à la main, c'est se tromper le jour où l'on corrige
 * l'affiche.
 */
/** « Victoire de Cambon », mais « Victoire d'OSA ». */
const COMMENCE_PAR_VOYELLE = /^[aeiouyàâäéèêëîïôöûü]/i;

function elide(nom) {
  return COMMENCE_PAR_VOYELLE.test(nom) ? `d’${nom}` : `de ${nom}`;
}

export function optionsOf(content, bet) {
  if (bet?.type !== 'result') {
    return (bet?.options || []).filter((option) => option && option.id);
  }
  const champ = championshipOf(content);
  const match = matchOf(content, bet);
  return [
    { id: '1', label: match ? `Victoire ${elide(teamName(champ, match.homeId))}` : 'Victoire à domicile' },
    { id: 'N', label: 'Match nul' },
    { id: '2', label: match ? `Victoire ${elide(teamName(champ, match.awayId))}` : 'Victoire à l’extérieur' }
  ];
}

/* ═══════════════════════════════════════ Réponses ══ */

/** Un score se transporte en une seule chaîne : « 2-1 ». */
export function scoreAnswer(home, away) {
  return `${Number(home)}-${Number(away)}`;
}

export function parseScore(answer) {
  const trouve = /^(\d{1,2})-(\d{1,2})$/.exec(String(answer ?? '').trim());
  if (!trouve) return null;
  return { home: Number(trouve[1]), away: Number(trouve[2]) };
}

/**
 * Normalise ce que le navigateur envoie, ou refuse.
 * @returns {string|null} la réponse telle qu'elle sera stockée.
 */
export function normalizeAnswer(content, bet, answer) {
  if (!bet) return null;
  if (bet.type === 'score') {
    const score = parseScore(answer);
    if (!score) return null;
    if (score.home > 30 || score.away > 30) return null;
    return scoreAnswer(score.home, score.away);
  }
  const brut = String(answer ?? '').trim();
  return optionsOf(content, bet).some((option) => option.id === brut) ? brut : null;
}

/** Ce qu'il fallait répondre. Vide tant que le pari n'est pas tranché. */
export function correctAnswers(content, bet) {
  if (!isResolved(content, bet)) return [];
  if (bet.type === 'score') {
    const match = matchOf(content, bet);
    return [scoreAnswer(match.homeScore, match.awayScore)];
  }
  if (bet.type === 'result') {
    const match = matchOf(content, bet);
    return [resultKey(match.homeScore, match.awayScore)];
  }
  // Plusieurs bonnes réponses sont permises : un match a souvent deux buteurs.
  return [...bet.answers];
}

/**
 * Départage une mise. Un pari non tranché ne rend rien : c'est au règlement de
 * vérifier `isResolved` avant d'appeler.
 *
 * @returns {'exact'|'result'|'played'}
 */
export function outcomeOf(content, bet, answer) {
  const bonnes = correctAnswers(content, bet);
  const mise = String(answer ?? '').trim();
  if (bonnes.includes(mise)) return 'exact';

  // Le score exact manqué peut encore valoir le bon résultat.
  if (bet?.type === 'score') {
    const prevu = parseScore(mise);
    const reel = parseScore(bonnes[0]);
    if (prevu && reel && resultKey(prevu.home, prevu.away) === resultKey(reel.home, reel.away)) {
      return 'result';
    }
  }
  return 'played';
}

export function rewardOf(bet, outcome) {
  const bareme = bet?.rewards || {};
  const gain = Number(bareme[outcome]);
  return Number.isFinite(gain) && gain > 0 ? Math.round(gain) : 0;
}

/** Les paliers qui rapportent quelque chose, pour l'affichage du barème. */
export function scaleOf(bet) {
  const paliers = bet?.type === 'score' ? ['exact', 'result', 'played'] : ['exact', 'played'];
  return paliers
    .map((outcome) => ({ outcome, label: outcomeLabel(bet, outcome), packs: rewardOf(bet, outcome) }))
    .filter((palier) => palier.packs > 0);
}

/* ═══════════════════════════════════ Répartition ══ */

/**
 * Comment les autres ont répondu.
 *
 * Le décompte arrive du serveur sous sa forme la plus brute — une réponse, un
 * nombre. C'est ici qu'il devient lisible, et la présentation dépend de la
 * nature du pari : sur un score, chacun tape le sien, et lister « 3-1 : une
 * personne » quarante fois n'apprendrait rien. On regroupe donc par issue, en
 * gardant à part les trois scores les plus joués.
 *
 * @param {object} tally  réponse → nombre de mises
 * @param {string} mienne la réponse du visiteur, mise en évidence
 * @returns {{total: number, rows: Array, top: Array}}
 */
export function tallyRows(content, bet, tally = {}, mienne = '') {
  const brut = Object.entries(tally || {})
    .map(([answer, count]) => [answer, Number(count) || 0])
    .filter(([, count]) => count > 0);
  const total = brut.reduce((somme, [, count]) => somme + count, 0);
  if (!total) return { total: 0, rows: [], top: [] };

  const part = (count) => Math.round((count / total) * 100);

  if (bet?.type === 'score') {
    const parIssue = { 1: 0, N: 0, 2: 0 };
    for (const [answer, count] of brut) {
      const score = parseScore(answer);
      if (score) parIssue[resultKey(score.home, score.away)] += count;
    }
    const mien = parseScore(mienne);
    const issueMienne = mien ? resultKey(mien.home, mien.away) : '';

    return {
      total,
      // Les libellés d'un pari 1/N/2 nomment déjà les deux clubs : on les reprend.
      rows: optionsOf(content, { ...bet, type: 'result' }).map((option) => ({
        id: option.id,
        label: option.label,
        count: parIssue[option.id],
        share: part(parIssue[option.id]),
        mine: option.id === issueMienne
      })),
      top: brut
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([answer, count]) => ({
          id: answer,
          label: answerLabel(content, bet, answer),
          count,
          share: part(count),
          mine: answer === mienne
        }))
    };
  }

  const compte = new Map(brut);
  return {
    total,
    rows: optionsOf(content, bet).map((option) => {
      const count = compte.get(option.id) || 0;
      return {
        id: option.id,
        label: option.label,
        count,
        share: part(count),
        mine: option.id === mienne
      };
    }),
    top: []
  };
}

/** Comment s'affiche une mise déjà posée. */
export function answerLabel(content, bet, answer) {
  if (bet?.type === 'score') {
    const score = parseScore(answer);
    return score ? `${score.home} – ${score.away}` : '—';
  }
  return optionsOf(content, bet).find((option) => option.id === answer)?.label || '—';
}
