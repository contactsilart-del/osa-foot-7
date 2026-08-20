/**
 * `/api/club/reset` — remise à zéro du jeu de packs.
 *
 *   POST  efface toutes les collections et rend à chaque compte son stock de
 *         départ, comme au premier jour.
 *
 * Réservé à l'administration : c'est une opération irréversible, à faire après
 * un rééquilibrage des notes ou des raretés, quand les collections déjà
 * constituées ne reflètent plus les règles du jeu.
 *
 * Les comptes eux-mêmes ne sont pas touchés : pseudo et mot de passe restent
 * valables, personne n'a à se réinscrire.
 */

import { json, fail, methodNotAllowed, isMethod } from '../../../lib/http.js';
import { requireAuth, checkOrigin } from '../../../lib/auth.js';
import { resetPlayerProgress } from '../../../lib/store.js';
import { SIGNUP_PACKS, parisDay } from '../../../lib/players.js';

export async function onRequest({ request, env }) {
  if (!isMethod(request, 'POST')) return methodNotAllowed(['POST']);
  if (!env.DB) {
    return fail("La base de données n'est pas configurée.", 503);
  }
  if (!checkOrigin(request)) return fail('Origine non autorisée.', 403);

  const refus = await requireAuth(request, env);
  if (refus) return refus;

  // Le jour est marqué comme déjà crédité : une remise à zéro ne doit pas
  // offrir les cinq packs du jour en plus des quinze de départ.
  const resultat = await resetPlayerProgress(env.DB, SIGNUP_PACKS, parisDay());

  return json({ ok: true, ...resultat, packs: SIGNUP_PACKS });
}
