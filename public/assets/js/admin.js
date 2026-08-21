/**
 * OSA FOOT 7 — panel d'administration.
 *
 * Édite le document de contenu servi par `/api/content`, téléverse des images
 * dans la médiathèque (`/api/media`) et consulte les messages du formulaire de
 * contact (`/api/messages`). Tout est fait en JavaScript natif : aucun build,
 * aucune dépendance.
 */

import { DEFAULT_CONTENT, cloneContent, deepMerge, migrateContent } from './content.js';
import { RATINGS_OUTFIELD, RATINGS_GK, ratingsFor, averageOf, isStaff, fullName } from './squad.js';
import { betStatus, optionsOf, YES_NO } from './bets.js';

/** Doit rester aligné sur `SIGNUP_PACKS` de lib/players.js. */
const SIGNUP_PACKS = 5;

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
  tab: 'championship',
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

  if (type === 'checkbox') {
    return `
      <div class="a-field">
        <label class="a-check">
          <input type="checkbox" data-path="${esc(path)}" data-type="bool"${raw ? ' checked' : ''}>
          <span>${esc(label)}</span>
        </label>
        ${hint ? `<small class="a-hint">${esc(hint)}</small>` : ''}
      </div>`;
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
  championship: { title: 'Championnat', render: renderChampionship },
  bets:     { title: 'Paris', render: renderBets },
  squad:    { title: 'Effectif', render: renderSquad },
  stats:    { title: 'Stats saison', render: renderStats },
  palmares: { title: 'Palmarès', render: renderPalmares },
  anthem:   { title: 'Chant du club', render: renderAnthem },
  gallery:  { title: 'Galerie', render: () => renderImageSection('gallery') },
  calendar: { title: 'Calendrier', render: () => renderImageSection('calendar') },
  match:    { title: 'Affiche de secours', render: renderMatch },
  club:     { title: 'Club & réseaux', render: renderClub },
  legal:    { title: 'Mentions légales', render: renderLegal },
  media:    { title: 'Médiathèque', render: renderMedia },
  messages: { title: 'Messages reçus', render: renderMessages }
};

/* ─────────────────────────────────────── Championnat ── */

function teamOptions(teams) {
  return [
    { value: '', label: '— à choisir —' },
    ...teams.map((team) => ({ value: team.id, label: team.name || team.id }))
  ];
}

function competitions() {
  return state.draft.championship?.competitions || [];
}

function competitionOptions() {
  return competitions().map((competition) => ({ value: competition.id, label: competition.name }));
}

/**
 * Les clubs proposés pour un match : ceux de sa compétition, et rien d'autre.
 * C'est tout l'intérêt d'avoir des compétitions — ne plus chercher un club de
 * coupe au milieu de la poule du championnat.
 */
function teamsForCompetition(competitionId) {
  const competition = competitions().find((c) => c.id === competitionId);
  const catalogue = state.draft.championship?.teams || [];
  if (!competition) return catalogue;
  const inscrits = new Set(competition.teamIds || []);
  return catalogue.filter((team) => inscrits.has(team.id));
}

function teamLabel(teams, id) {
  return teams.find((team) => team.id === id)?.name || '—';
}

/** Résumé affiché dans l'en-tête replié d'un match. */
function matchSummary(match) {
  const joue = Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore);
  return joue ? `${match.homeScore} – ${match.awayScore}` : 'à venir';
}

function renderChampionship() {
  const champ = state.draft.championship || {};
  const teams = champ.teams || [];
  const matches = champ.matches || [];

  return `
    <section class="a-card">
      <header class="a-card__head">
        <div>
          <h2>Le championnat</h2>
          <p>Une seule saisie pour tout : classement, forme du moment, résultats, actualités et pronostics.</p>
        </div>
        <a class="a-btn a-btn--sm" href="/resultats" target="_blank" rel="noopener">Voir la page ↗</a>
      </header>
      <div class="a-card__body">
        <p class="a-hint">
          Le tableau du classement n'est <b>jamais recopié</b> : il se calcule à partir des scores
          saisis plus bas. Ajoutez d'abord les clubs de la poule, puis les matchs — y compris ceux
          qui ne concernent pas l'OSA, sans quoi le classement des autres serait faux.
        </p>
        <div class="a-grid a-grid--2">
          ${field('Titre de la section', 'championship.title', { placeholder: 'Championnat' })}
          ${field('Saison', 'championship.season', { placeholder: '2025 / 2026' })}
        </div>
        ${field('Sous-titre', 'championship.subtitle', { type: 'textarea' })}
        ${field('Notre club', 'championship.homeTeamId', {
          type: 'select',
          options: teamOptions(teams),
          hint: 'Sa ligne est mise en valeur, et sa forme du moment s\'affiche sur l\'accueil.'
        })}
        <div class="a-grid a-grid--3">
          ${field('Points par victoire', 'championship.points.win', { type: 'number' })}
          ${field('Points par match nul', 'championship.points.draw', { type: 'number' })}
          ${field('Points par défaite', 'championship.points.loss', { type: 'number', hint: 'En principe 0.' })}
        </div>
      </div>
    </section>

    <section class="a-card">
      <header class="a-card__head">
        <div>
          <h2>Compétitions</h2>
          <p>Championnat, coupe, amicaux : chacune a ses clubs et, si vous le voulez, son classement.</p>
        </div>
        <button class="a-btn a-btn--primary a-btn--sm" type="button" data-add="competition">+ Ajouter une compétition</button>
      </header>
      <div class="a-card__body">
        ${competitions().length
          ? `<div class="repeat">${competitions().map(competitionEditor).join('')}</div>`
          : '<p class="empty-state">Aucune compétition. Ajoutez-en une avant de saisir des matchs.</p>'}
      </div>
    </section>

    <section class="a-card">
      <header class="a-card__head">
        <div>
          <h2>Tous les clubs</h2>
          <p>${teams.length} club${teams.length > 1 ? 's' : ''} — nom, écusson et pénalités. L'inscription aux compétitions se règle au-dessus.</p>
        </div>
        <button class="a-btn a-btn--primary a-btn--sm" type="button" data-add="team">+ Ajouter un club</button>
      </header>
      <div class="a-card__body">
        ${teams.length
          ? `<div class="repeat">${teams.map(teamEditor).join('')}</div>`
          : '<p class="empty-state">Aucun club. Ajoutez-en depuis une compétition, ou ici.</p>'}
      </div>
    </section>

    <section class="a-card">
      <header class="a-card__head">
        <div><h2>Matchs</h2><p>${matches.length} rencontre${matches.length > 1 ? 's' : ''} enregistrée${matches.length > 1 ? 's' : ''}.</p></div>
        <button class="a-btn a-btn--primary a-btn--sm" type="button" data-add="match" ${teams.length < 2 ? 'disabled' : ''}>+ Ajouter un match</button>
      </header>
      <div class="a-card__body">
        ${teams.length < 2
          ? '<p class="empty-state">Ajoutez au moins deux clubs avant de saisir un match.</p>'
          : matches.length
            ? `<div class="repeat">${matches.map(matchEditor).join('')}</div>`
            : '<p class="empty-state">Aucun match. Cliquez sur « Ajouter un match ».</p>'}
      </div>
    </section>`;
}

function competitionEditor(competition, index) {
  const path = `championship.competitions.${index}`;
  const catalogue = state.draft.championship?.teams || [];
  const inscrits = new Set(competition.teamIds || []);
  const matchs = (state.draft.championship?.matches || [])
    .filter((match) => match.competitionId === competition.id).length;

  return `
    <article class="repeat__item">
      ${repeatHead('championship.competitions', index,
        `${competition.name || 'Nouvelle compétition'} · ${inscrits.size} club${inscrits.size > 1 ? 's' : ''}`)}
      <div class="repeat__body">
        <div class="a-grid a-grid--2">
          ${field('Nom', `${path}.name`, { placeholder: 'Championnat D2 UFOLEP' })}
          ${field('Tenir un classement', `${path}.standings`, {
            type: 'checkbox',
            hint: 'Décochez pour les amicaux : on les joue, on ne les compte pas.'
          })}
        </div>

        <div class="a-field">
          <span class="a-field__label">Clubs engagés</span>
          ${catalogue.length ? `
            <div class="a-checks">
              ${catalogue.map((team) => `
                <label class="a-check">
                  <input type="checkbox" data-competition="${esc(competition.id)}" data-team="${esc(team.id)}"
                         ${inscrits.has(team.id) ? 'checked' : ''}>
                  <span>${esc(team.name || team.id)}</span>
                </label>`).join('')}
            </div>`
            : '<p class="a-hint">Aucun club au catalogue pour l\'instant.</p>'}
          <small class="a-hint">
            ${matchs} match${matchs > 1 ? 's' : ''} rattaché${matchs > 1 ? 's' : ''} à cette compétition.
            Seuls les clubs cochés seront proposés à la saisie d'un match.
          </small>
        </div>

        <button class="a-btn a-btn--sm" type="button" data-add="team-in" data-competition="${esc(competition.id)}">
          + Créer un club dans cette compétition
        </button>
      </div>
    </article>`;
}

/** « Carlus · Championnat D2 UFOLEP, Coupe » — où ce club joue. */
function engagements(team) {
  const dans = competitions()
    .filter((competition) => (competition.teamIds || []).includes(team.id))
    .map((competition) => competition.name);
  return `${team.name || 'Nouveau club'}${dans.length ? ` · ${dans.join(', ')}` : ' · aucune compétition'}`;
}

function teamEditor(team, index) {
  const path = `championship.teams.${index}`;
  return `
    <article class="repeat__item">
      ${repeatHead('championship.teams', index, engagements(team))}
      <div class="repeat__body">
        <div class="a-grid a-grid--3">
          ${field('Nom', `${path}.name`, { placeholder: 'Carlus' })}
          ${field('Abréviation', `${path}.short`, { placeholder: 'Carlus', hint: 'Utilisée là où la place manque.' })}
          ${field('Points de pénalité', `${path}.penalty`, { type: 'number', hint: 'Retirés du total. 0 dans presque tous les cas.' })}
        </div>
        ${imageField('Écusson', `${path}.logo`)}
      </div>
    </article>`;
}

function matchEditor(match, index) {
  const path = `championship.matches.${index}`;
  const teams = state.draft.championship?.teams || [];
  // Le choix se restreint aux clubs de la compétition : c'est la raison d'être
  // des compétitions, et cela empêche d'opposer un club de coupe à la poule.
  const options = teamOptions(teamsForCompetition(match.competitionId));
  const ouverte = state.openEditor === index;
  const titre = `${teamLabel(teams, match.homeId)} — ${teamLabel(teams, match.awayId)} · ${matchSummary(match)}`;

  return `
    <article class="repeat__item${ouverte ? '' : ' is-collapsed'}">
      ${repeatHead('championship.matches', index, titre, { collapsible: true })}
      <div class="repeat__body">
        <div class="a-grid a-grid--3">
          ${field('Compétition', `${path}.competitionId`, {
            type: 'select',
            options: competitionOptions(),
            hint: 'Détermine les clubs proposés ci-dessous, et le classement concerné.'
          })}
          ${field('Journée', `${path}.day`, { type: 'number', hint: '0 pour un tour de coupe ou un amical.' })}
          ${field('Coup d\'envoi', `${path}.date`, { type: 'datetime', hint: 'Indispensable pour ouvrir les pronostics.' })}
        </div>

        <div class="a-grid a-grid--2">
          ${field('Équipe à domicile', `${path}.homeId`, { type: 'select', options })}
          ${field('Équipe à l\'extérieur', `${path}.awayId`, { type: 'select', options })}
        </div>

        <div class="a-grid a-grid--3">
          <label class="a-field">
            <span>Buts à domicile</span>
            <input type="number" min="0" max="99" data-score="${index}" data-role="home" value="${match.homeScore ?? ''}">
          </label>
          <label class="a-field">
            <span>Buts à l'extérieur</span>
            <input type="number" min="0" max="99" data-score="${index}" data-role="away" value="${match.awayScore ?? ''}">
          </label>
          <div class="a-field">
            <span class="a-field__label">Astuce</span>
            <small class="a-hint">
              Laissez les deux vides tant que le match n'est pas joué : il reste au calendrier
              et ouvert aux pronostics. Dès que vous saisissez le score, les packs sont versés.
            </small>
          </div>
        </div>

        ${field('Lieu', `${path}.venue`, { placeholder: 'Stade de Saint-Affrique-les-Montagnes', hint: 'Facultatif.' })}

        <p class="a-hint a-hint--section">
          <b>Récit du match — facultatif.</b> Renseigné, il devient une actualité sur la page
          d'accueil et un lien « Le récit » sur la page Résultats. Laissé vide, le match ne
          figure qu'aux résultats.
        </p>
        ${field('Titre du récit', `${path}.title`, { placeholder: 'Victoire éclatante !' })}
        ${listField('Buteurs OSA', `${path}.scorers`, 'Séparés par des virgules.')}
        ${field('Accroche (affichée sur la carte)', `${path}.excerpt`, { type: 'textarea' })}
        ${field('Texte complet', `${path}.body`, { type: 'textarea', hint: 'Une ligne vide crée un nouveau paragraphe.' })}
        ${imageField('Photo du match', `${path}.image`)}
      </div>
    </article>`;
}

/* ───────────────────────────────────────── Palmarès ── */

/* ────────────────────────────────────────────── Paris ── */

const BET_TYPES = [
  { value: 'score', label: 'Score exact d\u2019un match' },
  { value: 'result', label: 'R\u00e9sultat 1 / N / 2 d\u2019un match' },
  { value: 'choice', label: 'Question \u00e0 choix (buteur, passeur, pari pour rire\u2026)' }
];

const STATUT_LABELS = {
  open: 'Mises ouvertes',
  locked: 'Mises closes, r\u00e9sultat attendu',
  settled: 'R\u00e9gl\u00e9'
};

function bets() {
  return state.draft.bets?.items || [];
}

/** Les matchs proposés à un pari, du plus récent au plus ancien. */
function matchOptions() {
  const champ = state.draft.championship || {};
  const teams = champ.teams || [];
  return [
    { value: '', label: '— aucun —' },
    ...(champ.matches || []).map((match) => ({
      value: match.id,
      label: `${teamLabel(teams, match.homeId)} – ${teamLabel(teams, match.awayId)}`
        + (match.date ? ` · ${DATE_FMT.format(new Date(match.date))}` : '')
    }))
  ];
}

/**
 * Le statut d'un pari, calculé par le module que le site utilise.
 *
 * Le recalculer ici, sur le brouillon, c'est ce qui rend l'écran honnête : le
 * bureau voit tout de suite qu'une date passée ou une réponse désignée ferme
 * le pari — avant d'enregistrer, pas après.
 */
function betStatutLabel(bet) {
  return STATUT_LABELS[betStatus(state.draft, bet)] || '';
}

function renderBets() {
  const liste = bets();

  return `
    <section class="a-card">
      <header class="a-card__head">
        <div>
          <h2>Les paris</h2>
          <p>Le score du prochain match s'ouvre tout seul. Le reste, c'est vous qui l'inventez —
            et vous seul pouvez clore un pari et désigner la bonne réponse.</p>
        </div>
      </header>
      <div class="a-card__body">
        <div class="a-grid a-grid--2">
          ${field('Titre de la page', 'bets.title', { placeholder: 'Les paris' })}
          ${field('Sous-titre', 'bets.subtitle', { placeholder: 'Devinez juste, empochez des packs.' })}
        </div>
        ${field('Mot d\u2019introduction', 'bets.intro', {
          type: 'textarea',
          hint: 'Facultatif. Affiché en haut de la page des paris. Vide = rien.'
        })}
      </div>
    </section>

    <section class="a-card">
      <header class="a-card__head">
        <div>
          <h2>Pronostic automatique sur les matchs</h2>
          <p>Un pronostic de score s'ouvre de lui-même sur chaque match daté du calendrier,
            ferme au coup d'envoi, et se règle dès que vous saisissez le score.</p>
        </div>
      </header>
      <div class="a-card__body">
        ${field('Ouvrir un pronostic de score sur chaque match', 'bets.autoMatch', {
          type: 'checkbox',
          hint: 'Décoché, plus aucun pronostic ne s\u2019ouvre tout seul : à vous de les créer ci-dessous.'
        })}

        <p class="a-hint a-hint--section">Ce que rapporte un pronostic de match, en packs.
          Les trois paliers s'excluent : un score exact ne rapporte pas aussi le bon résultat.</p>
        <div class="a-grid a-grid--3">
          ${field('Score exact', 'bets.matchRewards.exact', { type: 'number' })}
          ${field('Bon résultat', 'bets.matchRewards.result', { type: 'number' })}
          ${field('Participation', 'bets.matchRewards.played', { type: 'number' })}
        </div>
      </div>
    </section>

    <section class="a-card">
      <header class="a-card__head">
        <div>
          <h2>Vos paris</h2>
          <p>${liste.length} pari${liste.length > 1 ? 's' : ''} créé${liste.length > 1 ? 's' : ''}.</p>
        </div>
        <button class="a-btn a-btn--primary" type="button" data-add="bet">Ajouter un pari</button>
      </header>
      <div class="a-card__body">
        <div class="repeat">
          ${liste.length
            ? liste.map((bet, index) => betEditor(bet, index)).join('')
            : '<p class="empty-state">Aucun pari pour l\u2019instant. « Ajouter un pari » en crée un, réglé sur oui / non.</p>'}
        </div>
      </div>
    </section>`;
}

function betEditor(bet, index) {
  const path = `bets.items.${index}`;
  const ouvert = state.openEditor === index;
  const surUnMatch = bet.type === 'score' || bet.type === 'result';
  const statut = betStatutLabel(bet);

  return `
    <article class="repeat__item${ouvert ? '' : ' is-collapsed'}">
      ${repeatHead('bets.items', index, `${bet.question || 'Sans question'} · ${statut}`, { collapsible: true })}
      <div class="repeat__body">
        ${field('La question', `${path}.question`, {
          placeholder: 'Nathan perd 2 kilos ou plus d\u2019ici la fin de la saison ?',
          hint: 'C\u2019est le titre du pari sur le site.'
        })}

        <div class="a-grid a-grid--2">
          ${field('Nature du pari', `${path}.type`, { type: 'select', options: BET_TYPES })}
          ${field(surUnMatch ? 'Match concerné (obligatoire)' : 'Match concerné (facultatif)',
            `${path}.matchId`, {
              type: 'select',
              options: matchOptions(),
              hint: surUnMatch
                ? 'Sans match, le pari n\u2019a ni échéance ni résultat : il redevient une question à choix.'
                : 'Rattacher un match donne au pari le coup d\u2019envoi comme date de clôture.'
            })}
        </div>

        ${field('Précision', `${path}.note`, {
          type: 'textarea',
          hint: 'Facultatif : la règle exacte, ce qui compte et ce qui ne compte pas.'
        })}

        ${bet.type === 'choice' ? betOptionsEditor(bet, index) : `
          <p class="a-hint a-hint--section">
            ${bet.type === 'score'
              ? 'Les parieurs saisissent deux nombres. La bonne réponse est le score que vous entrez dans l\u2019onglet Championnat : rien à désigner ici.'
              : 'Les parieurs choisissent entre les deux équipes et le match nul. La bonne réponse sort du score saisi dans l\u2019onglet Championnat : rien à désigner ici.'}
          </p>`}

        <p class="a-hint a-hint--section">Clôture des mises. Passé la date, ou la case cochée,
          plus personne ne peut répondre.</p>
        <div class="a-grid a-grid--2">
          ${field('Date limite de mise', `${path}.closesAt`, {
            type: 'datetime',
            hint: surUnMatch ? 'Vide = le coup d\u2019envoi du match.' : 'Vide = aucune limite : à vous de clore.'
          })}
          ${field('Clore les mises maintenant', `${path}.closed`, {
            type: 'checkbox',
            hint: 'Ferme le pari sur-le-champ, quelle que soit la date.'
          })}
        </div>

        <p class="a-hint a-hint--section">Récompenses, en packs.</p>
        <div class="a-grid a-grid--3">
          ${field(bet.type === 'score' ? 'Score exact' : 'Bonne réponse', `${path}.rewards.exact`, { type: 'number' })}
          ${bet.type === 'score'
            ? field('Bon résultat', `${path}.rewards.result`, { type: 'number' })
            : ''}
          ${field('Participation', `${path}.rewards.played`, {
            type: 'number',
            hint: 'Versé à qui a joué et s\u2019est trompé. 0 = rien.'
          })}
        </div>

        <p class="a-hint a-hint--section">État : <b>${esc(statut)}</b></p>
      </div>
    </article>`;
}

/**
 * Les réponses proposées, et celle qui gagne.
 *
 * Désigner la bonne réponse ferme le pari du même geste — c'est dit ici, avant
 * de cocher : laisser miser après coup reviendrait à distribuer les packs à qui
 * lit cette page.
 */
function betOptionsEditor(bet, index) {
  const path = `bets.items.${index}`;
  const options = bet.options || [];
  const gagnantes = new Set(bet.answers || []);

  return `
    <p class="a-hint a-hint--section">Les réponses proposées. Deux raccourcis&nbsp;: « Oui / Non »
      pour un pari pour rire, « l'effectif » pour un buteur ou un passeur.</p>

    <div class="a-actions">
      <button class="a-btn a-btn--sm" type="button" data-preset="yesno" data-index="${index}">Oui / Non</button>
      <button class="a-btn a-btn--sm" type="button" data-preset="squad" data-index="${index}">Les joueurs de l'effectif</button>
      <button class="a-btn a-btn--sm" type="button" data-add="bet-option" data-index="${index}">Ajouter une réponse</button>
    </div>

    ${options.length ? `
      <div class="a-options">
        ${options.map((option, rang) => `
          <div class="a-option">
            <label class="a-check" title="Bonne réponse">
              <input type="checkbox" data-bet-answer="${esc(option.id)}" data-index="${index}"${gagnantes.has(option.id) ? ' checked' : ''}>
              <span class="sr-only">Bonne réponse</span>
            </label>
            <input type="text" data-path="${esc(path)}.options.${rang}.label" data-type="text"
                   value="${esc(option.label || '')}" placeholder="Réponse ${rang + 1}">
            <button class="a-btn a-btn--icon a-btn--danger" type="button"
                    data-remove="${esc(path)}.options" data-index="${rang}" aria-label="Supprimer cette réponse">
              <svg viewBox="0 0 24 24"><path d="M9 3h6l1 2h4v2H4V5h4l1-2zM6 9h12l-1 12H7L6 9z"/></svg>
            </button>
          </div>`).join('')}
      </div>`
    : '<p class="empty-state">Aucune réponse proposée : le pari ne s\u2019affichera pas.</p>'}

    <p class="a-hint">Cochez la ou les bonnes réponses <b>une fois le pari terminé</b> :
      cela clôt le pari et verse les packs au prochain passage des parieurs.
      Plusieurs cases sont permises — un match a souvent deux buteurs.</p>`;
}

function renderPalmares() {
  const entries = state.draft.palmares?.entries || [];
  return `
    <section class="a-card">
      <header class="a-card__head">
        <div><h2>Page Palmarès</h2><p>Titre et sous-titre de la page /palmares.</p></div>
        <a class="a-btn a-btn--sm" href="/palmares" target="_blank" rel="noopener">Voir la page ↗</a>
      </header>
      <div class="a-card__body">
        ${field('Titre', 'palmares.title')}
        ${field('Sous-titre', 'palmares.subtitle', { type: 'textarea' })}
      </div>
    </section>

    <section class="a-card">
      <header class="a-card__head">
        <div><h2>Titres et distinctions</h2><p>${entries.length} ligne${entries.length > 1 ? 's' : ''}.</p></div>
        <button class="a-btn a-btn--primary a-btn--sm" type="button" data-add="palmares">+ Ajouter une ligne</button>
      </header>
      <div class="a-card__body">
        ${entries.length
          ? `<div class="repeat">${entries.map(palmaresEditor).join('')}</div>`
          : '<p class="empty-state">Aucune ligne. Ajoutez les titres, les montées et les belles places du club.</p>'}
      </div>
    </section>`;
}

function palmaresEditor(entry, index) {
  const path = `palmares.entries.${index}`;
  return `
    <article class="repeat__item">
      ${repeatHead('palmares.entries', index, [entry.year, entry.title].filter(Boolean).join(' · ') || 'Nouvelle ligne')}
      <div class="repeat__body">
        <div class="a-grid a-grid--2">
          ${field('Année ou saison', `${path}.year`, { placeholder: '2024 / 2025' })}
          ${field('Intitulé', `${path}.title`, { placeholder: 'Champion de la poule B' })}
        </div>
        <div class="a-grid a-grid--2">
          ${field('Compétition', `${path}.competition`, { placeholder: 'Championnat UFOLEP' })}
          ${field('Place obtenue', `${path}.rank`, { placeholder: '1er sur 10' })}
        </div>
        ${field('Précisions', `${path}.description`, { type: 'textarea' })}
        ${field('Mettre en avant', `${path}.highlight`, {
          type: 'checkbox',
          hint: 'Trophée doré plutôt que médaille : à réserver aux titres.'
        })}
        ${imageField('Photo', `${path}.image`)}
      </div>
    </article>`;
}

/* ──────────────────────────────────── Chant du club ── */

function renderAnthem() {
  const paroles = String(state.draft.anthem?.lyrics || '').trim();
  return `
    <section class="a-card">
      <header class="a-card__head">
        <div><h2>Le chant du club</h2><p>Affiché sur la page d'accueil et sur la page Palmarès.</p></div>
        <a class="a-btn a-btn--sm" href="/#chant" target="_blank" rel="noopener">Voir la section ↗</a>
      </header>
      <div class="a-card__body">
        <p class="a-hint">
          ${paroles
            ? 'La section est visible sur le site.'
            : '<b>Tant que les paroles sont vides, la section n\'apparaît nulle part.</b> Rien à masquer : il suffit d\'écrire.'}
        </p>
        ${field('Titre', 'anthem.title', { placeholder: 'Le chant du club' })}
        ${field('Sous-titre', 'anthem.subtitle', { type: 'textarea' })}
        ${field('Paroles', 'anthem.lyrics', {
          type: 'textarea',
          hint: 'Une ligne vide sépare deux couplets. Les retours à la ligne simples sont conservés.'
        })}
      </div>
    </section>`;
}

function renderMatch() {
  return `
    <section class="a-card">
      <header class="a-card__head">
        <div><h2>Affiche du prochain match</h2><p>Utilisée seulement à défaut de match programmé au championnat.</p></div>
      </header>
      <div class="a-card__body">
        <p class="a-hint">
          L'accueil affiche <b>le prochain match du championnat</b> dès qu'une rencontre y est
          programmée sans score — c'est aussi celle que les supporters pronostiquent. Cette
          affiche-ci ne sert que s'il n'y en a aucune, typiquement avant le début de saison.
        </p>
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
          ${field('Lieu', 'nextMatch.venue', { placeholder: 'Stade de Saint-Affrique-les-Montagnes' })}
        </div>
      </div>
    </section>`;
}

const POSITION_OPTIONS = [
  { value: 'GB', label: 'Gardien' },
  { value: 'DEF', label: 'Défenseur' },
  { value: 'MIL', label: 'Milieu' },
  { value: 'ATT', label: 'Attaquant' },
  { value: 'COACH', label: 'Coach' }
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

    ${renderSpotlightsCard()}

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
    </section>

    <section class="a-card a-card--danger">
      <header class="a-card__head">
        <div>
          <h2>Collections des supporters</h2>
          <p>Le jeu de packs distribue les cartes de cet effectif.</p>
        </div>
        <button class="a-btn a-btn--danger a-btn--sm" type="button" id="reset-packs">Remettre à zéro</button>
      </header>
      <div class="a-card__body">
        <p class="a-hint">
          Efface <b>toutes les collections</b> et rend à chaque compte ses
          ${SIGNUP_PACKS} packs de départ. Les comptes ne sont pas supprimés :
          pseudo et mot de passe restent valables, personne n'a à se réinscrire.
          À faire après avoir remanié les notes ou les raretés, quand les
          collections déjà constituées ne suivent plus les règles du jeu.
          <b>Cette action est définitive.</b>
        </p>
      </div>
    </section>`;
}

/**
 * Joueurs mis en avant. Le libellé est libre : « En forme », « À surveiller »,
 * « De retour »… C'est un choix éditorial, rien ne se calcule tout seul.
 */
function renderSpotlightsCard() {
  const spots = state.draft.squad?.spotlights || [];
  const players = state.draft.squad?.players || [];
  const enregistres = players.filter((player) => player.id);
  const options = [
    { value: '', label: '— choisir un joueur —' },
    ...enregistres.map((player) => ({
      value: player.id,
      label: [player.firstName, player.lastName].filter(Boolean).join(' ') || player.id
    }))
  ];

  return `
    <section class="a-card">
      <header class="a-card__head">
        <div><h2>Joueurs mis en avant</h2><p>Bandeau « À suivre », en tête de la page Effectif.</p></div>
        <button class="a-btn a-btn--primary a-btn--sm" type="button" data-add="spotlight"
                ${enregistres.length ? '' : 'disabled'}>+ Mettre un joueur en avant</button>
      </header>
      <div class="a-card__body">
        ${enregistres.length ? '' : `
          <p class="a-hint">
            Enregistrez d'abord vos fiches de joueurs : une fiche encore jamais enregistrée
            n'a pas d'identifiant, et ne peut donc pas être désignée ici.
          </p>`}
        ${spots.length ? `<div class="repeat">${spots.map((spot, index) => `
          <article class="repeat__item">
            ${repeatHead('squad.spotlights', index, spot.label || 'Mise en avant')}
            <div class="repeat__body">
              <div class="a-grid a-grid--2">
                ${field('Joueur', `squad.spotlights.${index}.playerId`, { type: 'select', options })}
                ${field('Libellé', `squad.spotlights.${index}.label`, { placeholder: 'En forme' })}
              </div>
              ${field('Motif', `squad.spotlights.${index}.reason`, {
                type: 'textarea',
                placeholder: '4 buts sur les 2 derniers matchs'
              })}
            </div>
          </article>`).join('')}</div>`
          : '<p class="empty-state">Personne n\'est mis en avant : le bandeau reste masqué sur le site.</p>'}
      </div>
    </section>`;
}

function playerEditor(player, index) {
  const path = `squad.players.${index}`;
  const name = [player.firstName, player.lastName].filter(Boolean).join(' ') || 'Nouveau joueur';
  const position = POSITION_OPTIONS.find((o) => o.value === player.position)?.label || '';
  const ouverte = state.openEditor === index;
  // Le staff n'est pas noté : ni étoiles, ni notes sur 99.
  const staff = isStaff(player);

  return `
    <article class="repeat__item${ouverte ? '' : ' is-collapsed'}">
      ${repeatHead('squad.players', index, `${name}${position ? ' · ' + position : ''}`, { collapsible: true })}
      <div class="repeat__body">
        <div class="a-grid a-grid--3">
          ${field('Prénom', `${path}.firstName`, { placeholder: 'Silas' })}
          ${field('Nom', `${path}.lastName`, { placeholder: 'Clamens Albert', hint: 'Facultatif.' })}
          ${field('Numéro', `${path}.number`, { type: 'number', hint: '0 = pas de numéro sur la carte.' })}
        </div>

        ${field('Surnom', `${path}.nickname`, {
          placeholder: 'Le Renard',
          hint: 'Affiché entre guillemets sous le nom, sur la grande carte et dans la fiche. Vide = rien.'
        })}

        ${imageField('Photo', `${path}.photo`)}

        <div class="a-grid a-grid--3">
          ${field('Âge', `${path}.age`, { type: 'number', hint: '0 = non renseigné, la ligne se masque.' })}
          ${field('Nationalité', `${path}.nationality`, { placeholder: 'France' })}
          ${field('Poste', `${path}.position`, { type: 'select', options: POSITION_OPTIONS })}
        </div>

        <div class="a-grid a-grid--3">
          ${field('Au club depuis', `${path}.since`, { type: 'number', placeholder: '2021', hint: "Année d'arrivée : l'ancienneté en est déduite." })}
          ${staff ? `
            <div class="a-field a-field--wide">
              <span class="a-field__label">Notes</span>
              <p class="a-hint">
                Un coach n'est pas noté : ni étoiles de mauvais pied ou de gestes
                techniques, ni notes sur 99. Sa carte n'affiche que la note générale
                ci-dessous, et seulement si vous en saisissez une.
              </p>
            </div>` : `
            ${field('Mauvais pied', `${path}.weakFoot`, { type: 'select', options: STAR_OPTIONS })}
            ${field('Gestes techniques', `${path}.skillMoves`, { type: 'select', options: STAR_OPTIONS })}`}
        </div>

        ${staff ? '' : `
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
          </div>`}

        <div class="a-grid a-grid--2">
          ${field('Valeur marchande', `${path}.marketValue`, {
            placeholder: '240 000 €',
            hint: 'Texte libre, repris tel quel sur la carte. Le tri « Valeur marchande » sait lire 240 000 €, 1,2 M€ ou 50k.'
          })}
          ${field('Note générale', `${path}.overall`, {
            type: 'number',
            value: Number(player.overall) > 0 ? player.overall : '',
            placeholder: staff ? '' : String(averageOf(player)),
            hint: staff
              ? "Facultative : laissée vide, aucune note n'apparaît sur la carte du coach."
              : `Laissez vide pour garder la moyenne des six notes (${averageOf(player)}). `
                + "Saisissez un nombre de 1 à 99 pour l'imposer : c'est elle qui s'affiche "
                + 'en gros sur la carte et qui sert au classement.'
          })}
        </div>

        ${field('Carte légendaire', `${path}.legendary`, {
          type: 'checkbox',
          hint: "Réservé à une poignée de joueurs : leur carte devient quasiment impossible à sortir d'un pack, quelle que soit leur note."
        })}

        ${field('Compagne', `${path}.partner`, {
          placeholder: 'Prénom',
          hint: "Affichée sur la fiche détaillée, à côté de l'âge et de la valeur marchande. Vide = ligne masquée."
        })}

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
  gallery: {
    label: 'galerie',
    heading: 'Galerie photo',
    listTitle: 'Photos de la galerie',
    addLabel: '+ Ajouter une photo',
    captionExample: 'Coupe — 8es de finale',
    empty: "Aucune photo. La page Galerie affiche un message d'attente. Téléversez vos photos depuis l'onglet Médiathèque, puis ajoutez-les ici."
  },
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

/**
 * Un classement de la saison. Les joueurs ne se saisissent plus ici : la liste
 * est celle de l'onglet Effectif, et chaque fiche y reçoit son compteur.
 */
function statGroup(group, index) {
  const path = `stats.groups.${index}`;
  const effectif = state.draft.squad?.players || [];
  // Un classement peut ne concerner qu'un poste : les arrêts, par exemple.
  const players = group.only ? effectif.filter((player) => player.position === group.only) : effectif;
  const values = group.values || {};
  const comptes = players.filter((player) => Number(values[player.id]) > 0).length;
  const ouverte = state.openEditor === index;

  return `
    <article class="repeat__item${ouverte ? '' : ' is-collapsed'}">
      ${repeatHead('stats.groups', index, group.title || 'Classement', { collapsible: true })}
      <div class="repeat__body">
        <div class="a-grid a-grid--3">
          ${field('Titre', `${path}.title`, { placeholder: 'Meilleurs buteurs' })}
          ${field('Unité', `${path}.unit`, { placeholder: 'buts' })}
          ${field('Couleur', `${path}.accent`, {
            type: 'select',
            options: [
              { value: 'gold', label: 'Or' }, { value: 'blue', label: 'Bleu' },
              { value: 'red', label: 'Rouge' }, { value: 'green', label: 'Vert' }
            ]
          })}
        </div>
        <div class="a-grid a-grid--2">
          ${field('Icône', `${path}.icon`, {
            type: 'select',
            options: [
              { value: 'ball', label: 'Ballon' }, { value: 'boot', label: 'Crampon' },
              { value: 'oops', label: 'Alerte (CSC)' }, { value: 'card', label: 'Carton (penalty)' },
              { value: 'shirt', label: 'Maillot (matchs joués)' }, { value: 'check', label: 'Coche (présence)' },
              { value: 'glove', label: 'Gant (arrêts)' }
            ]
          })}
          ${field('Poste concerné', `${path}.only`, {
            type: 'select',
            options: [{ value: '', label: "Tout l'effectif" }, ...POSITION_OPTIONS],
            hint: 'Restreint le classement à un seul poste. Les arrêts ne concernent que les gardiens.'
          })}
        </div>

        <div class="a-field">
          <span class="a-field__label">Compteurs de l'effectif</span>
          <p class="a-hint">
            La liste suit l'onglet Effectif : un joueur ajouté, renommé ou supprimé
            s'y répercute tout seul. Un compteur laissé vide vaut zéro — le joueur
            apparaît quand même dans le classement.
            ${players.length ? ` ${comptes} joueur${comptes > 1 ? 's' : ''} sur ${players.length} au-dessus de zéro.` : ''}
            ${group.only ? ` Classement réservé au poste : ${POSITION_OPTIONS.find((o) => o.value === group.only)?.label || group.only}.` : ''}
          </p>
          ${players.length ? `
            <div class="counters">
              ${players.map((player) => `
                <label class="counter">
                  <span class="counter__name">${esc(fullName(player))}</span>
                  <input type="number" min="0" inputmode="numeric" placeholder="0"
                         data-path="${esc(path)}.values.${esc(player.id)}" data-type="number"
                         value="${Number(values[player.id]) > 0 ? Number(values[player.id]) : ''}">
                </label>`).join('')}
            </div>`
            : `<p class="empty-state">${group.only
                ? 'Aucun joueur \u00e0 ce poste dans l&rsquo;effectif : changez le poste concern\u00e9, ou ajoutez un joueur.'
                : 'Aucun joueur dans l&rsquo;effectif : commencez par l&rsquo;onglet Effectif.'}</p>`}
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
        <div>
          <h2>Contact &amp; réseaux</h2>
          <p>Utilisés dans la section Contact et le pied de page. Le club ne publie pas
            d'adresse e-mail : les messages arrivent par le formulaire, dans « Messages reçus ».</p>
        </div>
      </header>
      <div class="a-card__body">
        ${field('Terrain / adresse', 'club.address', {
          placeholder: '21 Rte du Stade, 81290 Saint-Affrique-les-Montagnes',
          hint: 'Adresse postale du stade. Elle apparaît en section Contact, en pied de page et sur la carte.'
        })}
        <div class="a-grid a-grid--2">
          ${field('Page Facebook', 'club.facebook', { placeholder: 'https://www.facebook.com/…', hint: 'URL complète. Vide = lien masqué.' })}
          ${field('Compte Instagram', 'club.instagram', { placeholder: 'https://www.instagram.com/…', hint: 'URL complète. Vide = lien masqué.' })}
        </div>
        ${field('Année du copyright', 'club.copyrightYear', { placeholder: '2026', hint: 'Affichée en bas de chaque page.' })}
      </div>
    </section>

    <section class="a-card">
      <header class="a-card__head">
        <div><h2>Notre stade</h2><p>Section dédiée sur la page d'accueil, avec la carte.</p></div>
      </header>
      <div class="a-card__body">
        <div class="a-grid a-grid--2">
          ${field('Titre de la section', 'venue.title', { placeholder: 'Notre stade' })}
          ${field('Nom du stade', 'venue.name', { placeholder: 'Stade de Saint-Affrique-les-Montagnes' })}
        </div>
        ${field('Accroche', 'venue.subtitle', { type: 'textarea' })}
        ${field('Carte Google Maps', 'venue.mapsEmbed', {
          placeholder: 'https://www.google.com/maps/embed?pb=…',
          hint: "Sur Google Maps : « Partager » → « Intégrer une carte » → copiez uniquement l'adresse entre guillemets après src=. "
              + 'Seules les adresses google.com/maps/embed sont acceptées. Vide = la section affiche le plan sans carte interactive.'
        })}
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
          placeholder: '21 Rte du Stade, 81290 Saint-Affrique-les-Montagnes',
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

        <p class="a-hint">Le moyen de contact déclaré dans les mentions légales est le
          formulaire du site : l'association ne publie pas d'adresse e-mail.</p>
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
  // L'accordéon est propre à l'onglet : en changer referme tout, sinon on
  // arrive dans les classements avec la troisième fiche déjà ouverte.
  if (changedTab) state.openEditor = null;
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
    championship: (state.draft?.championship?.matches || []).length,
    bets: (state.draft?.bets?.items || []).length,
    squad: (state.draft?.squad?.players || []).length,
    palmares: (state.draft?.palmares?.entries || []).length,
    calendar: (state.draft?.calendar?.images || []).length,
    gallery: (state.draft?.gallery?.images || []).length,
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

  /*
   * La bonne réponse d'un pari. Elle vaut des packs : la cocher clôt le pari et
   * déclenche le versement au prochain passage des parieurs. On redessine donc
   * aussitôt, pour que l'état affiché dise la vérité.
   */
  if (input.dataset.betAnswer !== undefined) {
    const pari = bets()[Number(input.dataset.index)];
    if (pari) {
      const gagnantes = new Set(pari.answers || []);
      if (input.checked) gagnantes.add(input.dataset.betAnswer);
      else gagnantes.delete(input.dataset.betAnswer);
      pari.answers = [...gagnantes];
    }
    refreshDirtyState();
    return renderTab();
  }

  /* Inscription d'un club à une compétition. */
  if (input.dataset.competition !== undefined && input.dataset.team !== undefined) {
    const competition = competitions().find((c) => c.id === input.dataset.competition);
    if (competition) {
      const inscrits = new Set(competition.teamIds || []);
      if (input.checked) inscrits.add(input.dataset.team);
      else inscrits.delete(input.dataset.team);
      competition.teamIds = [...inscrits];
    }
    refreshDirtyState();
    // Les listes déroulantes des matchs suivent immédiatement.
    return renderTab();
  }

  /*
   * Score d'un match. Un champ vide vaut `null`, pas zéro : c'est ce qui
   * distingue un match à venir d'un match perdu 0-0.
   */
  if (input.dataset.score !== undefined) {
    const index = Number(input.dataset.score);
    const item = input.closest('.repeat__item');
    const lire = (role) => {
      const brut = $(`[data-role="${role}"]`, item)?.value.trim() ?? '';
      return brut === '' ? null : Number(brut);
    };
    const match = state.draft.championship?.matches?.[index];
    if (match) {
      match.homeScore = lire('home');
      match.awayScore = lire('away');
    }
    refreshDirtyState();
    return;
  }

  const path = input.dataset.path;
  if (!path) return;

  const type = input.dataset.type || 'text';
  let value = input.value;

  if (type === 'bool') value = input.checked === true;
  else if (type === 'number') value = Number(value) || 0;
  else if (type === 'list') value = value.split(',').map((s) => s.trim()).filter(Boolean);
  else if (type === 'datetime') value = value ? new Date(value).toISOString() : '';

  setPath(state.draft, path, value);

  if (input.hasAttribute('data-image-input')) updatePreview(path, value);

  // Le titre affiché dans l'en-tête du bloc suit la saisie.
  if (/\.(title|name|caption)$/.test(path)) {
    const label = input.closest('.repeat__item')?.querySelector('.repeat__label');
    if (label) label.textContent = value || '—';
  }

  // Changer de compétition change les clubs proposés : il faut redessiner.
  if (/^championship\.matches\.\d+\.competitionId$/.test(path)) {
    refreshDirtyState();
    return renderTab();
  }

  /*
   * Changer la nature d'un pari change tout l'éditeur : un score n'a pas de
   * réponses à lister, une question à choix n'a pas de palier « bon résultat ».
   * Le match rattaché en fait autant — il donne l'échéance.
   */
  if (/^bets\.items\.\d+\.(type|matchId)$/.test(path)) {
    refreshDirtyState();
    return renderTab();
  }

  // La question d'un pari sert de titre à sa fiche repliée.
  if (/^bets\.items\.\d+\.question$/.test(path)) {
    refreshDirtyState();
    const label = input.closest('.repeat__item')?.querySelector('.repeat__label');
    if (label) label.textContent = value || '—';
    return;
  }

  // Renommer une compétition se répercute sur les en-têtes et les listes.
  if (/^championship\.competitions\.\d+\.name$/.test(path)) {
    refreshDirtyState();
    return renderTab();
  }

  // Changer une équipe met à jour l'en-tête replié du match.
  if (/^championship\.matches\.\d+\.(homeId|awayId)$/.test(path)) {
    refreshDirtyState();
    return renderTab();
  }

  // Renommer un club se répercute sur toutes les listes déroulantes.
  if (/^championship\.teams\.\d+\.name$/.test(path)) {
    refreshDirtyState();
    return renderTab();
  }

  // Le poste concerné par un classement change la liste des compteurs affichés.
  if (/^stats\.groups\.\d+\.only$/.test(path)) {
    refreshDirtyState();
    renderTab();
    return;
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

/**
 * Identifiant interne, attribué dès la création. Les clubs et les matchs sont
 * désignés par cet identifiant ailleurs dans le document (un match cite deux
 * clubs, un pronostic cite un match) : il doit donc exister avant même le
 * premier enregistrement, et ne plus jamais changer ensuite.
 */
function newId(prefixe) {
  return `${prefixe}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const BLANK = {
  competition: () => ({ id: newId('competition'), name: 'Nouvelle compétition', standings: true, teamIds: [] }),
  /*
   * Un pari neuf est un pari pour rire : c'est celui qu'on invente le plus
   * souvent, et les deux réponses sont déjà là. Le score des matchs, lui,
   * s'ouvre tout seul — personne n'a à le créer.
   */
  bet: () => ({
    id: newId('pari'), type: 'choice', question: 'Nouveau pari', note: '', matchId: '',
    options: YES_NO.map((option) => ({ ...option })),
    answers: [], closesAt: '', closed: false,
    rewards: { exact: 5, result: 0, played: 1 }
  }),
  betOption: () => ({ id: newId('option'), label: '' }),
  team: () => ({ id: newId('club'), name: 'Nouveau club', short: '', logo: '', penalty: 0 }),
  match: () => ({
    id: newId('match'), competitionId: '', day: 0, date: '', venue: '',
    homeId: '', awayId: '', homeScore: null, awayScore: null,
    title: '', excerpt: '', body: '', image: '', scorers: []
  }),
  palmares: () => ({
    id: '', year: '', title: 'Nouvelle ligne', competition: '', rank: '',
    description: '', image: '', highlight: false
  }),
  spotlight: () => ({ playerId: '', label: 'En forme', reason: '' }),
  image: () => ({ src: '', alt: '', caption: '' }),
  playerCard: () => ({
    id: '', firstName: '', lastName: 'Nouveau joueur', photo: '',
    age: 0, nationality: 'France', position: 'MIL', since: new Date().getFullYear(),
    weakFoot: 3, skillMoves: 3,
    ratings: Object.fromEntries([...RATINGS_OUTFIELD, ...RATINGS_GK].map(([key]) => [key, 50])),
    overall: 0, legendary: false, partner: '', description: '', marketValue: ''
  }),
  statGroup: () => ({ id: '', title: 'Nouveau classement', unit: 'buts', accent: 'blue', icon: 'ball', values: {} })
};

/**
 * Le message de confirmation d'une suppression. Supprimer un club encore
 * engage dans des matchs cassait l'affiche de la page d'accueil sans prevenir :
 * on annonce desormais la consequence avant, pas apres.
 */
function removalWarning(listPath, element) {
  if (listPath === 'championship.competitions' && element?.id) {
    const matchs = (state.draft.championship?.matches || [])
      .filter((match) => match.competitionId === element.id);
    if (matchs.length) {
      return `« ${element.name || element.id} » compte ${matchs.length} match`
        + `${matchs.length > 1 ? 's' : ''}. Les supprimer avec elle ?\n\n`
        + 'Sinon, ils seront rattachés à la première compétition restante.\n\n'
        + 'Supprimer la compétition ?';
    }
  }

  if (listPath === 'bets.items' && element?.question) {
    return `Supprimer « ${element.question} » ?\n\n`
      + 'Les mises déjà posées sur ce pari resteront en attente : elles ne rapporteront rien.';
  }

  if (listPath === 'championship.teams' && element?.id) {
    const matchs = (state.draft.championship?.matches || [])
      .filter((match) => match.homeId === element.id || match.awayId === element.id);
    if (matchs.length) {
      return `« ${element.name || element.id} » est engagé dans ${matchs.length} match`
        + `${matchs.length > 1 ? 's' : ''}. Le supprimer laisserait `
        + `${matchs.length > 1 ? 'ces rencontres' : 'cette rencontre'} sans adversaire nommé.\n\n`
        + 'Supprimez plutôt les matchs concernés si vous ne voulez plus de ce club.\n\n'
        + 'Supprimer quand même ?';
    }
  }
  return 'Supprimer définitivement cet élément ?';
}

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
  if (target.dataset.add === 'competition') {
    ((state.draft.championship ||= {}).competitions ||= []).push(BLANK.competition());
    return renderTab();
  }
  if (target.dataset.add === 'team') {
    ((state.draft.championship ||= {}).teams ||= []).push(BLANK.team());
    return renderTab();
  }
  if (target.dataset.add === 'team-in') {
    // Un club créé depuis une compétition y est inscrit d'emblée : sinon il
    // faudrait le cocher juste après, sans raison.
    const champ = (state.draft.championship ||= {});
    const club = BLANK.team();
    (champ.teams ||= []).push(club);
    const competition = (champ.competitions || []).find((c) => c.id === target.dataset.competition);
    if (competition) (competition.teamIds ||= []).push(club.id);
    return renderTab();
  }
  if (target.dataset.add === 'match') {
    const champ = (state.draft.championship ||= {});
    const nouveau = BLANK.match();
    nouveau.competitionId = (champ.competitions || [])[0]?.id || '';
    // Deux clubs pré-remplis, pris dans la compétition : on ne s'ouvre pas sur
    // un formulaire vide.
    const equipes = teamsForCompetition(nouveau.competitionId);
    nouveau.homeId = equipes.some((team) => team.id === champ.homeTeamId)
      ? champ.homeTeamId
      : (equipes[0]?.id || '');
    nouveau.awayId = (equipes.find((team) => team.id !== nouveau.homeId) || {}).id || '';
    (champ.matches ||= []).unshift(nouveau);
    state.openEditor = 0;
    return renderTab();
  }
  if (target.dataset.add === 'bet') {
    ((state.draft.bets ||= {}).items ||= []).push(BLANK.bet());
    state.openEditor = state.draft.bets.items.length - 1;
    return renderTab();
  }
  if (target.dataset.add === 'bet-option') {
    const pari = bets()[Number(target.dataset.index)];
    if (pari) (pari.options ||= []).push(BLANK.betOption());
    return renderTab();
  }

  /*
   * Les deux raccourcis de saisie. Ils remplacent la liste au lieu de s'y
   * ajouter : mélanger « Oui / Non » et l'effectif ne veut rien dire, et une
   * bonne réponse déjà cochée n'a plus de sens une fois les options changées.
   */
  if (target.dataset.preset) {
    const pari = bets()[Number(target.dataset.index)];
    if (!pari) return;
    if (target.dataset.preset === 'yesno') {
      pari.options = YES_NO.map((option) => ({ ...option }));
    } else {
      pari.options = (state.draft.squad?.players || [])
        .filter((joueur) => !isStaff(joueur))
        .map((joueur) => ({ id: joueur.id, label: fullName(joueur) }));
    }
    pari.answers = [];
    return renderTab();
  }

  if (target.dataset.add === 'palmares') {
    ((state.draft.palmares ||= {}).entries ||= []).push(BLANK.palmares());
    return renderTab();
  }
  if (target.dataset.add === 'spotlight') {
    ((state.draft.squad ||= {}).spotlights ||= []).push(BLANK.spotlight());
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
    state.openEditor = state.draft.stats.groups.length - 1;
    return renderTab();
  }

  /* — Suppression / déplacement — */
  if (target.dataset.remove) {
    const list = getPath(state.draft, target.dataset.remove);
    const index = Number(target.dataset.index);
    if (Array.isArray(list) && confirm(removalWarning(target.dataset.remove, list[index]))) {
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

async function resetPacks() {
  const question = 'Effacer toutes les collections et rendre à chaque compte ses '
    + SIGNUP_PACKS + ' packs de départ ?\n\nLes comptes sont conservés. Cette action est définitive.';
  if (!confirm(question)) return;

  try {
    const payload = await api('/api/club/reset', { method: 'POST' });
    toast(payload.users
      ? `${payload.users} compte${payload.users > 1 ? 's' : ''} remis à zéro, `
        + `${payload.cards} carte${payload.cards > 1 ? 's' : ''} effacée${payload.cards > 1 ? 's' : ''}.`
      : 'Aucun compte à remettre à zéro.', 'success');
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
      ? deepMerge(cloneContent(DEFAULT_CONTENT), migrateContent(payload.content))
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
  renderTab('championship');
}

async function boot() {
  /* Écouteurs branchés une fois pour toutes. */
  $('#login-form').addEventListener('submit', onLogin);
  $('#logout').addEventListener('click', onLogout);
  $('#save-btn').addEventListener('click', save);
  $('#reset-btn').addEventListener('click', resetToDefaults);
  // Délégué : le bouton n'existe que dans l'onglet Effectif, redessiné souvent.
  $('#panel').addEventListener('click', (event) => {
    if (event.target.closest('#reset-packs')) resetPacks();
  });
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
