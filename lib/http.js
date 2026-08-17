/**
 * Helpers HTTP partagés par toutes les Pages Functions.
 */

const NO_STORE = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

/** Réponse JSON (jamais mise en cache). */
export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: { ...NO_STORE, ...(init.headers || {}) }
  });
}

/** Réponse d'erreur normalisée : `{ ok: false, error: "…" }`. */
export function fail(message, status = 400, extra = {}) {
  return json({ ok: false, error: message, ...extra }, { status });
}

/** 405 avec l'en-tête `Allow` correctement rempli. */
export function methodNotAllowed(allowed) {
  return json(
    { ok: false, error: `Méthode non autorisée. Utilisez : ${allowed.join(', ')}.` },
    { status: 405, headers: { Allow: allowed.join(', ') } }
  );
}

/**
 * Lit et parse un corps JSON en refusant les charges utiles trop grosses.
 * @returns {Promise<{ok: true, data: any} | {ok: false, response: Response}>}
 */
export async function readJson(request, maxBytes = 256 * 1024) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBytes) {
    return { ok: false, response: fail('Charge utile trop volumineuse.', 413) };
  }

  let text;
  try {
    text = await request.text();
  } catch {
    return { ok: false, response: fail('Corps de requête illisible.', 400) };
  }

  if (text.length > maxBytes) {
    return { ok: false, response: fail('Charge utile trop volumineuse.', 413) };
  }

  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, response: fail('JSON invalide.', 400) };
  }
}

/** Normalise une méthode HTTP (HEAD est traité comme GET par le runtime). */
export function isMethod(request, ...methods) {
  return methods.includes(request.method.toUpperCase());
}
