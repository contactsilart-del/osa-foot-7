/**
 * Accès aux données : Cloudflare D1 pour le contenu et les messages,
 * Cloudflare KV pour les médias téléversés depuis l'admin.
 *
 * Le schéma est créé paresseusement : la toute première requête qui échoue avec
 * « no such table » déclenche la migration puis rejoue l'opération. Aucun script
 * manuel n'est donc indispensable — `schema.sql` reste fourni pour ceux qui
 * préfèrent provisionner explicitement.
 */

const CONTENT_KEY = 'site';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS content (
     key        TEXT PRIMARY KEY,
     value      TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS messages (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     name       TEXT NOT NULL,
     email      TEXT NOT NULL,
     subject    TEXT,
     message    TEXT NOT NULL,
     ip         TEXT,
     user_agent TEXT,
     is_read    INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_ip ON messages (ip, created_at)`
];

/** Erreur « table absente » renvoyée par D1/SQLite. */
function isMissingTable(error) {
  return /no such table/i.test(String(error?.message || error));
}

export async function ensureSchema(db) {
  await db.batch(SCHEMA.map((statement) => db.prepare(statement)));
}

/** Exécute `run` en créant le schéma à la volée s'il manque. */
async function withSchema(db, run) {
  try {
    return await run();
  } catch (error) {
    if (!isMissingTable(error)) throw error;
    await ensureSchema(db);
    return run();
  }
}

/* ─────────────────────────────────────────── Contenu ── */

/** @returns {Promise<{content: object, updatedAt: string} | null>} */
export async function readContent(db) {
  return withSchema(db, async () => {
    const row = await db
      .prepare('SELECT value, updated_at FROM content WHERE key = ?')
      .bind(CONTENT_KEY)
      .first();
    if (!row) return null;
    try {
      return { content: JSON.parse(row.value), updatedAt: row.updated_at };
    } catch {
      return null; // Contenu corrompu : on retombe sur les valeurs par défaut.
    }
  });
}

export async function writeContent(db, content) {
  const updatedAt = new Date().toISOString();
  await withSchema(db, () =>
    db
      .prepare(
        `INSERT INTO content (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      )
      .bind(CONTENT_KEY, JSON.stringify(content), updatedAt)
      .run()
  );
  return updatedAt;
}

export async function resetContent(db) {
  await withSchema(db, () =>
    db.prepare('DELETE FROM content WHERE key = ?').bind(CONTENT_KEY).run()
  );
}

/* ────────────────────────────────────────── Messages ── */

export async function insertMessage(db, message) {
  return withSchema(db, () =>
    db
      .prepare(
        `INSERT INTO messages (name, email, subject, message, ip, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        message.name,
        message.email,
        message.subject || '',
        message.message,
        message.ip || '',
        message.userAgent || '',
        new Date().toISOString()
      )
      .run()
  );
}

export async function listMessages(db, limit = 100) {
  return withSchema(db, async () => {
    const { results } = await db
      .prepare(
        `SELECT id, name, email, subject, message, is_read, created_at
         FROM messages ORDER BY created_at DESC LIMIT ?`
      )
      .bind(limit)
      .all();
    return results || [];
  });
}

export async function markMessageRead(db, id, isRead) {
  await withSchema(db, () =>
    db.prepare('UPDATE messages SET is_read = ? WHERE id = ?').bind(isRead ? 1 : 0, id).run()
  );
}

export async function deleteMessage(db, id) {
  await withSchema(db, () =>
    db.prepare('DELETE FROM messages WHERE id = ?').bind(id).run()
  );
}

/**
 * Nombre de messages reçus depuis une adresse IP sur une fenêtre glissante.
 * Sert de garde-fou anti-spam très simple sur le formulaire de contact.
 */
export async function countRecentMessagesFromIp(db, ip, windowMinutes = 60) {
  if (!ip) return 0;
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  return withSchema(db, async () => {
    const row = await db
      .prepare('SELECT COUNT(*) AS total FROM messages WHERE ip = ? AND created_at > ?')
      .bind(ip, since)
      .first();
    return Number(row?.total || 0);
  });
}

/* ──────────────────────────────────────────── Médias ── */

export const MEDIA_PREFIX = 'media/';

export async function listMedia(kv, limit = 200) {
  const listing = await kv.list({ prefix: MEDIA_PREFIX, limit });
  return listing.keys.map((key) => ({
    key: key.name.slice(MEDIA_PREFIX.length),
    path: `/api/media/${key.name.slice(MEDIA_PREFIX.length)}`,
    ...(key.metadata || {})
  }));
}

export async function putMedia(kv, key, buffer, metadata) {
  await kv.put(MEDIA_PREFIX + key, buffer, { metadata });
}

export async function getMedia(kv, key) {
  return kv.getWithMetadata(MEDIA_PREFIX + key, { type: 'arrayBuffer' });
}

export async function deleteMedia(kv, key) {
  await kv.delete(MEDIA_PREFIX + key);
}
