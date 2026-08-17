/**
 * `/api/messages/:id` — actions sur un message (admin).
 *
 *  PATCH  { isRead: boolean } → marque lu / non lu
 *  DELETE                     → suppression définitive
 */

import { json, fail, methodNotAllowed, readJson } from '../../../lib/http.js';
import { requireAuth, checkOrigin } from '../../../lib/auth.js';
import { markMessageRead, deleteMessage } from '../../../lib/store.js';

const ALLOWED = ['PATCH', 'DELETE'];

export async function onRequest(context) {
  const { request, env, params } = context;
  const method = request.method.toUpperCase();

  if (!ALLOWED.includes(method)) return methodNotAllowed(ALLOWED);
  if (!checkOrigin(request)) return fail('Origine non autorisée.', 403);

  const denied = await requireAuth(request, env);
  if (denied) return denied;

  if (!env.DB) return fail("Aucune base D1 n'est liée à ce déploiement.", 503);

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return fail('Identifiant invalide.', 400);

  try {
    if (method === 'DELETE') {
      await deleteMessage(env.DB, id);
      return json({ ok: true, deleted: id });
    }

    const body = await readJson(request, 2048);
    if (!body.ok) return body.response;

    await markMessageRead(env.DB, id, Boolean(body.data?.isRead));
    return json({ ok: true, id, isRead: Boolean(body.data?.isRead) });
  } catch (error) {
    console.error('[messages:mutate]', error);
    return fail('Opération impossible.', 500);
  }
}
