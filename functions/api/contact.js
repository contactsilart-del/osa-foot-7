/**
 * `/api/contact` — réception des messages du formulaire public.
 *
 * Les messages sont stockés en base D1 et consultables depuis l'onglet
 * « Messages » du panel d'administration. Trois garde-fous anti-spam :
 * champ piège (honeypot), validation stricte, limitation par adresse IP.
 */

import { json, fail, methodNotAllowed, readJson } from '../../lib/http.js';
import { checkOrigin } from '../../lib/auth.js';
import { insertMessage, countRecentMessagesFromIp } from '../../lib/store.js';
import { sanitizeContactMessage } from '../../lib/validate.js';

const MAX_PER_IP_PER_HOUR = 5;

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method.toUpperCase() !== 'POST') return methodNotAllowed(['POST']);
  if (!checkOrigin(request)) return fail('Origine non autorisée.', 403);

  if (!env.DB) {
    return fail(
      "Le formulaire n'est pas connecté à une base de données sur ce déploiement.",
      503
    );
  }

  const body = await readJson(request, 32 * 1024);
  if (!body.ok) return body.response;

  const result = sanitizeContactMessage(body.data);
  if (!result.ok) return fail(result.error, 422);

  const ip = request.headers.get('CF-Connecting-IP') || '';

  try {
    if (await countRecentMessagesFromIp(env.DB, ip) >= MAX_PER_IP_PER_HOUR) {
      return fail('Trop de messages envoyés. Merci de réessayer dans une heure.', 429);
    }

    await insertMessage(env.DB, {
      ...result.data,
      ip,
      userAgent: (request.headers.get('User-Agent') || '').slice(0, 200)
    });

    return json({ ok: true });
  } catch (error) {
    console.error('[contact]', error);
    return fail("Le message n'a pas pu être enregistré.", 500);
  }
}
