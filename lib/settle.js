/**
 * Règlement des paris.
 *
 * Un pari se règle tout seul dès que sa réponse est connue : le score saisi dans
 * l'administration pour un pronostic de match, la bonne réponse désignée par le
 * bureau pour tous les autres. Personne n'a à déclencher la distribution — elle
 * a lieu au premier passage du parieur sur le site, ce qui évite d'avoir à faire
 * tourner une tâche planifiée sur un hébergement qui n'en propose pas.
 *
 * La règle qui compte : `settled_at IS NULL` dans la mise à jour. C'est elle, et
 * non un verrou applicatif, qui garantit qu'une mise ne rapporte ses packs
 * qu'une seule fois, même si deux onglets appellent l'API en même temps.
 */

import { listWagers, settleWager } from './store.js';
import { betById, isResolved, outcomeOf, rewardOf } from '../public/assets/js/bets.js';

/**
 * Règle toutes les mises en attente d'un parieur.
 *
 * @param {object} content le document du site : c'est lui qui porte les paris.
 * @returns {Promise<{packs: number, details: Array<{betId: string, outcome: string, awarded: number}>}>}
 *   Ce qui vient d'être crédité — vide si rien n'était en attente.
 */
export async function settleUserWagers(db, userId, content) {
  const enAttente = (await listWagers(db, userId)).filter((ligne) => !ligne.settled_at);
  if (!enAttente.length) return { packs: 0, details: [] };

  const details = [];
  let packs = 0;

  for (const mise of enAttente) {
    const pari = betById(content, mise.bet_id);
    // Pari supprimé, match reporté, réponse pas encore désignée : la mise reste
    // en attente. Elle ne se perd pas, elle patiente.
    if (!pari || !isResolved(content, pari)) continue;

    const outcome = outcomeOf(content, pari, mise.answer);
    const gain = rewardOf(pari, outcome);
    if (await settleWager(db, mise.id, userId, outcome, gain)) {
      packs += gain;
      details.push({ betId: mise.bet_id, outcome, awarded: gain });
    }
  }

  return { packs, details };
}
