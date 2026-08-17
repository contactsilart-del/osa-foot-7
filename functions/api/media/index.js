/**
 * `/api/media` — médiathèque de l'administration (stockage Cloudflare KV).
 *
 *  GET  → liste des fichiers téléversés (admin)
 *  POST → téléversement multipart, champ « file » (admin)
 *
 * KV a été préféré à R2 : il fait partie du palier gratuit sans exiger de carte
 * bancaire sur le compte Cloudflare, et une médiathèque de club tient largement
 * dans ses limites (1 Go, valeurs jusqu'à 25 Mo).
 */

import { json, fail, methodNotAllowed } from '../../../lib/http.js';
import { requireAuth, checkOrigin } from '../../../lib/auth.js';
import { listMedia, putMedia } from '../../../lib/store.js';

const ALLOWED = ['GET', 'POST'];
const MAX_BYTES = 5 * 1024 * 1024;

/** Types acceptés → extension canonique. Le SVG est exclu (risque de script). */
const TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif'
};

/** Vérifie la signature binaire du fichier, pour ne pas se fier au seul MIME déclaré. */
function detectType(bytes) {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';

  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (brand.startsWith('avif') || brand.startsWith('avis') || brand.startsWith('mif1')) return 'image/avif';
  }
  return null;
}

/** Nom de fichier sûr : ASCII, minuscules, sans chemin. */
function safeName(original) {
  const base = String(original || 'image')
    .split(/[\\/]/).pop()
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || 'image';
}

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method.toUpperCase();

  if (!ALLOWED.includes(method)) return methodNotAllowed(ALLOWED);

  const denied = await requireAuth(request, env);
  if (denied) return denied;

  if (!env.MEDIA) {
    return fail(
      "Aucun espace KV n'est lié à ce déploiement (binding « MEDIA »). Voir le README, étape 4.",
      503
    );
  }

  /* ─────────────────────────────────────────── Liste ── */
  if (method === 'GET') {
    try {
      return json({ ok: true, media: await listMedia(env.MEDIA) });
    } catch (error) {
      console.error('[media:list]', error);
      return fail('Lecture de la médiathèque impossible.', 500);
    }
  }

  /* ──────────────────────────────────── Téléversement ── */
  if (!checkOrigin(request)) return fail('Origine non autorisée.', 403);

  let form;
  try {
    form = await request.formData();
  } catch {
    return fail('Requête multipart invalide.', 400);
  }

  const file = form.get('file');
  if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
    return fail('Aucun fichier reçu (champ « file » attendu).', 400);
  }
  if (file.size > MAX_BYTES) {
    return fail(`Fichier trop lourd (${Math.round(file.size / 1024)} Ko). Maximum : 5 Mo.`, 413);
  }

  const buffer = await file.arrayBuffer();
  const contentType = detectType(new Uint8Array(buffer.slice(0, 16)));

  if (!contentType || !TYPES[contentType]) {
    return fail('Format non supporté. Formats acceptés : JPG, PNG, WebP, GIF, AVIF.', 415);
  }

  const key = `${Date.now().toString(36)}-${safeName(file.name)}.${TYPES[contentType]}`;

  try {
    await putMedia(env.MEDIA, key, buffer, {
      contentType,
      size: buffer.byteLength,
      name: String(file.name || '').slice(0, 80),
      uploadedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[media:put]', error);
    return fail('Téléversement impossible.', 500);
  }

  return json({
    ok: true,
    media: { key, path: `/api/media/${key}`, contentType, size: buffer.byteLength }
  }, { status: 201 });
}
