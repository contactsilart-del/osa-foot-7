/**
 * Règlement des pronostics.
 *
 * Un pronostic se règle tout seul, dès que le score du match est saisi dans
 * l'administration : personne n'a à déclencher la distribution. Le règlement a
 * lieu au premier passage du parieur sur le site, ce qui évite d'avoir à faire
 * tourner une tâche planifiée sur un hébergement qui n'en propose pas.
 *
 * La règle qui compte : `settled_at IS NULL` dans la mise à jour. C'est elle,
 * et non un verrou applicatif, qui garantit qu'un pronostic ne rapporte ses
 * packs qu'une seule fois, même si deux onglets appellent l'API en même temps.
 */

import { isPlayed, matchesOf } from '../public/assets/js/league.js';
import { listPredictions, settlePrediction } from './store.js';
import { predictionOutcome, rewardFor } from './players.js';

/**
 * Règle tous les pronostics en attente d'un parieur.
 *
 * @returns {Promise<{packs: number, details: Array<{matchId: string, outcome: string, awarded: number}>}>}
 *   Ce qui vient d'être crédité — vide si rien n'était en attente.
 */
export async function settleUserPredictions(db, userId, championship) {
  const enAttente = (await listPredictions(db, userId)).filter((ligne) => !ligne.settled_at);
  if (!enAttente.length) return { packs: 0, details: [] };

  const matchs = new Map(matchesOf(championship).map((match) => [match.id, match]));
  const details = [];
  let packs = 0;

  for (const pronostic of enAttente) {
    const match = matchs.get(pronostic.match_id);
    // Match reporté, supprimé, ou pas encore joué : le pronostic reste ouvert.
    if (!match || !isPlayed(match)) continue;

    const outcome = predictionOutcome(pronostic, match);
    const gain = rewardFor(outcome);
    if (await settlePrediction(db, pronostic.id, userId, outcome, gain)) {
      packs += gain;
      details.push({ matchId: pronostic.match_id, outcome, awarded: gain });
    }
  }

  return { packs, details };
}
