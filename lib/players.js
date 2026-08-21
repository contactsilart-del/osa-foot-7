/**
 * Comptes des supporters et simulation de packs.
 *
 * Tout ce qui se calcule sans base de données est ici : validation des
 * identifiants, hachage du mot de passe, rareté d'une carte, tirage d'un pack et
 * crédit quotidien. Les fonctions sont pures (l'aléatoire et l'horloge sont
 * injectables), donc entièrement testables hors Cloudflare.
 *
 * C'est un jeu, pas un coffre-fort : les comptes ne donnent accès à rien d'autre
 * qu'à une collection de cartes fictives.
 */

import { overallOf, RARITIES, rarityOf } from '../public/assets/js/squad.js';

const encoder = new TextEncoder();

/* ══════════════════════════════════════ Identifiants ══ */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

/**
 * Clé de comparaison d'un pseudo : accents retirés, casse ignorée. « Valé » et
 * « vale » sont donc le même compte, ce qui évite les sosies trompeurs.
 */
export function usernameKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * @returns {{ok: true, username: string, password: string} | {ok: false, error: string}}
 */
export function validateCredentials(input) {
  const username = String(input?.username ?? '').trim();
  const password = String(input?.password ?? '');

  if (username.length < USERNAME_MIN) {
    return { ok: false, error: `Le pseudo doit faire au moins ${USERNAME_MIN} caractères.` };
  }
  if (username.length > USERNAME_MAX) {
    return { ok: false, error: `Le pseudo ne peut pas dépasser ${USERNAME_MAX} caractères.` };
  }
  if (!/^[\p{L}\p{N} _.-]+$/u.test(username)) {
    return { ok: false, error: 'Le pseudo n’accepte que des lettres, chiffres, espaces, tirets et points.' };
  }
  if (password.length < PASSWORD_MIN) {
    return { ok: false, error: `Le mot de passe doit faire au moins ${PASSWORD_MIN} caractères.` };
  }
  if (password.length > PASSWORD_MAX) {
    return { ok: false, error: 'Mot de passe trop long.' };
  }
  return { ok: true, username, password };
}

/* ═══════════════════════════════ Mot de passe ══ */

/**
 * PBKDF2-SHA256. Le nombre d'itérations est un compromis assumé : le budget
 * processeur d'une Pages Function est court, et il s'agit de comptes de jeu sans
 * valeur marchande. C'est sans commune mesure avec un hachage nu, et cela reste
 * bien en deçà du plafond de calcul de la plateforme.
 */
export const PBKDF2_ITERATIONS = 30000;

function toBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Sel aléatoire de 16 octets, en base64. */
export function newSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toBase64(bytes);
}

export async function hashPassword(password, salt, iterations = PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(String(password)), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(String(salt)), iterations },
    key,
    256
  );
  return toBase64(new Uint8Array(bits));
}

/* ═════════════════════════════════════════ Raretés ══ */

// Les raretés vivent dans squad.js : le navigateur en a besoin pour l'affichage
// des cartes, le serveur pour le tirage. Une seule table, deux usages.
export { RARITIES, rarityOf };

export function weightOf(player) {
  return rarityOf(player).weight;
}

/* ══════════════════════════════════════════ Packs ══ */

export const CARDS_PER_PACK = 3;
export const SIGNUP_PACKS = 5;
export const DAILY_PACKS = 1;

/**
 * Identifiant de l'ajustement de stock à jouer une seule fois. Le changer
 * relancera l'opération : c'est ainsi qu'on rattrape les stocks après un
 * rééquilibrage, sans laisser un plafond permanent en place.
 */
export const STOCK_ADJUSTMENT = 'packs-5-1';

/**
 * Tire les cartes d'un pack, pondérées par la rareté. Sans remise à l'intérieur
 * d'un même pack : trois fois la même carte d'un coup serait décevant.
 *
 * @param {object[]} players l'effectif complet
 * @param {number} count nombre de cartes
 * @param {() => number} random injectable, pour des tests déterministes
 */
export function drawCards(players, count = CARDS_PER_PACK, random = Math.random) {
  const restants = (Array.isArray(players) ? players : []).filter((player) => player?.id);
  const tirage = [];

  while (tirage.length < count && restants.length) {
    const poids = restants.map((player) => weightOf(player));
    const total = poids.reduce((somme, p) => somme + p, 0);
    let curseur = random() * total;
    let index = 0;
    while (index < restants.length - 1 && curseur >= poids[index]) {
      curseur -= poids[index];
      index += 1;
    }
    tirage.push(restants.splice(index, 1)[0].id);
  }

  return tirage;
}

/* ══════════════════════════════════ Crédit quotidien ══ */

/**
 * Le jour courant à Paris, au format `AAAA-MM-JJ`. C'est lui qui définit
 * minuit : sans fuseau explicite, le serveur (en UTC) créditerait les packs à
 * 1 h ou 2 h du matin selon la saison.
 */
export function parisDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date);
}

/**
 * Crédit du jour. Le stock est cumulable : les packs non ouverts se gardent, et
 * seuls cinq nouveaux arrivent au premier passage de chaque journée.
 *
 * @returns {{packs: number, day: string, granted: number}}
 */
export function applyDailyGrant(user, today = parisDay()) {
  const packs = Math.max(0, Number(user?.packs) || 0);
  if (user?.last_grant_day === today) {
    return { packs, day: today, granted: 0 };
  }
  return { packs: packs + DAILY_PACKS, day: today, granted: DAILY_PACKS };
}

/* ════════════════════════════════════════ Collection ══ */

/**
 * Assemble la collection pour l'affichage : une entrée par joueur de l'effectif,
 * avec le nombre d'exemplaires détenus et la rareté.
 */
export function buildCollection(players, owned) {
  const compte = new Map((owned || []).map((ligne) => [ligne.player_id, Number(ligne.count) || 0]));
  const cartes = (Array.isArray(players) ? players : [])
    .filter((player) => player?.id)
    .map((player) => ({
      id: player.id,
      count: compte.get(player.id) || 0,
      rarity: rarityOf(player).id,
      overall: overallOf(player)
    }));

  return {
    cards: cartes,
    owned: cartes.filter((carte) => carte.count > 0).length,
    total: cartes.length,
    duplicates: cartes.reduce((somme, carte) => somme + Math.max(0, carte.count - 1), 0)
  };
}
