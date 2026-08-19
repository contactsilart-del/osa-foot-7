/**
 * OSA FOOT 7 — panel d'administration.
 *
 * Édite le document de contenu servi par `/api/content`, téléverse des images
 * dans la médiathèque (`/api/media`) et consulte les messages du formulaire de
 * contact (`/api/messages`). Tout est fait en JavaScript natif : aucun build,
 * aucune dépendance.
 */

import { DEFAULT_CONTENT, cloneContent, deepMerge } from './content.js';
import { RATINGS_OUTFIELD, RATINGS_GK, ratingsFor } from './squad.js';

/* ═════════════════════════════════════════ Utilitaires ══ */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const DATE_FMT = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : DATE_FMT.format(date);
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} Mo` : `${Math.round(n / 1024)} Ko`;
}

/** ISO → valeur d'un `<input type="datetime-local">` (heure locale du navigateur). */
function toLocalInput(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Lecture / écriture par chemin : « stats.groups.0.players.1.value ». */
function getPath(root, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), root);
}

function setPath(root, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  let node = root;
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (node[key] == null || typeof node[key] !== 'object') {
      // Le segment suivant décide de la nature du conteneur à créer.
      node[key] = /^\d+$/.test(keys[i + 1] ?? last) ? [] : {};
    }
    node = node[key];
  }
  node[last] = value;
}

let toastTimer = null;
function toast(message, variant = '') {
  const el = $('#a-toast');
  el.textContent = message;
  el.className = `a-toast${variant ? ` a-toast--${variant}` : ''} is-visible`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('is-visible');
    setTimeout(() => { el.hidden = true; }, 250);
  }, 3600);
}

/* ══════════════════════════════════════════════ État ══ */

const BUILTIN_IMAGES = [
  '/img/osa.png', '/img/cambon.png',
  '/img/match-1.jpg', '/img/match-2.jpg', '/img/match-3.jpg',
  '/img/match-4.jpg', '/img/match-6.jpg', '/img/match-7.jpg',
  '/img/calendrier1.png', '/img/calendrier2.png',
  '/img/keks.jpg', '/img/silas.jpg', '/img/claude.jpg',
  '/img/val.jpg', '/img/noan.jpg', '/img/joris.jpg', '/img/pierre.jpg'
];

const state = {
  draft: null,
  savedJson: '',
  tab: 'match',
  media: [],
  messages: [],
  storage: { content: false, media: false },
  pickerTarget: null,
  /** Index de la fiche de joueur dépliée, ou `null` si toutes sont repliées. */
  openEditor: null
};

/* ═══════════════════════════════════════════════ API ══ */

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      Accept: 'application/json',
      ...(options.headers || {})
    }
  });

  let payload = null;
  try { payload = await response.json(); } catch { /* réponse vide */ }

  if (response.status === 401) {
    showLogin("Session expirée, reconnectez-vous.");
    throw new Error('unauthenticated');
  }
  if (!response.ok) {
    throw new Error(payload?.error || `Erreur ${response.status}`);
  }
  return payload;
}

/* ════════════════════════════════════ Suivi des modifs ══ */

function isDirty() {
  return JSON.stringify(state.draft) !== state.savedJson;
}

function refreshDirtyState() {
  const dirty = isDirty();
  const status = $('#save-state');
  $('#save-btn').disabled = !dirty;
  status.textContent = dirty ? 'Modifications non enregistrées' : 'Tout est enregistré';
  status.className = `topbar__status${dirty ? ' is-dirty' : ''}`;
}

window.addEventListener('beforeunload', (event) => {
  if (state.draft && isDirty()) {
    event.preventDefault();
    event.returnValue = '';
  }
});

/* ═══════════════════════════════════ Fabriques de champs ══ */

function field(label, path, { type = 'text', value, hint = '', placeholder = '', options = [] } = {}) {
  const raw = value !== undefined ? value : getPath(state.draft, path) ?? '';

  if (type === 'textarea') {
    return `
      <label class="a-field">
        <span>${esc(label)}</span>
        <textarea data-path="${esc(path)}" data-type="text" placeholder="${esc(placeholder)}">${esc(raw)}</textarea>
        ${hint ? `<small class="a-hint">${esc(hint)}</small>` : ''}
      </label>`;
  }

  if (type === 'select') {
    return `
      <label class="a-field">
        <span>${esc(label)}</span>
        <select data-path="${esc(path)}" data-type="text">
          ${options.map((opt) => `<option value="${esc(opt.value)}"${opt.value === raw ? ' selected' : ''}>${esc(opt.label)}</option>`).join('')}
        </select>
        ${hint ? `<small class="a-hint">${esc(hint)}</small>` : ''}
      </label>`;
  }

  const inputType = type === 'number' ? 'number' : type === 'date' ? 'date' : type === 'datetime' ? 'datetime-local' : 'text';
  const inputValue = type === 'datetime' ? toLocalInput(raw) : raw;

  return `
    <label class="a-field">
      <span>${esc(label)}</span>
      <input type="${inputType}" data-path="${esc(path)}" data-type="${esc(type)}"
             value="${esc(inputValue)}" placeholder="${esc(placeholder)}"${type === 'number' ? ' min="0"' : ''}>
      ${hint ? `<small class="a-hint">${esc(hint)}</small>` : ''}
    </label>`;
}

function listField(label, path, hint) {
  const raw = getPath(state.draft, path);
  const value = Array.isArray(raw) ? raw.join(', ') : '';
  return `
    <label class="a-field">
      <span>${esc(label)}</span>
      <input type="text" data-path="${esc(path)}" data-type="list" value="${esc(value)}" placeholder="Keks 30', Val 55'">
      ${hint ? `<small class="a-hint">${esc(hint)}</small>` : ''}
    </label>`;
}

function imageField(label, path) {
  const value = getPath(state.draft, path) || '';
  return `
    <div class="a-field">
      <span class="a-field__label">${esc(label)}</span>
      <div class="a-image">
        <div class="a-image__preview" data-preview-for="${esc(path)}">
          ${value ? `<img src="${esc(value)}" alt="">` : 'vide'}
        </div>
        <div class="a-image__controls">
          <input type="text" data-path="${esc(path)}" data-type="text" data-image-input value="${esc(value)}" placeholder="/img/exemple.jpg">
          <div class="a-image__row">
            <button class="a-btn a-btn--sm" type="button" data-pick="${esc(path)}">Choisir une image…</button>
            <button class="a-btn a-btn--sm a-btn--ghost" type="button" data-clear="${esc(path)}">Vider</button>
          </div>
        </div>
      </div>
    </div>`;
}

/**
 * En-tête commun des éléments répétables (déplacer / supprimer).
 * `collapsible` transforme le titre en bouton d'ouverture : indispensable dès
 * qu'une liste devient longue, comme l'effectif.
 */
function repeatHead(listPath, index, label, { collapsible = false } = {}) {
  const titre = collapsible
    ? `<button class="repeat__toggle" type="button" data-toggle-item="${index}"
               aria-expanded="${state.openEditor === index}">
         <svg class="repeat__chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.4 5.6 9 7 7.6l5 5 5-5L18.4 9z"/></svg>
         <span class="repeat__index">${index + 1}</span>
         <span class="repeat__label">${esc(label)}</span>
       </button>`
    : `<span class="repeat__index">${index + 1}</span>
       <span class="repeat__label">${esc(label)}</span>`;

  return `
    <div class="repeat__head">
      ${titre}
      <span class="repeat__tools">
        <button class="a-btn a-btn--icon" type="button" data-move="${esc(listPath)}" data-index="${index}" data-dir="-1" aria-label="Monter">
          <svg viewBox="0 0 24 24"><path d="M12 6l7 7-1.4 1.4L12 8.8 6.4 14.4 5 13z"/></svg>
        </button>
        <button class="a-btn a-btn--icon" type="button" data-move="${esc(listPath)}" data-index="${index}" data-dir="1" aria-label="Descendre">
          <svg viewBox="0 0 24 24"><path d="M12 18l-7-7 1.4-1.4L12 15.2l5.6-5.6L19 11z"/></svg>
        </button>
        <button class="a-btn a-btn--icon a-btn--danger" type="button" data-remove="${esc(listPath)}" data-index="${index}" aria-label="Supprimer">
          <svg viewBox="0 0 24 24"><path d="M9 3h6l1 2h4v2H4V5h4l1-2zM6 9h12l-1 12H7L6 9z"/></svg>
        </button>
      </span>
    </div>`;
}

/* ══════════════════════════════════════════ Onglets ══ */

const TABS = {
  match:    { title: 'Prochain match', render: renderMatch },
  news:     { title: 'Actualités', render: renderNews },
  squad:    { title: 'Effectif', render: renderSquad },
  calendar: { title: 'Calendrier', render: () => renderImageSection('calendar') },
  standings: { title: 'Classement', render: () => renderImageSection('standings') },
  stats:    { title: 'Stats saison', render: renderStats },
  club:     { title: 'Club & réseaux', render: renderClub },
  legal:    { title: 'Mentions légales', render: renderLegal },
  media:    { title: 'Médiathèque', render: renderMedia },
  messages: { title: 'Messages reçus', render: renderMessages }
};

function renderMatch() {
  return `
    <section class="a-card">
      <header class="a-card__head">
        <div><h2>Affiche du prochain match</h2><p>Alimente le compte à rebours de la page d'accueil.</p></div>
      </header>
      <div class="a-card__body">
        ${field('Compétition', 'nextMatch.competition', { placeholder: 'Championnat UFOLEP — Foot à 7' })}
        <div class="a-grid a-grid--2">
          <div class="a-field">
            <span class="a-field__label">Équipe à domicile</span>
            ${field('Nom', 'nextMatch.home.name')}
            ${imageField('Logo', 'nextMatch.home.logo')}
          </div>
          <div class="a-field">
            <span class="a-field__label">Équipe à l'extérieur</span>
            ${field('Nom', 'nextMatch.away.name')}
            ${imageField('Logo', 'nextMatch.away.logo')}
          </div>
        </div>
        <div class="a-grid a-grid--2">
          ${field('Coup d\'envoi', 'nextMatch.kickoff', { type: 'datetime', hint: 'Heure locale. Laisser vide si la date n\'est pas connue.' })}
          ${field('Lieu', 'nextMatch.venue', { placeholder: 'Stade municipal — Saint-Affrique' })}
        </div>
      </div>
    </section>`;
}

function renderNews() {
  const items = state.draft.news || [];
  return `
    <section class="a-card">
      <header class="a-card__head">
        <div><h2>Actualités</h2><p>${items.length} article${items.length > 1 ? 's' : ''} publié${items.length > 1 ? 's' : ''}.</p></div>
        <button class="a-btn a-btn--primary a-btn--sm" type="button" data-add="news">+ Ajouter un match</button>
      </header>
      <div class="a-card__body">
        ${items.length ? `<div class="repeat">${items.map(newsItem).join('')}</div>`
          : '<p class="empty-state">Aucune actualité. Cliquez sur « Ajouter un match ».</p>'}
      </div>
    </section>`;
}

function newsItem(item, index) {
  const path = `news.${index}`;
  const score = item.score || {};
  return `
    <article class="repeat__item">
      ${repeatHead('news', index, item.title || 'Sans titre')}
      <div class="repeat__body">
        <div class="a-grid a-grid--2">
          ${field('Titre', `${path}.title`, { placeholder: 'Victoire éclatante !' })}
          ${field('Adversaire', `${path}.opponent`, { placeholder: 'Carlus' })}
        </div>
        <div class="a-grid a-grid--3">
          ${field('Compétition', `${path}.competition`, { placeholder: '5e journée' })}
          ${field('Lieu', `${path}.venue`, {
            type: 'select',
            options: [{ value: 'home', label: 'À domicile' }, { value: 'away', label: "À l'extérieur" }]
          })}
          ${field('Date', `${path}.date`, { type: 'date', hint: 'Optionnelle.' })}
        </div>
        <div class="a-grid a-grid--3">
          <label class="a-field">
            <span>Buts OSA</span>
            <input type="number" min="0" max="99" data-score="${index}" data-role="osa" value="${score.osa ?? ''}">
          </label>
          <label class="a-field">
            <span>Buts adversaire</span>
            <input type="number" min="0" max="99" data-score="${index}" data-role="opponent" value="${score.opponent ?? ''}">
          </label>
          <div class="a-field">
            <span class="a-field__label">Astuce</span>
            <small class="a-hint">Laissez les deux scores vides pour un match non joué : la pastille Victoire / Nul / Défaite disparaîtra.</small>
          </div>
        </div>
        ${listField('Buteurs OSA', `${path}.scorers`, 'Séparés par des virgules.')}
        ${field('Accroche (affichée sur la carte)', `${path}.excerpt`, { type: 'textarea', placeholder: 'Un match compliqué à Carlus…' })}
        ${field('Texte complet (fenêtre « Lire la suite »)', `${path}.body`, { type: 'textarea', hint: 'Une ligne vide crée un nouveau paragraphe.' })}
        ${imageField('Image du match', `${path}.image`)}
      </div>
    </article>`;
}

const POSITION_OPTIONS = [
  { value: 'GB', label: 'Gardien' },
  { value: 'DEF', label: 'Défenseur' },
  { value: 'MIL', label: 'Milieu' },
  { value: 'ATT', label: 'Attaquant' }
];

const STAR_OPTIONS = [0, 1, 2, 3, 4, 5].map((n) => ({
  value: String(n),
  label: n === 0 ? 'Non renseigné' : '★'.repeat(n) + '☆'.repeat(5 - n)
}));

function renderSquad() {
  const players = state.draft.squad?.players || [];

  return `
    <section class="a-card">
      <header class="a-card__head">
        <div><h2>Page Effectif</h2><p>Titre et sous-titre, repris sur la page d'accueil et sur /effectif.</p></div>
        <a class="a-btn a-btn--sm" href="/effectif" target="_blank" rel="noopener">Voir la page ↗</a>
      </header>
      <div class="a-card__body">
        ${field('Titre', 'squad.title')}
        ${field('Sous-titre', 'squad.subtitle', { type: 'textarea' })}
      </div>
    </section>

    <section class="a-card">
      <header class="a-card__head">
        <div><h2>Joueurs</h2><p>${players.length} fiche${players.length > 1 ? 's' : ''} dans l'effectif.</p></div>
        <button class="a-btn a-btn--primary a-btn--sm" type="button" data-add="player-card">+ Ajouter un joueur</button>
      </header>
      <div class="a-card__body">
        ${players.length
          ? `<div class="repeat">${players.map(playerEditor).join('')}</div>`
          : '<p class="empty-state">Aucun joueur. Cliquez sur « Ajouter un joueur » pour créer la première fiche.</p>'}
      </div>
    </section>`;
}

function playerEditor(player, index) {
  const path = `squad.players.${index}`;
  const name = [player.firstName, player.lastName].filter(Boolean).join(' ') || 'Nouveau joueur';
  const position = POSITION_OPTIONS.find((o) => o.value === player.position)?.label || '';
  const ouverte = state.openEditor === index;

  return `
    <article class="repeat__item${ouverte ? '' : ' is-collapsed'}">
      ${repeatHead('squad.players', index, `${name}${position ? ' · ' + position : ''}`, { collapsible: true })}
      <div class="repeat__body">
        <div class="a-grid a-grid--2">
          ${field('Prénom', `${path}.firstName`, { placeholder: 'Silas' })}
          ${field('Nom', `${path}.lastName`, { placeholder: 'Clamens Albert', hint: 'Facultatif.' })}
        </div>

        ${imageField('Photo', `${path}.photo`)}

        <div class="a-grid a-grid--3">
          ${field('Âge', `${path}.age`, { type: 'number', hint: '0 = non renseigné, la ligne se masque.' })}
          ${field('Nationalité', `${path}.nationality`, { placeholder: 'France' })}
          ${field('Poste', `${path}.position`, { type: 'select', options: POSITION_OPTIONS })}
        </div>

        <div class="a-grid a-grid--3">
          ${field('Au club depuis', `${path}.since`, { type: 'number', placeholder: '2021', hint: "Année d'arrivée : l'ancienneté en est déduite." })}
          ${field('Mauvais pied', `${path}.weakFoot`, { type: 'select', options: STAR_OPTIONS })}
          ${field('Gestes techniques', `${path}.skillMoves`, { type: 'select', options: STAR_OPTIONS })}
        </div>

        <div class="a-field">
          <span class="a-field__label">Notes sur 99${player.position === 'GB' ? ' — gardien' : ''}</span>
          <div class="a-grid a-grid--3">
            ${ratingsFor(player).map(([key, label]) =>
              field(label, `${path}.ratings.${key}`, { type: 'number' })).join('')}
          </div>
          <small class="a-hint">
            Palier de couleur sur la fiche : rouge en dessous de 65, jaune de 65 à 74,
            vert de 75 à 84, vert foncé à partir de 85.
            ${player.position === 'GB'
              ? " Les notes de joueur de champ sont conservées : elles reviendront si vous changez le poste."
              : " Passez le joueur au poste de gardien pour saisir réflexes, plongeon et jeu au pied."}
          </small>
        </div>

        <div class="a-grid a-grid--2">
          ${field('Valeur marchande', `${path}.marketValue`, { placeholder: '240 000 €', hint: 'Texte libre : vide = ligne masquée.' })}
          <div class="a-field">
            <span class="a-field__label">Note générale</span>
            <p class="a-hint">
              Calculée automatiquement : moyenne des six notes ci-dessus. Elle s'affiche en gros sur la carte.
            </p>
          </div>
        </div>

        ${field('Descriptif', `${path}.description`, { type: 'textarea', hint: 'Une ligne vide crée un nouveau paragraphe.' })}
      </div>
    </article>`;
}

/** Les deux sections faites d'images téléversées partagent le même éditeur. */
const IMAGE_SECTIONS = {
  calendar: {
    label: 'calendrier',
    heading: 'Section calendrier',
    listTitle: 'Images du calendrier',
    addLabel: '+ Ajouter une image',
    captionExample: 'Phase aller',
    empty: "Aucune image. Le site affiche « Bientôt disponible » à la place — c'est volontaire tant que le calendrier n'est pas paru."
  },
  standings: {
    label: 'classement',
    heading: 'Section classement',
    listTitle: 'Images du classement',
    addLabel: '+ Ajouter une capture',
    captionExample: 'Poule B — 6e journée',
    empty: "Aucune image. Le site affiche « Bientôt disponible » à la place. Téléversez une capture du classement depuis l'onglet Médiathèque, puis ajoutez-la ici."
  }
};

function renderImageSection(key) {
  const meta = IMAGE_SECTIONS[key];
  const images = state.draft[key]?.images || [];

  return `
    <section class="a-card">
      <header class="a-card__head">
        <div><h2>${esc(meta.heading)}</h2><p>Titre et sous-titre affichés au-dessus des images.</p></div>
      </header>
      <div class="a-card__body">
        ${field('Titre de la section', `${key}.title`)}
        ${field('Sous-titre', `${key}.subtitle`, { type: 'textarea' })}
      </div>
    </section>

    <section class="a-card">
      <header class="a-card__head">
        <div><h2>${esc(meta.listTitle)}</h2><p>${images.length} image${images.length > 1 ? 's' : ''}.</p></div>
        <button class="a-btn a-btn--primary a-btn--sm" type="button" data-add="images" data-target="${esc(key)}.images">${esc(meta.addLabel)}</button>
      </header>
      <div class="a-card__body">
        ${images.length ? `<div class="repeat">${images.map((image, index) => `
          <article class="repeat__item">
            ${repeatHead(`${key}.images`, index, image.caption || image.src || 'Image')}
            <div class="repeat__body">
              ${imageField('Fichier', `${key}.images.${index}.src`)}
              <div class="a-grid a-grid--2">
                ${field('Légende', `${key}.images.${index}.caption`, { placeholder: meta.captionExample })}
                ${field('Texte alternatif', `${key}.images.${index}.alt`, { hint: "Décrit l'image pour les lecteurs d'écran." })}
              </div>
            </div>
          </article>`).join('')}</div>`
          : `<p class="empty-state">${esc(meta.empty)}</p>`}
      </div>
    </section>`;
}

function renderStats() {
  const groups = state.draft.stats?.groups || [];
  return `
    <section class="a-card">
      <header class="a-card__head">
        <div><h2>Saison</h2></div>
      </header>
      <div class="a-card__body">
        ${field('Libellé de la saison', 'stats.season', { placeholder: '2025 / 2026' })}
      </div>
    </section>

    <section class="a-card">
      <header class="a-card__head">
        <div><h2>Classements</h2><p>${groups.length} colonne${groups.length > 1 ? 's' : ''} affichée${groups.length > 1 ? 's' : ''}.</p></div>
        <button class="a-btn a-btn--primary a-btn--sm" type="button" data-add="stat-group">+ Ajouter un classement</button>
      </header>
      <div class="a-card__body">
        ${groups.length ? `<div class="repeat">${groups.map(statGroup).join('')}</div>`
          : '<p class="empty-state">Aucun classement.</p>'}
      </div>
    </section>`;
}

function statGroup(group, index) {
  const path = `stats.groups.${index}`;
  const players = group.players || [];
  return `
    <article class="repeat__item">
      ${repeatHead('stats.groups', index, group.title || 'Classement')}
      <div class="repeat__body">
        <div class="a-grid a-grid--3">
          ${field('Titre', `${path}.title`, { placeholder: 'Meilleurs buteurs' })}
          ${field('Unité', `${path}.unit`, { placeholder: 'buts' })}
          ${field('Couleur', `${path}.accent`, {
            type: 'select',
            options: [{ value: 'gold', label: 'Or' }, { value: 'blue', label: 'Bleu' }, { value: 'red', label: 'Rouge' }]
          })}
        </div>
        ${field('Icône', `${path}.icon`, {
          type: 'select',
          options: [{ value: 'ball', label: 'Ballon' }, { value: 'boot', label: 'Crampon' }, { value: 'oops', label: 'Alerte (CSC)' }]
        })}

        <div class="a-field">
          <span class="a-field__label">Joueurs (${players.length})</span>
          <div class="repeat">
            ${players.map((player, pIndex) => `
              <div class="repeat__item">
                ${repeatHead(`${path}.players`, pIndex, player.name || 'Joueur')}
                <div class="repeat__body">
                  <div class="a-grid a-grid--2">
                    ${field('Nom', `${path}.players.${pIndex}.name`)}
                    ${field('Valeur', `${path}.players.${pIndex}.value`, { type: 'number' })}
                  </div>
                  ${imageField('Photo', `${path}.players.${pIndex}.photo`)}
                </div>
              </div>`).join('')}
          </div>
          <button class="a-btn a-btn--sm" type="button" data-add="player" data-target="${esc(path)}.players">+ Ajouter un joueur</button>
        </div>
      </div>
    </article>`;
}

function renderClub() {
  return `
    <section class="a-card">
      <header class="a-card__head">
        <div><h2>Identité du club</h2></div>
      </header>
      <div class="a-card__body">
        <div class="a-grid a-grid--2">
          ${field('Nom', 'club.name')}
          ${field('Sous-titre', 'club.tagline')}
        </div>
        ${imageField('Logo', 'club.logo')}
      </div>
    </section>

    <section class="a-card">
      <header class="a-card__head">
        <div><h2>Contact &amp; réseaux</h2><p>Utilisés dans la section Contact et le pied de page.</p></div>
      </header>
      <div class="a-card__body">
        <div class="a-grid a-grid--2">
          ${field('E-mail public', 'club.email', { placeholder: 'contact@osafoot7.fr' })}
          ${field('Terrain / adresse', 'club.address', { placeholder: 'Saint-Affrique (12400)' })}
        </div>
        <div class="a-grid a-grid--2">
          ${field('Page Facebook', 'club.facebook', { placeholder: 'https://www.facebook.com/…', hint: 'URL complète. Vide = lien masqué.' })}
          ${field('Compte Instagram', 'club.instagram', { placeholder: 'https://www.instagram.com/…', hint: 'URL complète. Vide = lien masqué.' })}
        </div>
        ${field('Année du copyright', 'club.copyrightYear', { placeholder: '2026', hint: 'Affichée en bas de chaque page.' })}
      </div>
    </section>`;
}

function renderLegal() {
  return `
    <section class="a-card">
      <header class="a-card__head">
        <div>
          <h2>Éditeur du site</h2>
          <p>Ces informations sont obligatoires pour un site associatif (loi pour la confiance dans l'économie numérique, art. 6-III).</p>
        </div>
      </header>
      <div class="a-card__body">
        <p class="a-hint">
          Chaque champ laissé vide disparaît simplement de la page publique&nbsp;: le site
          n'affiche jamais de mention « à compléter ».
        </p>

        <div class="a-grid a-grid--2">
          ${field('Dénomination', 'legal.entity', { placeholder: 'OSA FOOT 7 — Olympique Saint-Affrique' })}
          ${field('Statut juridique', 'legal.status', { placeholder: 'Association loi 1901' })}
        </div>

        ${field('Siège social', 'legal.address', {
          placeholder: '12 rue du Stade, 12400 Saint-Affrique, France',
          hint: 'Adresse postale complète.'
        })}

        <div class="a-grid a-grid--2">
          ${field('N° RNA', 'legal.rna', { placeholder: 'W121234567', hint: 'Sur le récépissé de déclaration en préfecture.' })}
          ${field('N° SIREN', 'legal.siren', { placeholder: '123 456 789', hint: 'Si l\'association en possède un.' })}
        </div>

        <div class="a-grid a-grid--2">
          ${field('Directeur de la publication', 'legal.director', { placeholder: 'Prénom NOM (président·e)' })}
          ${field('Date de mise à jour', 'legal.updated', { placeholder: 'Janvier 2026' })}
        </div>

        ${field('E-mail de contact légal', 'legal.email', {
          placeholder: 'contact@osafoot7.fr',
          hint: 'Laissez vide pour réutiliser l\'e-mail public défini dans « Club & réseaux ».'
        })}
      </div>
    </section>

    <section class="a-card">
      <header class="a-card__head">
        <div><h2>Le reste de la page</h2></div>
      </header>
      <div class="a-card__body">
        <p class="a-hint">
          Hébergement, propriété intellectuelle, RGPD, cookies, droit à l'image, responsabilité
          et droit applicable sont déjà rédigés et adaptés à ce site (aucun traceur, aucune
          ressource externe, hébergement Cloudflare). Ils n'ont pas à être modifiés.
        </p>
        <a class="a-btn" href="/mentions-legales" target="_blank" rel="noopener">Voir la page publique ↗</a>
      </div>
    </section>`;
}

function renderMedia() {
  return `
    <section class="a-card">
      <header class="a-card__head">
        <div><h2>Téléverser des images</h2><p>JPG, PNG, WebP, GIF ou AVIF — 5 Mo maximum.</p></div>
      </header>
      <div class="a-card__body">
        <label class="dropzone" id="dropzone">
          <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor" aria-hidden="true"><path d="M11 15V7.8l-2.6 2.6L7 9l5-5 5 5-1.4 1.4L13 7.8V15h-2zM5 18h14v2H5v-2z"/></svg>
          <strong>Glissez vos images ici</strong>
          <span>ou cliquez pour parcourir vos fichiers</span>
          <input type="file" id="file-input" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" multiple>
        </label>
      </div>
    </section>

    <section class="a-card">
      <header class="a-card__head">
        <div><h2>Médiathèque</h2><p>${state.media.length} fichier${state.media.length > 1 ? 's' : ''} téléversé${state.media.length > 1 ? 's' : ''}.</p></div>
        <button class="a-btn a-btn--sm" type="button" id="media-refresh">Actualiser</button>
      </header>
      <div class="a-card__body">
        ${state.media.length ? `
          <div class="media-grid">
            ${state.media.map((item) => `
              <figure class="media-tile">
                <img src="${esc(item.path)}" alt="" loading="lazy">
                <figcaption class="media-tile__foot">
                  <span class="media-tile__name" title="${esc(item.name || item.key)}">${esc(item.name || item.key)}</span>
                  <button class="media-tile__act" type="button" data-copy="${esc(item.path)}" title="Copier le chemin">⧉</button>
                  <button class="media-tile__act media-tile__act--danger" type="button" data-media-delete="${esc(item.key)}" title="Supprimer">✕</button>
                </figcaption>
              </figure>`).join('')}
          </div>`
          : '<p class="empty-state">Aucune image téléversée pour le moment.</p>'}
      </div>
    </section>

    <section class="a-card">
      <header class="a-card__head">
        <div><h2>Images livrées avec le site</h2><p>Toujours disponibles, non supprimables.</p></div>
      </header>
      <div class="a-card__body">
        <div class="media-grid">
          ${BUILTIN_IMAGES.map((src) => `
            <figure class="media-tile">
              <img src="${esc(src)}" alt="" loading="lazy">
              <figcaption class="media-tile__foot">
                <span class="media-tile__name" title="${esc(src)}">${esc(src.replace('/img/', ''))}</span>
                <button class="media-tile__act" type="button" data-copy="${esc(src)}" title="Copier le chemin">⧉</button>
              </figcaption>
            </figure>`).join('')}
        </div>
      </div>
    </section>`;
}

function renderMessages() {
  if (!state.messages.length) {
    return `
      <section class="a-card">
        <header class="a-card__head"><div><h2>Messages reçus</h2></div>
          <button class="a-btn a-btn--sm" type="button" id="messages-refresh">Actualiser</button>
        </header>
        <div class="a-card__body"><p class="empty-state">Aucun message pour le moment.</p></div>
      </section>`;
  }

  return `
    <section class="a-card">
      <header class="a-card__head">
        <div><h2>Messages reçus</h2><p>${state.messages.length} message${state.messages.length > 1 ? 's' : ''}.</p></div>
        <button class="a-btn a-btn--sm" type="button" id="messages-refresh">Actualiser</button>
      </header>
      <div class="a-card__body">
        ${state.messages.map((msg) => `
          <article class="msg${msg.is_read ? '' : ' msg--unread'}">
            <div class="msg__head">
              <span class="msg__from">${esc(msg.name)}</span>
              <a class="msg__mail" href="mailto:${esc(msg.email)}">${esc(msg.email)}</a>
              <span class="msg__date">${esc(formatDate(msg.created_at))}</span>
            </div>
            ${msg.subject ? `<span class="msg__subject">${esc(msg.subject)}</span>` : ''}
            <p class="msg__text">${esc(msg.message)}</p>
            <div class="msg__tools">
              <a class="a-btn a-btn--sm" href="mailto:${esc(msg.email)}?subject=${encodeURIComponent('Re : ' + (msg.subject || 'Votre message'))}">Répondre</a>
              <button class="a-btn a-btn--sm a-btn--ghost" type="button" data-msg-read="${msg.id}" data-value="${msg.is_read ? 0 : 1}">
                ${msg.is_read ? 'Marquer non lu' : 'Marquer lu'}
              </button>
              <button class="a-btn a-btn--sm a-btn--danger" type="button" data-msg-delete="${msg.id}">Supprimer</button>
            </div>
          </article>`).join('')}
      </div>
    </section>`;
}

/* ═══════════════════════════════════════════ Rendu ══ */

function renderTab(tab = state.tab) {
  const changedTab = tab !== state.tab;
  state.tab = tab;
  $('#page-title').textContent = TABS[tab].title;
  $('#panel').innerHTML = TABS[tab].render();
  $$('#tabs .side__tab').forEach((btn) => btn.classList.toggle('is-active', btn.dataset.tab === tab));
  // On ne remonte en haut que lors d'un changement d'onglet : un ajout ou une
  // suppression doit laisser l'utilisateur là où il travaillait.
  if (changedTab) window.scrollTo({ top: 0, behavior: 'auto' });
  refreshCounts();
  refreshDirtyState();
}

function refreshCounts() {
  const unread = state.messages.filter((m) => !m.is_read).length;
  const counts = {
    news: (state.draft?.news || []).length,
    squad: (state.draft?.squad?.players || []).length,
    calendar: (state.draft?.calendar?.images || []).length,
    standings: (state.draft?.standings?.images || []).length,
    media: state.media.length,
    messages: state.messages.length
  };
  Object.entries(counts).forEach(([key, value]) => {
    const el = $(`[data-count="${key}"]`);
    if (el) el.textContent = value;
  });

  const badge = $('[data-count="messages"]');
  if (badge) badge.dataset.unread = String(unread > 0);

}

/* ═════════════════════════════════ Saisie & mutations ══ */

function onFieldChange(event) {
  const input = event.target;

  /* Score : les deux champs d'un même match sont solidaires. */
  if (input.dataset.score !== undefined) {
    const index = Number(input.dataset.score);
    const item = input.closest('.repeat__item');
    const osa = $('[data-role="osa"]', item).value.trim();
    const opponent = $('[data-role="opponent"]', item).value.trim();
    state.draft.news[index].score =
      osa !== '' && opponent !== '' ? { osa: Number(osa), opponent: Number(opponent) } : null;
    refreshDirtyState();
    return;
  }

  const path = input.dataset.path;
  if (!path) return;

  const type = input.dataset.type || 'text';
  let value = input.value;

  if (type === 'number') value = Number(value) || 0;
  else if (type === 'list') value = value.split(',').map((s) => s.trim()).filter(Boolean);
  else if (type === 'datetime') value = value ? new Date(value).toISOString() : '';

  setPath(state.draft, path, value);

  if (input.hasAttribute('data-image-input')) updatePreview(path, value);

  // Le titre affiché dans l'en-tête du bloc suit la saisie.
  if (/\.(title|name|caption)$/.test(path)) {
    const label = input.closest('.repeat__item')?.querySelector('.repeat__label');
    if (label) label.textContent = value || '—';
  }

  // Changer de poste change les six notes proposées : il faut redessiner.
  if (/^squad\.players\.\d+\.position$/.test(path)) {
    refreshDirtyState();
    return renderTab();
  }

  // Une fiche de joueur est titrée par « prénom nom » : les deux champs comptent.
  const player = /^squad\.players\.(\d+)\.(firstName|lastName)$/.exec(path);
  if (player) {
    const fiche = state.draft.squad.players[Number(player[1])];
    const label = input.closest('.repeat__item')?.querySelector('.repeat__label');
    if (label) {
      label.textContent = [fiche.firstName, fiche.lastName].filter(Boolean).join(' ') || 'Nouveau joueur';
    }
  }

  refreshDirtyState();
}

function updatePreview(path, value) {
  const preview = $(`[data-preview-for="${CSS.escape(path)}"]`);
  if (preview) preview.innerHTML = value ? `<img src="${esc(value)}" alt="">` : 'vide';
}

const BLANK = {
  news: () => ({
    id: '', title: 'Nouveau match', excerpt: '', body: '', image: '',
    competition: '', opponent: '', venue: 'home', score: null, scorers: [], date: ''
  }),
  image: () => ({ src: '', alt: '', caption: '' }),
  playerCard: () => ({
    id: '', firstName: '', lastName: 'Nouveau joueur', photo: '',
    age: 0, nationality: 'France', position: 'MIL', since: new Date().getFullYear(),
    weakFoot: 3, skillMoves: 3,
    ratings: Object.fromEntries([...RATINGS_OUTFIELD, ...RATINGS_GK].map(([key]) => [key, 50])),
    description: '', marketValue: ''
  }),
  statGroup: () => ({ id: '', title: 'Nouveau classement', unit: 'buts', accent: 'blue', icon: 'ball', players: [] }),
  player: () => ({ name: 'Nouveau joueur', photo: '', value: 0 })
};

function onPanelClick(event) {
  const target = event.target.closest('button');
  if (!target) return;

  /* — Dépliage d'une fiche — */
  if (target.dataset.toggleItem !== undefined) {
    const index = Number(target.dataset.toggleItem);
    // Accordéon : une seule fiche ouverte, sinon la liste redevient interminable.
    state.openEditor = state.openEditor === index ? null : index;
    return renderTab();
  }

  /* — Ajouts — */
  if (target.dataset.add === 'news') {
    state.draft.news.unshift(BLANK.news());
    return renderTab();
  }
  if (target.dataset.add === 'images') {
    const list = getPath(state.draft, target.dataset.target);
    if (Array.isArray(list)) list.push(BLANK.image());
    return renderTab();
  }
  if (target.dataset.add === 'player-card') {
    (state.draft.squad.players ||= []).push(BLANK.playerCard());
    // Sans cela, on ajoute un joueur et rien ne s'affiche.
    state.openEditor = state.draft.squad.players.length - 1;
    return renderTab();
  }
  if (target.dataset.add === 'stat-group') {
    (state.draft.stats.groups ||= []).push(BLANK.statGroup());
    return renderTab();
  }
  if (target.dataset.add === 'player') {
    const list = getPath(state.draft, target.dataset.target);
    if (Array.isArray(list)) list.push(BLANK.player());
    return renderTab();
  }

  /* — Suppression / déplacement — */
  if (target.dataset.remove) {
    const list = getPath(state.draft, target.dataset.remove);
    const index = Number(target.dataset.index);
    if (Array.isArray(list) && confirm('Supprimer définitivement cet élément ?')) {
      list.splice(index, 1);
      state.openEditor = null;
      renderTab();
    }
    return;
  }
  if (target.dataset.move) {
    const list = getPath(state.draft, target.dataset.move);
    const index = Number(target.dataset.index);
    const next = index + Number(target.dataset.dir);
    if (Array.isArray(list) && next >= 0 && next < list.length) {
      [list[index], list[next]] = [list[next], list[index]];
      state.openEditor = null;
      renderTab();
    }
    return;
  }

  /* — Images — */
  if (target.dataset.pick) return openPicker(target.dataset.pick);
  if (target.dataset.clear) {
    const path = target.dataset.clear;
    setPath(state.draft, path, '');
    const input = $(`input[data-path="${CSS.escape(path)}"]`);
    if (input) input.value = '';
    updatePreview(path, '');
    refreshDirtyState();
    return;
  }

  /* — Médiathèque — */
  if (target.dataset.copy) {
    navigator.clipboard?.writeText(target.dataset.copy)
      .then(() => toast('Chemin copié : ' + target.dataset.copy, 'success'))
      .catch(() => toast('Copie impossible. Chemin : ' + target.dataset.copy));
    return;
  }
  if (target.dataset.mediaDelete) return removeMedia(target.dataset.mediaDelete);
  if (target.id === 'media-refresh') return loadMedia().then(() => renderTab('media'));

  /* — Messages — */
  if (target.dataset.msgRead) return setMessageRead(Number(target.dataset.msgRead), target.dataset.value === '1');
  if (target.dataset.msgDelete) return removeMessage(Number(target.dataset.msgDelete));
  if (target.id === 'messages-refresh') return loadMessages().then(() => renderTab('messages'));
}

/* ═══════════════════════════════════ Sélecteur d'image ══ */

function openPicker(path) {
  state.pickerTarget = path;
  const section = (title, items) => `
    <div class="picker__section">
      <h3>${esc(title)}</h3>
      <div class="picker__grid">
        ${items.map((item) => `
          <button class="picker__item" type="button" data-picker-value="${esc(item.src)}">
            <img src="${esc(item.src)}" alt="" loading="lazy">
            <span>${esc(item.label)}</span>
          </button>`).join('')}
      </div>
    </div>`;

  $('#picker-body').innerHTML = `
    ${state.media.length
      ? section('Vos images téléversées', state.media.map((m) => ({ src: m.path, label: m.name || m.key })))
      : '<p class="a-hint">Aucune image téléversée. Utilisez l\'onglet Médiathèque pour en ajouter.</p>'}
    ${section('Images livrées avec le site', BUILTIN_IMAGES.map((src) => ({ src, label: src.replace('/img/', '') })))}
  `;
  $('#picker').hidden = false;
}

function closePicker() {
  $('#picker').hidden = true;
  state.pickerTarget = null;
}

function onPickerClick(event) {
  if (event.target.closest('[data-picker-close]')) return closePicker();

  const choice = event.target.closest('[data-picker-value]');
  if (!choice || !state.pickerTarget) return;

  const path = state.pickerTarget;
  const value = choice.dataset.pickerValue;
  setPath(state.draft, path, value);

  const input = $(`input[data-path="${CSS.escape(path)}"]`);
  if (input) input.value = value;
  updatePreview(path, value);

  closePicker();
  refreshDirtyState();
  toast('Image sélectionnée.', 'success');
}

/* ═══════════════════════════════════════ Médiathèque ══ */

async function loadMedia() {
  if (!state.storage.media) { state.media = []; return; }
  try {
    const payload = await api('/api/media');
    state.media = payload.media || [];
  } catch (error) {
    if (error.message !== 'unauthenticated') console.warn('[media]', error);
    state.media = [];
  }
  refreshCounts();
}

async function uploadFiles(files) {
  const list = Array.from(files || []).filter((file) => file.type.startsWith('image/'));
  if (!list.length) return;

  toast(`Téléversement de ${list.length} fichier${list.length > 1 ? 's' : ''}…`);
  let uploaded = 0;

  for (const file of list) {
    const form = new FormData();
    form.append('file', file);
    try {
      await api('/api/media', { method: 'POST', body: form });
      uploaded += 1;
    } catch (error) {
      toast(`${file.name} : ${error.message}`, 'error');
    }
  }

  if (uploaded) {
    await loadMedia();
    renderTab('media');
    toast(`${uploaded} image${uploaded > 1 ? 's' : ''} ajoutée${uploaded > 1 ? 's' : ''}.`, 'success');
  }
}

async function removeMedia(key) {
  if (!confirm('Supprimer cette image ? Les pages qui l\'utilisent afficheront un lien cassé.')) return;
  try {
    await api(`/api/media/${encodeURIComponent(key)}`, { method: 'DELETE' });
    await loadMedia();
    renderTab('media');
    toast('Image supprimée.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
}

/* ══════════════════════════════════════════ Messages ══ */

async function loadMessages() {
  if (!state.storage.content) { state.messages = []; return; }
  try {
    const payload = await api('/api/messages');
    state.messages = payload.messages || [];
  } catch (error) {
    if (error.message !== 'unauthenticated') console.warn('[messages]', error);
    state.messages = [];
  }
  refreshCounts();
}

async function setMessageRead(id, isRead) {
  try {
    await api(`/api/messages/${id}`, { method: 'PATCH', body: JSON.stringify({ isRead }) });
    const message = state.messages.find((m) => m.id === id);
    if (message) message.is_read = isRead ? 1 : 0;
    renderTab('messages');
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function removeMessage(id) {
  if (!confirm('Supprimer ce message ?')) return;
  try {
    await api(`/api/messages/${id}`, { method: 'DELETE' });
    state.messages = state.messages.filter((m) => m.id !== id);
    renderTab('messages');
    toast('Message supprimé.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
}

/* ═══════════════════════════════════ Enregistrement ══ */

async function save() {
  const button = $('#save-btn');
  const status = $('#save-state');
  button.disabled = true;
  status.textContent = 'Enregistrement…';
  status.className = 'topbar__status is-saving';

  try {
    const payload = await api('/api/content', {
      method: 'PUT',
      body: JSON.stringify({ content: state.draft })
    });
    // On adopte la version normalisée par le serveur : l'écran reflète le stocké.
    state.draft = payload.content;
    state.savedJson = JSON.stringify(state.draft);
    renderTab();
    toast('Modifications publiées sur le site 🎉', 'success');
  } catch (error) {
    toast(error.message, 'error');
    refreshDirtyState();
  }
}

async function resetToDefaults() {
  if (!confirm('Réinitialiser tout le contenu aux valeurs d\'origine ? Vos modifications enregistrées seront perdues.')) return;
  try {
    await api('/api/content', { method: 'DELETE' });
    state.draft = cloneContent(DEFAULT_CONTENT);
    state.savedJson = JSON.stringify(state.draft);
    renderTab();
    toast('Contenu réinitialisé.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
}

/* ══════════════════════════════════════════ Amorçage ══ */

function showOnly(id) {
  ['boot', 'gate', 'setup', 'app'].forEach((key) => {
    const el = $(`#${key}`);
    if (el) el.hidden = key !== id;
  });
}

function showLogin(message = '') {
  showOnly('gate');
  $('#login-error').textContent = message;
  $('#login-password').value = '';
  $('#login-password').focus();
}

function showStorageBanner() {
  const banner = $('#storage-banner');
  const missing = [];
  if (!state.storage.content) missing.push('<code>DB</code> (base D1 — contenu &amp; messages)');
  if (!state.storage.media) missing.push('<code>MEDIA</code> (espace KV — images téléversées)');

  if (!missing.length) { banner.hidden = true; return; }
  banner.hidden = false;
  banner.innerHTML = `<strong>Liaison manquante :</strong> ${missing.join(' et ')}.
    Ces fonctionnalités resteront désactivées tant que le binding n'est pas créé (voir le README).`;
}

async function loadContent() {
  try {
    const payload = await api('/api/content');
    // Le contenu stocké est fusionné SUR les valeurs par défaut. Sans cela, un
    // champ ajouté au modèle après le dernier enregistrement arriverait vide
    // dans le formulaire — et le prochain « Enregistrer » le figerait vide.
    state.draft = payload.content
      ? deepMerge(cloneContent(DEFAULT_CONTENT), payload.content)
      : cloneContent(DEFAULT_CONTENT);
  } catch {
    state.draft = cloneContent(DEFAULT_CONTENT);
  }
  state.savedJson = JSON.stringify(state.draft);
}

async function enterApp() {
  showOnly('app');
  await loadContent();
  showStorageBanner();
  await Promise.all([loadMedia(), loadMessages()]);
  renderTab('match');
}

async function boot() {
  /* Écouteurs branchés une fois pour toutes. */
  $('#login-form').addEventListener('submit', onLogin);
  $('#logout').addEventListener('click', onLogout);
  $('#save-btn').addEventListener('click', save);
  $('#reset-btn').addEventListener('click', resetToDefaults);
  $('#picker').addEventListener('click', onPickerClick);

  $('#tabs').addEventListener('click', (event) => {
    const tab = event.target.closest('[data-tab]');
    if (tab) {
      renderTab(tab.dataset.tab);
      document.body.classList.remove('side-open');
    }
  });

  $('#side-toggle').addEventListener('click', () => document.body.classList.toggle('side-open'));

  const panel = $('#panel');
  panel.addEventListener('input', onFieldChange);
  panel.addEventListener('change', onFieldChange);
  panel.addEventListener('click', onPanelClick);

  // Téléversement : clic, sélection et glisser-déposer.
  panel.addEventListener('change', (event) => {
    if (event.target.id === 'file-input') uploadFiles(event.target.files);
  });
  ['dragover', 'dragleave', 'drop'].forEach((type) => {
    panel.addEventListener(type, (event) => {
      const zone = event.target.closest('#dropzone');
      if (!zone) return;
      event.preventDefault();
      zone.classList.toggle('is-over', type === 'dragover');
      if (type === 'drop') uploadFiles(event.dataTransfer?.files);
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closePicker();
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (state.draft && isDirty()) save();
    }
  });

  /* État de session. */
  try {
    const session = await api('/api/session');
    state.storage = session.storage || { content: false, media: false };

    if (!session.configured) return showOnly('setup');
    if (!session.authenticated) return showLogin();
    await enterApp();
  } catch (error) {
    if (error.message === 'unauthenticated') return;
    showOnly('setup');
    console.error('[boot]', error);
  }
}

async function onLogin(event) {
  event.preventDefault();
  const button = $('#login-submit');
  const error = $('#login-error');
  error.textContent = '';
  button.disabled = true;
  button.textContent = 'Connexion…';

  try {
    await api('/api/session', {
      method: 'POST',
      body: JSON.stringify({ password: $('#login-password').value })
    });
    await enterApp();
  } catch (err) {
    error.textContent = err.message === 'unauthenticated' ? 'Mot de passe incorrect.' : err.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Se connecter';
  }
}

async function onLogout() {
  if (isDirty() && !confirm('Des modifications ne sont pas enregistrées. Se déconnecter quand même ?')) return;
  try { await api('/api/session', { method: 'DELETE' }); } catch { /* on se déconnecte quand même */ }
  state.draft = null;
  state.savedJson = '';
  showLogin('Vous êtes déconnecté.');
}

boot();
