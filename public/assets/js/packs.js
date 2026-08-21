/**
 * OSA FOOT 7 — comptes supporters et packs à collectionner.
 *
 * Un jeu, rien de plus : on se crée un compte, on reçoit quinze packs, puis cinq
 * de plus à chaque nouvelle journée, et on essaie de compléter la collection.
 * Le tirage a lieu sur le serveur — le navigateur ne fait qu'afficher.
 */

import { playerCardHTML, fullName, overallOf, rarityById, RARITIES } from './squad.js';

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const state = {
  content: null,
  user: null,
  mode: 'login',
  busy: false
};

function players() {
  return Array.isArray(state.content?.squad?.players) ? state.content.squad.players : [];
}

function playerById(id) {
  return players().find((player) => player.id === id) || null;
}

/* ═══════════════════════════════════════════ Réseau ══ */

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...options
  });
  let payload = {};
  try { payload = await response.json(); } catch { payload = {}; }
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Erreur ${response.status}.`);
  }
  return payload;
}

/* ═══════════════════════════════════════════ Rendu ══ */

function toast(message) {
  const boite = $('#toast');
  if (!boite) return;
  boite.textContent = message;
  boite.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { boite.hidden = true; }, 3200);
}

function setError(message) {
  const zone = $('#club-error');
  if (!zone) return;
  zone.textContent = message || '';
  zone.hidden = !message;
}

/** Une carte de la collection : possédée en couleur, manquante en silhouette. */
function collectionCardHTML(entry) {
  const player = playerById(entry.id);
  if (!player) return '';
  const rarete = rarityById(entry.rarity);
  const possedee = entry.count > 0;

  if (!possedee) {
    return `
      <li class="pack-slot pack-slot--locked" style="--rarity:${rarete.color}">
        <div class="pack-slot__locked">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a5 5 0 0 1 5 5v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v3h6V7a3 3 0 0 0-3-3z"/></svg>
          <span class="pack-slot__name">${esc(fullName(player))}</span>
          <span class="pack-slot__rarity">${esc(rarete.label)}</span>
        </div>
      </li>`;
  }

  return `
    <li class="pack-slot" style="--rarity:${rarete.color}">
      ${playerCardHTML(player, { href: `/effectif#joueur-${encodeURIComponent(player.id)}`, compact: true })}
      <span class="pack-slot__badge">${esc(rarete.label)}</span>
      ${entry.count > 1 ? `<span class="pack-slot__count">×${entry.count}</span>` : ''}
    </li>`;
}

function renderCollection() {
  const grille = $('#collection-grid');
  if (!grille) return;

  const collection = state.user?.collection;
  if (!collection) {
    grille.innerHTML = '';
    return;
  }

  // Les plus rares d'abord : c'est ce qu'on a envie de montrer.
  const ordre = RARITIES.map((rarete) => rarete.id);
  const cartes = [...collection.cards].sort((a, b) => {
    const ra = ordre.indexOf(a.rarity);
    const rb = ordre.indexOf(b.rarity);
    if (ra !== rb) return ra - rb;
    if ((b.count > 0) !== (a.count > 0)) return (b.count > 0) - (a.count > 0);
    return b.overall - a.overall;
  });

  grille.innerHTML = cartes.map(collectionCardHTML).join('');

  const progression = $('#collection-progress');
  if (progression) {
    const pourcent = collection.total ? Math.round((collection.owned / collection.total) * 100) : 0;
    progression.innerHTML = `
      <span class="collection-progress__bar"><i style="--fill:${pourcent}%"></i></span>
      <span class="collection-progress__text">
        <b>${collection.owned}/${collection.total}</b> joueurs collectionnés
        ${collection.duplicates ? `· ${collection.duplicates} doublon${collection.duplicates > 1 ? 's' : ''}` : ''}
      </span>`;
  }

  const detail = $('#collection-rarities');
  if (detail) {
    detail.innerHTML = RARITIES.map((rarete) => {
      const total = collection.cards.filter((c) => c.rarity === rarete.id).length;
      const eus = collection.cards.filter((c) => c.rarity === rarete.id && c.count > 0).length;
      if (!total) return '';
      return `
        <li style="--rarity:${rarete.color}">
          <b>${eus}/${total}</b><span>${esc(rarete.label)}</span>
        </li>`;
    }).join('');
  }
}

function renderAccount() {
  const gate = $('#club-gate');
  const app = $('#club-app');
  if (!gate || !app) return;

  const connecte = Boolean(state.user);
  gate.hidden = connecte;
  app.hidden = !connecte;

  if (!connecte) return;

  $('#club-name').textContent = state.user.username;
  $('#club-packs').textContent = String(state.user.packs);
  $('#club-opened').textContent = String(state.user.opened);

  const bouton = $('#club-open');
  bouton.disabled = state.busy || state.user.packs <= 0;
  $('#club-open-label').textContent = state.user.packs > 0
    ? `Ouvrir un pack (${state.user.packs})`
    : 'Plus de pack — revenez demain';

  renderCollection();
}

/** Révélation des cartes tirées, une par une. */
function revealCards(cards) {
  const zone = $('#pack-reveal');
  if (!zone) return;

  zone.innerHTML = cards.map((carte, index) => {
    const player = playerById(carte.id);
    const rarete = rarityById(carte.rarity);
    if (!player) return '';
    return `
      <div class="pack-reveal__card pack-reveal__card--${esc(carte.rarity)}"
           style="--rarity:${rarete.color}; --delay:${index * 320}ms">
        <span class="pack-reveal__rarity">${esc(rarete.label)}</span>
        ${playerCardHTML(player, { href: `/effectif#joueur-${encodeURIComponent(player.id)}`, compact: true })}
        <span class="pack-reveal__tag${carte.isNew ? ' is-new' : ''}">
          ${carte.isNew ? 'Nouvelle carte !' : 'Doublon'}
        </span>
      </div>`;
  }).join('');

  zone.hidden = false;
  const meilleure = cards.find((c) => c.rarity === 'ultra') || cards.find((c) => c.rarity === 'rare');
  if (meilleure) {
    const player = playerById(meilleure.id);
    if (player) toast(`${rarityById(meilleure.rarity).label} : ${fullName(player)} (${overallOf(player)}) !`);
  }
}

/* ═══════════════════════════════════════════ Actions ══ */

/**
 * Page vers laquelle revenir apres connexion, indiquee par `?retour=`.
 * Seuls les chemins internes sont acceptes : une URL absolue ferait de cette
 * page un tremplin vers n'importe quel site.
 */
function retourApresConnexion() {
  try {
    const brut = new URLSearchParams(window.location.search).get('retour') || '';
    return /^\/[^/\\]/.test(brut) || brut === '/' ? brut : '';
  } catch {
    return '';
  }
}

async function submitCredentials(event) {
  event.preventDefault();
  if (state.busy) return;

  const username = $('#club-username').value;
  const password = $('#club-password').value;

  state.busy = true;
  setError('');
  $('#club-submit').disabled = true;
  $('#club-submit').textContent = state.mode === 'register' ? 'Création…' : 'Connexion…';

  try {
    const payload = await api('/api/club/session', {
      method: 'POST',
      body: JSON.stringify({ mode: state.mode, username, password })
    });
    state.user = payload.user;
    $('#club-password').value = '';
    renderAccount();
    toast(payload.created
      ? `Bienvenue ${payload.user.username} ! ${payload.user.packs} packs vous attendent.`
      : `Content de vous revoir, ${payload.user.username} !`);

    // Venu d'ailleurs pour se connecter (un pronostic en attente, par exemple) :
    // on le ramene la ou il etait plutot que de le laisser chercher.
    const retour = retourApresConnexion();
    if (retour) {
      window.setTimeout(() => { window.location.href = retour; }, 900);
    }
  } catch (error) {
    setError(error.message);
  } finally {
    state.busy = false;
    $('#club-submit').disabled = false;
    $('#club-submit').textContent = state.mode === 'register' ? 'Créer mon compte' : 'Se connecter';
    // Le rendu précédent a eu lieu pendant l'attente : sans ce second passage,
    // le bouton « Ouvrir un pack » resterait désactivé après la connexion.
    renderAccount();
  }
}

async function openPack() {
  if (state.busy || !state.user || state.user.packs <= 0) return;
  state.busy = true;
  renderAccount();

  try {
    const payload = await api('/api/club/packs', { method: 'POST' });
    state.user = { ...state.user, packs: payload.packs, collection: payload.collection, opened: state.user.opened + 1 };
    revealCards(payload.cards);
  } catch (error) {
    toast(error.message);
  } finally {
    state.busy = false;
    renderAccount();
  }
}

async function logout() {
  try { await api('/api/club/session', { method: 'DELETE' }); } catch { /* déjà déconnecté */ }
  state.user = null;
  const zone = $('#pack-reveal');
  if (zone) { zone.hidden = true; zone.innerHTML = ''; }
  renderAccount();
  toast('À bientôt !');
}

function setMode(mode) {
  state.mode = mode === 'register' ? 'register' : 'login';
  setError('');
  $$('[data-mode]').forEach((bouton) => {
    const actif = bouton.dataset.mode === state.mode;
    bouton.classList.toggle('is-active', actif);
    bouton.setAttribute('aria-selected', String(actif));
  });
  $('#club-submit').textContent = state.mode === 'register' ? 'Créer mon compte' : 'Se connecter';
  $('#club-hint').textContent = state.mode === 'register'
    ? `Un pseudo, un mot de passe de 8 caractères minimum, et ${SIGNUP_PACKS_LABEL} packs offerts.`
    : 'Content de vous revoir. Vos packs vous attendent.';
  $('#club-password').setAttribute('autocomplete', state.mode === 'register' ? 'new-password' : 'current-password');
}

/** Doit rester aligne sur `SIGNUP_PACKS` de lib/players.js. */
const SIGNUP_PACKS_LABEL = 5;

/* ═══════════════════════════════════════════ Câblage ══ */

export function initPacks() {
  if (!$('#club-gate')) return;

  state.user = null;
  state.mode = 'login';
  state.busy = false;

  $$('[data-mode]').forEach((bouton) => {
    bouton.addEventListener('click', () => setMode(bouton.dataset.mode));
  });
  $('#club-form')?.addEventListener('submit', submitCredentials);
  $('#club-open')?.addEventListener('click', openPack);
  $('#club-logout')?.addEventListener('click', logout);
  setMode('login');

  // Une session déjà ouverte reprend la main sans rien demander.
  api('/api/club/session')
    .then((payload) => {
      state.user = payload.user;
      renderAccount();
      if (payload.user?.granted) {
        toast(`+${payload.user.granted} pack${payload.user.granted > 1 ? 's' : ''} pour aujourd'hui !`);
      }
    })
    .catch(() => {
      // Sans base de données (déploiement statique), la page reste lisible.
      setError("Les comptes ne sont pas disponibles pour le moment.");
    });
}

/** Appelé à chaque arrivée de contenu : l'effectif définit les cartes. */
export function renderPacks(content) {
  if (!$('#club-gate')) return;
  state.content = content;
  renderAccount();
}
