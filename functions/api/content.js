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

    let content;
    try {
      content = sanitizeContent(body.data?.content ?? body.data);
    } catch (error) {
      return fail(error.message || 'Contenu invalide.', 422);
    }

    /**
     * Garde-fou contre l'onglet resté ouvert sur une version antérieure du
     * panel : son document ignore les sections ajoutées depuis, et
     * l'enregistrer les effacerait. Le numéro de modèle sert d'arbitre — il
     * n'est jamais estampillé par le serveur, donc il dit bien d'où vient le
     * document, pas quand il a été reçu.
     */
    try {
      const actuel = Number((await readContent(env.DB))?.content?.version) || 0;
      if (actuel && Number(content.version) < actuel) {
        return fail(
          "Cette page d'administration date d'avant la dernière mise à jour du site. "
          + "Rechargez-la (Ctrl+F5) avant d’enregistrer, sinon des sections seraient perdues.",
          409
        );
      }
    } catch (error) {
      // Base illisible : l'écriture qui suit échouera de toute façon, avec un
      // message plus précis. On ne bloque pas l'enregistrement pour autant.
      console.error('[content:version]', error);
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
