/**
 * `/api/club/packs` — ouverture d'un pack.
 *
 *   POST  consomme un pack et renvoie les cartes tirées
 *
 * Le tirage a lieu ici, jamais dans le navigateur : sinon n'importe qui
 * s'offrirait la carte de son choix depuis la console.
 */

import { json, fail, methodNotAllowed, isMethod } from '../../../lib/http.js';
import { checkOrigin, currentUserId } from '../../../lib/auth.js';
import {
  findUserById, consumePack, addCards, listCards, readContent, setUserPacks
} from '../../../lib/store.js';
import {
  drawCards, buildCollection, applyDailyGrant, rarityOf, CARDS_PER_PACK
} from '../../../lib/players.js';
import { DEFAULT_CONTENT, migrateContent } from '../../../public/assets/js/content.js';

async function squadOf(env) {
  const stored = await readContent(env.DB);
  const content = stored?.content ? migrateContent(stored.content) : null;
  const players = content?.squad?.players;
  return Array.isArray(players) && players.length ? players : DEFAULT_CONTENT.squad.players;
}

export async function onRequest({ request, env }) {
  if (!isMethod(request, 'POST')) return methodNotAllowed(['POST']);
  if (!env.DB) {
    return fail("Les packs ne sont pas disponibles : la base de données n'est pas configurée.", 503);
  }
  if (!checkOrigin(request)) return fail('Origine non autorisée.', 403);

  const id = await currentUserId(request, env);
  if (!id) return fail('Connectez-vous pour ouvrir un pack.', 401);

  const user = await findUserById(env.DB, id);
  if (!user) return fail('Compte introuvable.', 401);

  // Ouvrir un pack juste après minuit doit d'abord créditer la journée.
  const credit = applyDailyGrant(user);
  if (credit.granted) {
    await setUserPacks(env.DB, user.id, credit.packs, credit.day);
    user.packs = credit.packs;
  }

  const players = await squadOf(env);
  if (!players.length) {
    return fail("L'effectif est vide : il n'y a aucune carte à distribuer.", 409);
  }

  // Le décompte est conditionnel côté base : deux clics simultanés ne peuvent
  // pas ouvrir deux packs avec un seul en stock.
  if (!(await consumePack(env.DB, user.id))) {
    return fail('Vous n’avez plus de pack. Revenez demain pour en recevoir cinq.', 409, { packs: 0 });
  }

  const tirage = drawCards(players, CARDS_PER_PACK);
  await addCards(env.DB, user.id, tirage);

  const apres = await findUserById(env.DB, user.id);
  const cartes = await listCards(env.DB, user.id);
  const collection = buildCollection(players, cartes);

  return json({
    ok: true,
    cards: tirage.map((playerId) => {
      const player = players.find((p) => p.id === playerId);
      const owned = cartes.find((ligne) => ligne.player_id === playerId);
      return {
        id: playerId,
        rarity: rarityOf(player).id,
        // Deuxième exemplaire ou plus : la carte n'est pas une nouveauté.
        isNew: (Number(owned?.count) || 0) <= 1
      };
    }),
    packs: Number(apres?.packs) || 0,
    granted: credit.granted,
    collection
  });
}
