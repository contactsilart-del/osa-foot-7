/**
 * `/api/messages` — boîte de réception du formulaire de contact (admin).
 *
 *  GET → liste des 100 derniers messages.
 */

import { json, fail, methodNotAllowed } from '../../../lib/http.js';
import { requireAuth } from '../../../lib/auth.js';
import { listMessages } from '../../../lib/store.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method.toUpperCase() !== 'GET') return methodNotAllowed(['GET']);

  const denied = await requireAuth(request, env);
  if (denied) return denied;

  if (!env.DB) return json({ ok: true, messages: [], storage: 'none' });

  try {
    return json({ ok: true, messages: await listMessages(env.DB) });
  } catch (error) {
    console.error('[messages:list]', error);
    return fail('Lecture des messages impossible.', 500);
  }
}
