/**
 * `/api/media/:key` — service et suppression d'un média.
 *
 *  GET    → renvoie le binaire (public : ces images sont affichées sur le site)
 *  DELETE → supprime le média (admin)
 *
 * Les clés sont uniques et immuables (préfixe horodaté), donc la réponse peut
 * être mise en cache très agressivement.
 */

import { json, fail, methodNotAllowed } from '../../../lib/http.js';
import { requireAuth, checkOrigin } from '../../../lib/auth.js';
import { getMedia, deleteMedia } from '../../../lib/store.js';

const ALLOWED = ['GET', 'HEAD', 'DELETE'];
const KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,119}$/i;
const SAFE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

export async function onRequest(context) {
  const { request, env, params } = context;
  const method = request.method.toUpperCase();

  if (!ALLOWED.includes(method)) return methodNotAllowed(ALLOWED);

  const key = Array.isArray(params.key) ? params.key.join('/') : String(params.key || '');
  if (!KEY_PATTERN.test(key)) return fail('Clé de média invalide.', 400);

  if (!env.MEDIA) return fail("Aucun espace KV n'est lié à ce déploiement.", 503);

  /* ──────────────────────────────────────── Suppression ── */
  if (method === 'DELETE') {
    if (!checkOrigin(request)) return fail('Origine non autorisée.', 403);
    const denied = await requireAuth(request, env);
    if (denied) return denied;

    await deleteMedia(env.MEDIA, key);
    return json({ ok: true, deleted: key });
  }

  /* ──────────────────────────────────────────── Lecture ── */
  let stored;
  try {
    stored = await getMedia(env.MEDIA, key);
  } catch (error) {
    console.error('[media:get]', error);
    return fail('Média illisible.', 500);
  }

  if (!stored?.value) return fail('Média introuvable.', 404);

  const declared = stored.metadata?.contentType;
  const contentType = SAFE_TYPES.includes(declared) ? declared : 'application/octet-stream';
  const etag = `"${key}"`;

  if (request.headers.get('If-None-Match') === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  return new Response(method === 'HEAD' ? null : stored.value, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(stored.value.byteLength),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      ETag: etag
    }
  });
}
