/**
 * `/api/session` — cycle de vie de la session d'administration.
 *
 *  GET    → état de la session       { ok, authenticated, configured }
 *  POST   → connexion  { password }  → dépose le cookie signé
 *  DELETE → déconnexion              → efface le cookie
 */

import { json, fail, methodNotAllowed, readJson } from '../../lib/http.js';
import {
  createToken, sessionCookie, clearedCookie, isAuthenticated, safeEqual, checkOrigin,
  SESSION_TTL_SECONDS
} from '../../lib/auth.js';

const ALLOWED = ['GET', 'POST', 'DELETE'];

/** Ralentit les tentatives infructueuses pour décourager le bruteforce. */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method.toUpperCase();

  if (method === 'GET') {
    return json({
      ok: true,
      configured: Boolean(env.ADMIN_PASSWORD),
      authenticated: await isAuthenticated(request, env),
      storage: {
        content: Boolean(env.DB),
        media: Boolean(env.MEDIA)
      }
    });
  }

  if (method === 'POST') {
    if (!checkOrigin(request)) return fail('Origine non autorisée.', 403);

    if (!env.ADMIN_PASSWORD) {
      return fail(
        "Administration non configurée. Définissez le secret ADMIN_PASSWORD (voir le README).",
        503
      );
    }

    const body = await readJson(request, 4096);
    if (!body.ok) return body.response;

    const password = typeof body.data?.password === 'string' ? body.data.password : '';

    if (!safeEqual(password, env.ADMIN_PASSWORD)) {
      await delay(600);
      return fail('Mot de passe incorrect.', 401);
    }

    const token = await createToken(env);
    return json(
      { ok: true, expiresIn: SESSION_TTL_SECONDS },
      { headers: { 'Set-Cookie': sessionCookie(token) } }
    );
  }

  if (method === 'DELETE') {
    return json({ ok: true }, { headers: { 'Set-Cookie': clearedCookie() } });
  }

  return methodNotAllowed(ALLOWED);
}
