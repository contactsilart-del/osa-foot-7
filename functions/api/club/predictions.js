/**
 * `/api/club/predictions` — les paris des supporters.
 *
 *   GET   les paris ouverts, les mises du visiteur, le tableau des meilleurs
 *         parieurs. Les mises arrivées à échéance sont réglées au passage, et
 *         les packs gagnés versés.
 *   POST  enregistre ou corrige une mise, tant que le pari est ouvert.
 *
 * La bonne réponse n'est jamais transmise par le navigateur : elle est relue
 * depuis le document du site — le score du match, ou la réponse désignée par le
 * bureau — seule source qui fasse foi. Sans quoi il suffirait de modifier la
 * page pour gagner.
 *
 * La page, elle, dessine les paris depuis le document public — c'est la même
 * source, lue par le même module. Les répéter ici les ferait diverger le jour
 * où l'un des deux changerait.
 *
 * L'adresse garde son nom d'origine : un onglet resté ouvert sur l'ancienne
 * version du site continue de l'appeler, et une page en cache vaut mieux qu'un
 * 404. Le format de la réponse, lui, parle bien de paris.
 */

import { json, fail, methodNotAllowed, readJson, isMethod } from '../../../lib/http.js';
import { checkOrigin, currentUserId, clearedPlayerCookie } from '../../../lib/auth.js';
import {
  findUserById, readContent, saveWager, listWagers, topPredictors, runOnce, importPredictions
} from '../../../lib/store.js';
import { settleUserWagers } from '../../../lib/settle.js';
import { DEFAULT_CONTENT, migrateContent } from '../../../public/assets/js/content.js';
import { betById, isOpen, normalizeAnswer } from '../../../public/assets/js/bets.js';

/** Le contenu du site tel qu'il est affiché, migrations comprises. */
async function siteContent(env) {
  const stored = await readContent(env.DB);
  const content = stored?.content ? migrateContent(stored.content) : null;
  return content && typeof content === 'object' ? content : DEFAULT_CONTENT;
}

/** Ce qu'on renvoie au navigateur pour une mise. */
function publicWager(row) {
  return {
    betId: row.bet_id,
    answer: String(row.answer ?? ''),
    settled: Boolean(row.settled_at),
    outcome: row.outcome || '',
    awarded: Number(row.awarded) || 0
  };
}

export async function onRequest({ request, env }) {
  if (!env.DB) {
    return fail("Les paris ne sont pas disponibles : la base de données n'est pas configurée.", 503);
  }

  if (isMethod(request, 'GET')) return handleGet(request, env);
  if (isMethod(request, 'POST')) return handlePost(request, env);
  return methodNotAllowed(['GET', 'POST']);
}

async function handleGet(request, env) {
  const content = await siteContent(env);

  /*
   * Les pronostics d'avant les paris rejoignent la table des mises. La reprise
   * n'a lieu qu'une fois pour de bon, et un échec ne doit surtout pas priver la
   * page de son affichage.
   */
  try {
    await runOnce(env.DB, 'wagers:import-predictions', () => importPredictions(env.DB));
  } catch (error) {
    console.error('[paris:reprise]', error);
  }

  const board = await topPredictors(env.DB);

  const id = await currentUserId(request, env);
  if (!id) return json({ ok: true, user: null, wagers: [], settled: null, board });

  const user = await findUserById(env.DB, id);
  if (!user) {
    return json({ ok: true, user: null, wagers: [], settled: null, board },
      { headers: { 'Set-Cookie': clearedPlayerCookie() } });
  }

  // Les gains tombent ici : c'est le premier passage du parieur après coup.
  const regles = await settleUserWagers(env.DB, user.id, content);
  const lignes = await listWagers(env.DB, user.id);
  // Le stock a pu changer à l'instant : on le relit plutôt que de l'additionner.
  const frais = regles.packs ? await findUserById(env.DB, user.id) : user;

  return json({
    ok: true,
    user: { username: frais.username, packs: Number(frais.packs) || 0 },
    wagers: lignes.map(publicWager),
    settled: regles.packs || regles.details.length ? regles : null,
    board
  });
}

async function handlePost(request, env) {
  if (!checkOrigin(request)) return fail('Origine non autorisée.', 403);

  const id = await currentUserId(request, env);
  if (!id) return fail('Connectez-vous pour parier.', 401);

  const body = await readJson(request, 4 * 1024);
  if (!body.ok) return body.response;

  const content = await siteContent(env);
  const betId = String(body.data?.betId ?? '').trim().slice(0, 120);
  if (!betId) return fail('Pari inconnu.', 422);

  const pari = betById(content, betId);
  if (!pari) return fail("Ce pari ne figure plus sur le site.", 404);
  if (!isOpen(content, pari)) return fail('Les mises sont fermées sur ce pari.', 409);

  const answer = normalizeAnswer(content, pari, body.data?.answer);
  if (answer === null) {
    return fail(pari.type === 'score'
      ? 'Indiquez deux scores entiers, entre 0 et 30.'
      : 'Choisissez une des réponses proposées.', 422);
  }

  const enregistre = await saveWager(env.DB, id, betId, answer);
  if (!enregistre) return fail('Ce pari a déjà été réglé.', 409);

  return json({
    ok: true,
    wager: { betId, answer, settled: false, outcome: '', awarded: 0 }
  });
}
