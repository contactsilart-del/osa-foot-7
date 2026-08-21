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
import { sanitizeContent, SCHEMA_VERSION } from '../../lib/validate.js';

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
     * panel. Son document ne connaît pas les sections ajoutées depuis : la
     * normalisation les remplacerait par du vide, et la migration ne pourrait
     * plus rien reconstruire — les données seraient perdues pour de bon.
     *
     * On compare au modèle courant, pas au document stocké : le client migre
     * toujours avant d'enregistrer, donc un numéro inférieur ne peut venir que
     * d'un code périmé. Le refus est franc, et le message dit quoi faire.
     */
    if (Number(content.version) < SCHEMA_VERSION) {
      return fail(
        "Cette page d'administration date d'avant la dernière mise à jour du site. "
        + "Rechargez-la (Ctrl+F5) avant d’enregistrer : en l'état, elle effacerait "
        + 'des sections du site.',
        409
      );
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
