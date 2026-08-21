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
  `CREATE INDEX IF NOT EXISTS idx_messages_ip ON messages (ip, created_at)`,
  `CREATE TABLE IF NOT EXISTS users (
     id             INTEGER PRIMARY KEY AUTOINCREMENT,
     username       TEXT NOT NULL,
     username_key   TEXT NOT NULL UNIQUE,
     password_hash  TEXT NOT NULL,
     salt           TEXT NOT NULL,
     packs          INTEGER NOT NULL DEFAULT 0,
     opened         INTEGER NOT NULL DEFAULT 0,
     last_grant_day TEXT NOT NULL DEFAULT '',
     ip             TEXT,
     created_at     TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_users_ip ON users (ip, created_at)`,
  `CREATE TABLE IF NOT EXISTS user_cards (
     user_id   INTEGER NOT NULL,
     player_id TEXT NOT NULL,
     count     INTEGER NOT NULL DEFAULT 0,
     first_at  TEXT NOT NULL,
     PRIMARY KEY (user_id, player_id)
   )`,
  /*
   * Les mises. Une par parieur et par pari, modifiable tant qu'elle n'est pas
   * réglée : c'est la contrainte d'unicité qui permet de changer d'avis sans
   * jamais dédoubler la mise, et `settled_at` qui empêche un même pari de
   * rapporter ses packs deux fois.
   *
   * `answer` est volontairement du texte : « 2-1 » pour un score, l'identifiant
   * de l'option pour tout le reste. Une seule table, une seule règle de
   * versement — le jour où l'on invente un nouveau type de pari, la base n'a
   * pas à bouger.
   */
  `CREATE TABLE IF NOT EXISTS wagers (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id    INTEGER NOT NULL,
     bet_id     TEXT NOT NULL,
     answer     TEXT NOT NULL,
     created_at TEXT NOT NULL,
     settled_at TEXT,
     outcome    TEXT NOT NULL DEFAULT '',
     awarded    INTEGER NOT NULL DEFAULT 0,
     UNIQUE (user_id, bet_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_wagers_bet ON wagers (bet_id)`,
  /*
   * Héritage : les pronostics de score d'avant les paris. La table reste
   * déclarée pour que la reprise ponctuelle ci-dessous (`importPredictions`)
   * trouve de quoi lire, y compris sur une base fraîchement créée.
   */
  `CREATE TABLE IF NOT EXISTS predictions (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id    INTEGER NOT NULL,
     match_id   TEXT NOT NULL,
     home       INTEGER NOT NULL,
     away       INTEGER NOT NULL,
     created_at TEXT NOT NULL,
     settled_at TEXT,
     outcome    TEXT NOT NULL DEFAULT '',
     awarded    INTEGER NOT NULL DEFAULT 0,
     UNIQUE (user_id, match_id)
   )`
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

/* ──────────────────────────────── Comptes supporters ── */

const CHAMPS_USER = 'id, username, username_key, password_hash, salt, packs, opened, last_grant_day, created_at';

export async function findUserByKey(db, key) {
  return withSchema(db, async () =>
    db.prepare(`SELECT ${CHAMPS_USER} FROM users WHERE username_key = ?`).bind(key).first());
}

export async function findUserById(db, id) {
  return withSchema(db, async () =>
    db.prepare(`SELECT ${CHAMPS_USER} FROM users WHERE id = ?`).bind(id).first());
}

/** Nombre d'inscriptions depuis une même adresse depuis `since` (ISO). */
export async function countSignups(db, ip, since) {
  return withSchema(db, async () => {
    const row = await db
      .prepare('SELECT COUNT(*) AS n FROM users WHERE ip = ? AND created_at > ?')
      .bind(ip || '', since)
      .first();
    return Number(row?.n) || 0;
  });
}

/** @returns {Promise<object|null>} le compte créé, ou `null` si le pseudo est pris. */
export async function createUser(db, user) {
  return withSchema(db, async () => {
    try {
      await db
        .prepare(`INSERT INTO users (username, username_key, password_hash, salt, packs, last_grant_day, ip, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(user.username, user.usernameKey, user.passwordHash, user.salt,
              user.packs, user.day, user.ip || '', new Date().toISOString())
        .run();
    } catch (error) {
      // Course entre deux inscriptions simultanées : l'unicité tranche.
      if (/UNIQUE|constraint/i.test(String(error?.message || error))) return null;
      throw error;
    }
    return findUserByKey(db, user.usernameKey);
  });
}

/** Enregistre le crédit quotidien. */
export async function setUserPacks(db, id, packs, day) {
  return withSchema(db, async () => {
    await db.prepare('UPDATE users SET packs = ?, last_grant_day = ? WHERE id = ?')
      .bind(packs, day, id).run();
  });
}

/**
 * Décompte un pack. L'opération est conditionnelle : deux ouvertures lancées en
 * même temps ne peuvent pas consommer le même pack, faute de quoi on ouvrirait
 * plus de packs qu'on n'en possède.
 *
 * @returns {Promise<boolean>} `false` s'il ne restait aucun pack.
 */
export async function consumePack(db, id) {
  return withSchema(db, async () => {
    const result = await db
      .prepare('UPDATE users SET packs = packs - 1, opened = opened + 1 WHERE id = ? AND packs > 0')
      .bind(id).run();
    const changes = result?.meta?.changes ?? result?.meta?.changed_db ?? 0;
    return Number(changes) > 0;
  });
}

/** Ajoute les cartes tirées à la collection. */
export async function addCards(db, userId, playerIds) {
  return withSchema(db, async () => {
    const now = new Date().toISOString();
    const statements = playerIds.map((playerId) => db
      .prepare(`INSERT INTO user_cards (user_id, player_id, count, first_at) VALUES (?, ?, 1, ?)
                ON CONFLICT(user_id, player_id) DO UPDATE SET count = count + 1`)
      .bind(userId, playerId, now));
    if (statements.length) await db.batch(statements);
  });
}

export async function listCards(db, userId) {
  return withSchema(db, async () => {
    const { results } = await db
      .prepare('SELECT player_id, count, first_at FROM user_cards WHERE user_id = ?')
      .bind(userId).all();
    return results || [];
  });
}

/** Classement des collectionneurs : le plus de joueurs différents d'abord. */
export async function topCollectors(db, limit = 10) {
  return withSchema(db, async () => {
    const { results } = await db
      .prepare(`SELECT u.username AS username, u.opened AS opened,
                       COUNT(c.player_id) AS distinct_cards
                FROM users u
                LEFT JOIN user_cards c ON c.user_id = u.id
                GROUP BY u.id
                ORDER BY distinct_cards DESC, u.opened ASC
                LIMIT ?`)
      .bind(limit).all();
    return results || [];
  });
}

/**
 * Remet le jeu de packs à zéro pour tout le monde : collections effacées,
 * stock de départ rendu, compteur d'ouvertures remis à zéro. Les comptes ne
 * sont pas supprimés — chacun retrouve le sien, simplement vide.
 *
 * @returns {Promise<{users: number, cards: number}>} ce qui a été touché.
 */
export async function resetPlayerProgress(db, packs, day) {
  return withSchema(db, async () => {
    const cartes = await db.prepare('DELETE FROM user_cards').run();
    const comptes = await db
      .prepare("UPDATE users SET packs = ?, opened = 0, last_grant_day = ?")
      .bind(packs, day).run();
    const change = (resultat) => Number(resultat?.meta?.changes ?? 0) || 0;
    return { users: change(comptes), cards: change(cartes) };
  });
}

/* ────────────────────────────────────────────── Mises ── */

export async function listWagers(db, userId) {
  return withSchema(db, async () => {
    const { results } = await db
      .prepare(`SELECT id, bet_id, answer, created_at, settled_at, outcome, awarded
                FROM wagers WHERE user_id = ? ORDER BY created_at DESC`)
      .bind(userId).all();
    return results || [];
  });
}

/**
 * Enregistre ou corrige une mise.
 *
 * La clause `WHERE wagers.settled_at IS NULL` du `DO UPDATE` interdit de changer
 * d'avis une fois le pari réglé : sans elle, on pourrait rejouer la bonne
 * réponse après coup et réclamer la mise entière.
 *
 * @returns {Promise<boolean>} `false` si la mise était déjà réglée.
 */
export async function saveWager(db, userId, betId, answer) {
  return withSchema(db, async () => {
    const resultat = await db
      .prepare(`INSERT INTO wagers (user_id, bet_id, answer, created_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT (user_id, bet_id) DO UPDATE
                  SET answer = excluded.answer,
                      created_at = excluded.created_at
                  WHERE wagers.settled_at IS NULL`)
      .bind(userId, betId, answer, new Date().toISOString()).run();
    return Number(resultat?.meta?.changes ?? 0) > 0;
  });
}

/**
 * Règle une mise et verse les packs gagnés.
 *
 * Le versement suit la mise à jour conditionnelle : si la ligne était déjà
 * réglée, rien n'est versé. En cas d'interruption entre les deux ordres, la mise
 * reste réglée sans crédit — on préfère cette perte-là au double versement, qui
 * serait invisible et cumulatif.
 *
 * @returns {Promise<boolean>} `true` si c'est bien cet appel qui l'a réglée.
 */
export async function settleWager(db, id, userId, outcome, packs) {
  return withSchema(db, async () => {
    const resultat = await db
      .prepare(`UPDATE wagers SET settled_at = ?, outcome = ?, awarded = ?
                WHERE id = ? AND settled_at IS NULL`)
      .bind(new Date().toISOString(), outcome, packs, id).run();
    if (Number(resultat?.meta?.changes ?? 0) === 0) return false;

    if (packs > 0) {
      await db.prepare('UPDATE users SET packs = packs + ? WHERE id = ?').bind(packs, userId).run();
    }
    return true;
  });
}

/** Le tableau des meilleurs parieurs : les packs gagnés font foi. */
export async function topPredictors(db, limit = 10) {
  return withSchema(db, async () => {
    const { results } = await db
      .prepare(`SELECT u.username AS username,
                       SUM(w.awarded) AS packs,
                       COUNT(w.id) AS total,
                       SUM(CASE WHEN w.outcome = 'exact' THEN 1 ELSE 0 END) AS exacts
                FROM wagers w
                JOIN users u ON u.id = w.user_id
                WHERE w.settled_at IS NOT NULL
                GROUP BY u.id
                ORDER BY packs DESC, exacts DESC, u.username ASC
                LIMIT ?`)
      .bind(limit).all();
    return results || [];
  });
}

/**
 * Reprend les pronostics d'avant les paris.
 *
 * Un ancien pronostic portait l'identifiant du match ; le pari de score ouvert
 * d'office sur ce même match s'appelle `match:<id>`. La correspondance est donc
 * mécanique, et `INSERT OR IGNORE` la rend rejouable sans risque — mais
 * `runOnce` s'en charge de toute façon, une fois pour toutes.
 *
 * @returns {Promise<number>} le nombre de mises reprises.
 */
export async function importPredictions(db) {
  return withSchema(db, async () => {
    const resultat = await db
      .prepare(`INSERT OR IGNORE INTO wagers
                  (user_id, bet_id, answer, created_at, settled_at, outcome, awarded)
                SELECT user_id, 'match:' || match_id, home || '-' || away,
                       created_at, settled_at, outcome, awarded
                FROM predictions`)
      .run();
    return Number(resultat?.meta?.changes ?? 0) || 0;
  });
}

/* ───────────────────────────── Opérations ponctuelles ── */

/**
 * Exécute `action` une seule fois pour de bon, la trace étant gardée en base.
 * Sert aux ajustements qui suivent un rééquilibrage : ils doivent s'appliquer
 * tout seuls, mais jamais deux fois.
 *
 * La table `content` fait office de dépôt clé/valeur ; le préfixe `flag:` la
 * sépare du document du site, qui vit sous sa propre clé.
 *
 * @returns {Promise<any|null>} le résultat de l'action, ou `null` si elle avait
 *   déjà été jouée.
 */
export async function runOnce(db, key, action) {
  return withSchema(db, async () => {
    const marque = 'flag:' + key;
    const deja = await db.prepare('SELECT value FROM content WHERE key = ?').bind(marque).first();
    if (deja) return null;

    const resultat = await action();
    await db
      .prepare('INSERT OR REPLACE INTO content (key, value, updated_at) VALUES (?, ?, ?)')
      .bind(marque, 'done', new Date().toISOString())
      .run();
    return resultat;
  });
}

/**
 * Ramène les stocks au-dessus de `max` à cette valeur. Les comptes déjà en
 * dessous ne sont pas touchés : on retire l'excédent, on ne redistribue rien.
 *
 * @returns {Promise<number>} le nombre de comptes ajustés.
 */
export async function trimPacks(db, max) {
  return withSchema(db, async () => {
    const resultat = await db
      .prepare('UPDATE users SET packs = ? WHERE packs > ?')
      .bind(max, max).run();
    return Number(resultat?.meta?.changes ?? 0) || 0;
  });
}
