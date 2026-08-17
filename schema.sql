-- ============================================================
--  OSA FOOT 7 — schéma de la base D1
--
--  Ce fichier est OPTIONNEL : les tables sont créées automatiquement
--  à la première écriture (voir lib/store.js). Il reste fourni pour
--  provisionner explicitement la base :
--
--     npm run db:init          (base distante)
--     npm run db:init:local    (base locale, pour `npm run dev`)
-- ============================================================

-- Document de contenu du site, stocké en JSON sous la clé « site ».
-- Un seul enregistrement : l'édition est atomique et facile à sauvegarder.
CREATE TABLE IF NOT EXISTS content (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Messages reçus via le formulaire de contact public.
CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  subject    TEXT,
  message    TEXT NOT NULL,
  ip         TEXT,
  user_agent TEXT,
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- Tri de la boîte de réception + limitation anti-spam par IP.
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_ip ON messages (ip, created_at);
