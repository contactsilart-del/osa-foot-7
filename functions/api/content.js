/**
 * `/api/content` — document de contenu du site.
 *
 *  GET    → contenu publié (public). `content: null` = aucun contenu en base,
 *           le front utilise alors ses valeurs par défaut.
 *  PUT    → remplace le contenu (admin).
 *  DELETE → réinitialise (admin) : le site repart des valeurs par défaut.
 */

import { json, fail, methodNotAllowed, readJson } from '../../lib/http.js';
import { requireAuth, checkOrigin } from '../../lib/auth.js';
import { readContent, writeContent, resetContent } from '../../lib/store.js';
import { sanitizeContent } from '../../lib/validate.js';
import { deepMerge } from '../../public/assets/js/content.js';

const ALLOWED = ['GET', 'PUT', 'DELETE'];

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method.toUpperCase();

  /* ─────────────────────────────────────────── Lecture ── */
  if (method === 'GET' || method === 'HEAD') {
    // Pas de base attachée : déploiement statique, le front prend le relais.
    if (!env.DB) return json({ ok: true, content: null, storage: 'none' });

    try {
      const stored = await readContent(env.DB);
      return json({
        ok: true,
        content: stored?.content ?? null,
        updatedAt: stored?.updatedAt ?? null,
        storage: 'd1'
      });
    } catch (error) {
      console.error('[content:get]', error);
      // On ne casse jamais l'affichage public pour une erreur de base.
      return json({ ok: true, content: null, storage: 'error' });
    }
  }

  /* ─────────────────────────────────────────── Écriture ── */
  if (method === 'PUT' || method === 'DELETE') {
    if (!checkOrigin(request)) return fail('Origine non autorisée.', 403);

    const denied = await requireAuth(request, env);
    if (denied) return denied;

    if (!env.DB) {
      return fail(
        "Aucune base D1 n'est liée à ce déploiement (binding « DB »). Voir le README, étape 3.",
        503
      );
    }

    if (method === 'DELETE') {
      await resetContent(env.DB);
      return json({ ok: true, reset: true });
    }

    const body = await readJson(request, 512 * 1024);
    if (!body.ok) return body.response;

    /**
     * Une page d'administration restée ouverte pendant une mise à jour du site
     * ignore les sections ajoutées depuis : normaliser son document seul les
     * remplacerait par du vide.
     *
     * On refusait l'enregistrement ; c'était brutal et faillible — un module
     * JavaScript encore en cache suffisait à bloquer un panel pourtant à jour.
     * Le document reçu est désormais posé **par-dessus** celui en base : tout
     * ce qu'il dit fait foi, tout ce qu'il ignore est conservé. Rien ne se perd,
     * et rien ne se refuse.
     *
     * Les tableaux, eux, sont remplacés en entier : supprimer un joueur ou un
     * match reste possible.
     */
    const recu = body.data?.content ?? body.data;
    let base = null;
    try {
      base = (await readContent(env.DB))?.content ?? null;
    } catch (error) {
      console.error('[content:lecture]', error);
    }

    const complet = base && recu && typeof recu === 'object' && !Array.isArray(recu)
      ? deepMerge(base, recu)
      : recu;

    let content;
    try {
      content = sanitizeContent(complet);
    } catch (error) {
      return fail(error.message || 'Contenu invalide.', 422);
    }

    try {
      const updatedAt = await writeContent(env.DB, content);
      return json({ ok: true, updatedAt, content });
    } catch (error) {
      console.error('[content:put]', error);
      return fail("Enregistrement impossible : " + (error.message || 'erreur base de données'), 500);
    }
  }

  return methodNotAllowed(ALLOWED);
}
