/**
 * Authentification de l'espace d'administration.
 *
 * Modèle : un mot de passe unique (secret `ADMIN_PASSWORD`) échangé contre un
 * jeton signé HMAC-SHA256 stocké dans un cookie `HttpOnly` + `Secure`.
 * Aucune session n'est persistée côté serveur : le jeton porte lui-même sa date
 * d'expiration, ce qui évite toute écriture en base à chaque requête.
 */

import { fail } from './http.js';

export const COOKIE_NAME = 'osa_session';
export const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 heures

const encoder = new TextEncoder();

/* ────────────────────────────────────────── base64url ── */

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
    .padEnd(value.length + ((4 - (value.length % 4)) % 4), '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/* ─────────────────────────────────────── comparaisons ── */

/** Comparaison à temps constant (évite les attaques temporelles). */
export function safeEqual(a, b) {
  const bufA = encoder.encode(String(a));
  const bufB = encoder.encode(String(b));
  // On compare toujours sur la même longueur pour ne pas fuiter d'information.
  const length = Math.max(bufA.length, bufB.length);
  let diff = bufA.length ^ bufB.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (bufA[i] ?? 0) ^ (bufB[i] ?? 0);
  }
  return diff === 0;
}

/* ───────────────────────────────────────────── jetons ── */

async function hmac(secret, payload) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return toBase64Url(new Uint8Array(signature));
}

/**
 * Le secret de signature. On préfère `SESSION_SECRET`, mais on retombe sur
 * `ADMIN_PASSWORD` pour qu'un déploiement minimal fonctionne : changer le mot de
 * passe invalide alors automatiquement toutes les sessions ouvertes.
 */
function signingSecret(env) {
  return env.SESSION_SECRET || env.ADMIN_PASSWORD || '';
}

/** Signe un objet quelconque : `charge.signature`, tous deux en base64url. */
async function signPayload(env, data) {
  const payload = toBase64Url(encoder.encode(JSON.stringify(data)));
  const signature = await hmac(signingSecret(env), payload);
  return `${payload}.${signature}`;
}

/** Relit un jeton signé. `null` si la signature ou la date ne tient pas. */
async function readPayload(env, token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = await hmac(signingSecret(env), payload);
  if (!safeEqual(signature, expected)) return null;

  try {
    const data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
    return typeof data.exp === 'number' && data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

export async function createToken(env, ttlSeconds = SESSION_TTL_SECONDS) {
  return signPayload(env, { exp: Date.now() + ttlSeconds * 1000, v: 1 });
}

export async function verifyToken(env, token) {
  const data = await readPayload(env, token);
  // Un jeton de supporter ne doit jamais ouvrir l'administration.
  return Boolean(data) && data.uid === undefined;
}

/* ──────────────────────────── Sessions des supporters ── */

export const PLAYER_COOKIE = 'osa_player';
export const PLAYER_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 jours

export async function createPlayerToken(env, userId, ttlSeconds = PLAYER_TTL_SECONDS) {
  return signPayload(env, { uid: Number(userId), exp: Date.now() + ttlSeconds * 1000, v: 1 });
}

/** @returns {Promise<number|null>} l'identifiant du compte connecté. */
export async function readPlayerToken(env, token) {
  const data = await readPayload(env, token);
  return data && Number.isFinite(data.uid) ? Number(data.uid) : null;
}

export function playerCookie(token, maxAge = PLAYER_TTL_SECONDS) {
  return `${PLAYER_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearedPlayerCookie() {
  return `${PLAYER_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/** L'identifiant du supporter connecté, ou `null`. */
export async function currentUserId(request, env) {
  const token = readCookie(request, PLAYER_COOKIE);
  return token ? readPlayerToken(env, token) : null;
}

/* ──────────────────────────────────────────── cookies ── */

export function readCookie(request, name) {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return null;
}

export function sessionCookie(token, maxAge = SESSION_TTL_SECONDS) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export function clearedCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

/* ────────────────────────────────────────────── garde ── */

/** `true` si la requête porte une session valide. */
export async function isAuthenticated(request, env) {
  const token = readCookie(request, COOKIE_NAME);
  if (!token) return false;
  return verifyToken(env, token);
}

/**
 * Garde à placer en tête des handlers protégés.
 * @returns {Promise<Response|null>} une réponse d'erreur, ou `null` si l'accès est accordé.
 */
export async function requireAuth(request, env) {
  if (!env.ADMIN_PASSWORD) {
    return fail(
      "L'administration n'est pas configurée : définissez le secret ADMIN_PASSWORD.",
      503
    );
  }
  if (await isAuthenticated(request, env)) return null;
  return fail('Session expirée ou absente. Reconnectez-vous.', 401);
}

/**
 * Vérifie l'origine des requêtes mutantes (défense en profondeur contre le CSRF,
 * en complément de `SameSite=Strict`).
 */
export function checkOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true; // Requête non-navigateur (curl, tests) : SameSite protège déjà.
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}
