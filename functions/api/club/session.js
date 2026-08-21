/**
 * `/api/club/session` — comptes des supporters.
 *
 *   GET     profil du compte connecté (et crédit quotidien s'il est dû)
 *   POST    inscription ou connexion, selon `mode`
 *   DELETE  déconnexion
 *
 * Ces comptes ne servent qu'au jeu de packs : ils n'ouvrent aucun accès à
 * l'administration, dont la session reste un cookie distinct.
 */

import { json, fail, methodNotAllowed, readJson, isMethod } from '../../../lib/http.js';
import {
  checkOrigin, createPlayerToken, playerCookie, clearedPlayerCookie, currentUserId, safeEqual
} from '../../../lib/auth.js';
import {
  findUserByKey, findUserById, createUser, countSignups, setUserPacks, listCards, readContent,
  runOnce, trimPacks
} from '../../../lib/store.js';
import {
  validateCredentials, usernameKey, newSalt, hashPassword, applyDailyGrant, parisDay,
  SIGNUP_PACKS, STOCK_ADJUSTMENT, buildCollection
} from '../../../lib/players.js';
import { settleUserWagers } from '../../../lib/settle.js';
import { DEFAULT_CONTENT, migrateContent } from '../../../public/assets/js/content.js';

/** Inscriptions autorisées depuis une même adresse en 24 h. */
const SIGNUPS_PER_IP_PER_DAY = 5;

/** Délai imposé après un échec : décourage l'essai systématique. */
const WRONG_PASSWORD_DELAY_MS = 600;

const attendre = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '';
}

/** Le document du site, migré : c'est lui qui définit cartes et matchs. */
async function siteContent(env) {
  const stored = await readContent(env.DB);
  const content = stored?.content ? migrateContent(stored.content) : null;
  return content || DEFAULT_CONTENT;
}

/** L'effectif tel que le site l'affiche : c'est lui qui définit les cartes. */
function squadFrom(content) {
  const players = content?.squad?.players;
  return Array.isArray(players) && players.length ? players : DEFAULT_CONTENT.squad.players;
}

/**
 * Règle les paris arrivés à échéance et renvoie le compte remis à jour.
 * Les packs gagnés doivent apparaître ici aussi : un supporter qui ne va que
 * sur la page des packs verrait sinon un stock en retard sur ses gains.
 */
async function collectWinnings(env, user, content) {
  const gains = await settleUserWagers(env.DB, user.id, content);
  if (!gains.packs) return gains;
  const frais = await findUserById(env.DB, user.id);
  if (frais) user.packs = frais.packs;
  return gains;
}

/** Profil renvoyé au navigateur. Jamais de hachage ni de sel. */
async function profile(env, user, { granted = 0, content = null } = {}) {
  const players = squadFrom(content || await siteContent(env));
  const cartes = await listCards(env.DB, user.id);
  return {
    username: user.username,
    packs: Number(user.packs) || 0,
    opened: Number(user.opened) || 0,
    granted,
    collection: buildCollection(players, cartes)
  };
}

/**
 * Le passage à 5 packs à l'inscription et 1 par jour laisse derrière lui des
 * stocks constitués sous l'ancien rythme. L'excédent est retiré une fois pour
 * toutes, dès le premier passage — pas de plafond permanent, juste un rattrapage.
 */
async function adjustStocksOnce(env) {
  try {
    await runOnce(env.DB, STOCK_ADJUSTMENT, () => trimPacks(env.DB, SIGNUP_PACKS));
  } catch (error) {
    // Un rattrapage qui échoue ne doit pas empêcher quiconque de se connecter.
    console.error('[club:stocks]', error);
  }
}

export async function onRequest({ request, env }) {
  if (!env.DB) {
    return fail("Les comptes ne sont pas disponibles : la base de données n'est pas configurée.", 503);
  }

  await adjustStocksOnce(env);

  if (isMethod(request, 'GET')) return handleGet(request, env);
  if (isMethod(request, 'POST')) return handlePost(request, env);
  if (isMethod(request, 'DELETE')) {
    return json({ ok: true, user: null }, { headers: { 'Set-Cookie': clearedPlayerCookie() } });
  }
  return methodNotAllowed(['GET', 'POST', 'DELETE']);
}

async function handleGet(request, env) {
  const id = await currentUserId(request, env);
  if (!id) return json({ ok: true, user: null });

  const user = await findUserById(env.DB, id);
  // Compte supprimé entre-temps : on efface le cookie devenu orphelin.
  if (!user) {
    return json({ ok: true, user: null }, { headers: { 'Set-Cookie': clearedPlayerCookie() } });
  }

  // Le crédit du jour tombe au premier passage, pas à une heure précise.
  const credit = applyDailyGrant(user);
  if (credit.granted) {
    await setUserPacks(env.DB, user.id, credit.packs, credit.day);
    user.packs = credit.packs;
    user.last_grant_day = credit.day;
  }

  const doc = await siteContent(env);
  const gains = await collectWinnings(env, user, doc);

  return json({
    ok: true,
    user: await profile(env, user, { granted: credit.granted, content: doc }),
    winnings: gains.packs ? gains : null
  });
}

async function handlePost(request, env) {
  if (!checkOrigin(request)) return fail('Origine non autorisée.', 403);

  const body = await readJson(request, 8 * 1024);
  if (!body.ok) return body.response;

  const mode = body.data?.mode === 'register' ? 'register' : 'login';
  const verifie = validateCredentials(body.data);
  if (!verifie.ok) return fail(verifie.error, 422);

  const key = usernameKey(verifie.username);
  const existant = await findUserByKey(env.DB, key);

  if (mode === 'register') {
    if (existant) return fail('Ce pseudo est déjà pris. Choisissez-en un autre.', 409);

    const ip = clientIp(request);
    const depuis = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    if (ip && (await countSignups(env.DB, ip, depuis)) >= SIGNUPS_PER_IP_PER_DAY) {
      return fail('Trop de comptes créés depuis cette connexion. Réessayez demain.', 429);
    }

    const salt = newSalt();
    const cree = await createUser(env.DB, {
      username: verifie.username,
      usernameKey: key,
      passwordHash: await hashPassword(verifie.password, salt),
      salt,
      // Les packs de bienvenue, et le crédit du jour déjà consommé :
      // s'inscrire ne doit pas rapporter le cumul des deux d'un coup.
      packs: SIGNUP_PACKS,
      day: parisDay(),
      ip
    });
    if (!cree) return fail('Ce pseudo est déjà pris. Choisissez-en un autre.', 409);

    return json(
      { ok: true, user: await profile(env, cree), created: true },
      { headers: { 'Set-Cookie': playerCookie(await createPlayerToken(env, cree.id)) } }
    );
  }

  // Connexion. Le message reste le même que le pseudo existe ou non.
  if (!existant) {
    await attendre(WRONG_PASSWORD_DELAY_MS);
    return fail('Pseudo ou mot de passe incorrect.', 401);
  }

  const hash = await hashPassword(verifie.password, existant.salt);
  if (!safeEqual(hash, existant.password_hash)) {
    await attendre(WRONG_PASSWORD_DELAY_MS);
    return fail('Pseudo ou mot de passe incorrect.', 401);
  }

  const credit = applyDailyGrant(existant);
  if (credit.granted) {
    await setUserPacks(env.DB, existant.id, credit.packs, credit.day);
    existant.packs = credit.packs;
  }

  const doc = await siteContent(env);
  const gains = await collectWinnings(env, existant, doc);

  return json(
    {
      ok: true,
      user: await profile(env, existant, { granted: credit.granted, content: doc }),
      winnings: gains.packs ? gains : null
    },
    { headers: { 'Set-Cookie': playerCookie(await createPlayerToken(env, existant.id)) } }
  );
}
