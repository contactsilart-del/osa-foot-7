/**
 * `/api/club/predictions` — pronostics des supporters.
 *
 *   GET   les matchs ouverts, les pronostics du visiteur, le tableau des
 *         meilleurs pronostiqueurs. Les pronostics arrivés à échéance sont
 *         réglés au passage, et les packs gagnés versés.
 *   POST  enregistre ou corrige un pronostic, tant que le coup d'envoi
 *         n'est pas passé.
 *
 * Le score réel n'est jamais transmis par le navigateur : il est relu depuis le
 * document du site, seule source qui fasse foi.
 */

import { json, fail, methodNotAllowed, readJson, isMethod } from '../../../lib/http.js';
import { checkOrigin, currentUserId, clearedPlayerCookie } from '../../../lib/auth.js';
import { findUserById, readContent, savePrediction, listPredictions, topPredictors } from '../../../lib/store.js';
import { validatePrediction, PREDICTION_REWARDS } from '../../../lib/players.js';
import { settleUserPredictions } from '../../../lib/predictions.js';
import { DEFAULT_CONTENT, migrateContent } from '../../../public/assets/js/content.js';
import { isPredictable, matchesOf } from '../../../public/assets/js/league.js';

/** Le championnat tel que le site l'affiche. */
async function championshipOf(env) {
  const stored = await readContent(env.DB);
  const content = stored?.content ? migrateContent(stored.content) : null;
  const champ = content?.championship;
  return champ && Array.isArray(champ.matches) ? champ : DEFAULT_CONTENT.championship;
}

/** Ce qu'on renvoie au navigateur pour une ligne de pronostic. */
function publicPrediction(row) {
  return {
    matchId: row.match_id,
    home: Number(row.home),
    away: Number(row.away),
    settled: Boolean(row.settled_at),
    outcome: row.outcome || '',
    awarded: Number(row.awarded) || 0
  };
}

export async function onRequest({ request, env }) {
  if (!env.DB) {
    return fail("Les pronostics ne sont pas disponibles : la base de données n'est pas configurée.", 503);
  }

  if (isMethod(request, 'GET')) return handleGet(request, env);
  if (isMethod(request, 'POST')) return handlePost(request, env);
  return methodNotAllowed(['GET', 'POST']);
}

async function handleGet(request, env) {
  const champ = await championshipOf(env);
  const board = await topPredictors(env.DB);
  const rewards = { ...PREDICTION_REWARDS };

  const id = await currentUserId(request, env);
  if (!id) return json({ ok: true, user: null, predictions: [], settled: null, board, rewards });

  const user = await findUserById(env.DB, id);
  if (!user) {
    return json({ ok: true, user: null, predictions: [], settled: null, board, rewards },
      { headers: { 'Set-Cookie': clearedPlayerCookie() } });
  }

  // Les gains tombent ici : c'est le premier passage du parieur après le match.
  const regles = await settleUserPredictions(env.DB, user.id, champ);
  const lignes = await listPredictions(env.DB, user.id);
  // Le stock a pu changer à l'instant : on le relit plutôt que de l'additionner.
  const frais = regles.packs ? await findUserById(env.DB, user.id) : user;

  return json({
    ok: true,
    user: { username: frais.username, packs: Number(frais.packs) || 0 },
    predictions: lignes.map(publicPrediction),
    settled: regles.packs || regles.details.length ? regles : null,
    board,
    rewards
  });
}

async function handlePost(request, env) {
  if (!checkOrigin(request)) return fail('Origine non autorisée.', 403);

  const id = await currentUserId(request, env);
  if (!id) return fail('Connectez-vous pour pronostiquer.', 401);

  const body = await readJson(request, 4 * 1024);
  if (!body.ok) return body.response;

  const verifie = validatePrediction(body.data);
  if (!verifie.ok) return fail(verifie.error, 422);

  const champ = await championshipOf(env);
  const match = matchesOf(champ).find((rencontre) => rencontre.id === verifie.matchId);
  if (!match) return fail("Ce match ne figure plus au calendrier.", 404);
  if (!isPredictable(match)) {
    return fail('Les pronostics sont fermés pour ce match.', 409);
  }

  const enregistre = await savePrediction(env.DB, id, verifie.matchId, verifie.home, verifie.away);
  if (!enregistre) return fail('Ce pronostic a déjà été réglé.', 409);

  return json({
    ok: true,
    prediction: { matchId: verifie.matchId, home: verifie.home, away: verifie.away, settled: false, outcome: '', awarded: 0 }
  });
}
