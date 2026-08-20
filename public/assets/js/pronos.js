/**
 * OSA FOOT 7 — pronostics.
 *
 * On devine le score des matchs à venir ; dès que le résultat est saisi dans
 * l'administration, les packs tombent tout seuls au passage suivant du parieur.
 * Score exact, bon résultat, ou simple participation : trois paliers, jamais
 * cumulés.
 *
 * Le navigateur n'arbitre rien. Il envoie une prévision, le serveur la compare
 * au score officiel — sans quoi il suffirait de modifier la page pour gagner.
 */

import {
  isPredictable, predictableMatches, teamLogo, teamName, teamShort, kickoffTime
} from './league.js';

const $ = (sel, root = document) => root.querySelector(sel);

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const DATE_MATCH = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
});

const OUTCOME_LABELS = {
  exact: 'Score exact',
  result: 'Bon résultat',
  played: 'Participation'
};

const state = {
  content: null,
  user: null,
  /** matchId → { home, away, settled, outcome, awarded } */
  predictions: new Map(),
  board: [],
  rewards: { exact: 15, result: 3, played: 1 },
  busy: false,
  loaded: false
};

function champ() {
  return state.content?.championship || {};
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

function toast(message) {
  const boite = $('#toast');
  if (!boite) return;
  boite.textContent = message;
  boite.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { boite.hidden = true; }, 4000);
}

function setError(message) {
  const zone = $('#pronos-error');
  if (!zone) return;
  zone.textContent = message || '';
  zone.hidden = !message;
}

function absorb(payload) {
  state.user = payload.user || null;
  state.board = Array.isArray(payload.board) ? payload.board : [];
  if (payload.rewards) state.rewards = payload.rewards;
  state.predictions = new Map(
    (Array.isArray(payload.predictions) ? payload.predictions : []).map((p) => [p.matchId, p])
  );
  state.loaded = true;
}

async function charger() {
  try {
    const payload = await api('/api/club/predictions');
    absorb(payload);
    // Les gains viennent d'être versés : autant le dire, la page ne se
    // rechargera pas toute seule.
    if (payload.settled?.packs) {
      toast(`+${payload.settled.packs} pack${payload.settled.packs > 1 ? 's' : ''} : vos pronostics sont tombés !`);
    }
  } catch {
    // Déploiement sans base : la section reste lisible, simplement inerte.
    state.loaded = true;
  }
  paint();
}

/* ═══════════════════════════════════════════ Rendu ══ */

function crest(teamId) {
  const logo = teamLogo(champ(), teamId);
  const nom = teamShort(champ(), teamId);
  return logo
    ? `<img src="${esc(logo)}" alt="" width="44" height="44" loading="lazy" decoding="async">`
    : `<span class="crest__initial" aria-hidden="true">${esc(nom.charAt(0) || '?')}</span>`;
}

function whenLabel(match) {
  const heure = kickoffTime(match);
  return heure === null ? 'Date à confirmer' : DATE_MATCH.format(new Date(heure));
}

function renderAccount() {
  const zone = $('#pronos-account');
  if (!zone) return;

  if (!state.loaded) { zone.innerHTML = ''; return; }

  zone.innerHTML = state.user
    ? `<span class="pronos__who">Vous pronostiquez en tant que <b>${esc(state.user.username)}</b></span>
       <span class="pronos__stock">${state.user.packs} pack${state.user.packs > 1 ? 's' : ''} en réserve</span>`
    : `<span class="pronos__who">Les pronostics sont réservés aux membres — c'est gratuit et ça prend dix secondes.</span>
       <a class="btn btn--primary btn--sm" href="/packs">Créer mon compte</a>`;
}

function predictionState(match) {
  const mise = state.predictions.get(match.id);
  if (!mise) return '<span class="prono__state">Pas encore de pronostic</span>';
  if (!mise.settled) {
    return `<span class="prono__state prono__state--set">Pronostic enregistré : ${mise.home} – ${mise.away}</span>`;
  }
  return `<span class="prono__state prono__state--won">${esc(OUTCOME_LABELS[mise.outcome] || 'Réglé')} · +${mise.awarded} pack${mise.awarded > 1 ? 's' : ''}</span>`;
}

function pronoFormHTML(match, index) {
  const mise = state.predictions.get(match.id);
  const ouvert = Boolean(state.user);
  const champId = (cote) => `prono-${esc(match.id)}-${cote}`;

  return `
    <form class="prono" data-match="${esc(match.id)}" data-reveal style="--delay:${index * 70}ms">
      <p class="prono__meta">
        ${match.day ? `<span class="chip">${match.day}${match.day === 1 ? 're' : 'e'} journée</span>` : ''}
        ${match.competition ? `<span class="chip chip--soft">${esc(match.competition)}</span>` : ''}
        <span class="prono__when">${esc(whenLabel(match))}</span>
      </p>

      <div class="prono__row">
        <span class="prono__team">
          <span class="prono__crest">${crest(match.homeId)}</span>
          <span class="prono__name">${esc(teamName(champ(), match.homeId))}</span>
        </span>

        <span class="prono__inputs">
          <label class="sr-only" for="${champId('home')}">Buts de ${esc(teamName(champ(), match.homeId))}</label>
          <input id="${champId('home')}" name="home" type="number" min="0" max="30" step="1"
                 inputmode="numeric" value="${mise ? mise.home : ''}" placeholder="0"
                 ${ouvert ? '' : 'disabled'}>
          <i aria-hidden="true">–</i>
          <label class="sr-only" for="${champId('away')}">Buts de ${esc(teamName(champ(), match.awayId))}</label>
          <input id="${champId('away')}" name="away" type="number" min="0" max="30" step="1"
                 inputmode="numeric" value="${mise ? mise.away : ''}" placeholder="0"
                 ${ouvert ? '' : 'disabled'}>
        </span>

        <span class="prono__team prono__team--away">
          <span class="prono__crest">${crest(match.awayId)}</span>
          <span class="prono__name">${esc(teamName(champ(), match.awayId))}</span>
        </span>
      </div>

      <div class="prono__foot">
        <button class="btn btn--primary btn--sm" type="submit" ${ouvert ? '' : 'disabled'}>
          ${mise ? 'Modifier' : 'Valider'}
        </button>
        ${predictionState(match)}
      </div>
    </form>`;
}

function renderOpen() {
  const zone = $('#pronos-list');
  if (!zone) return;

  const ouverts = predictableMatches(champ());
  zone.innerHTML = ouverts.length
    ? ouverts.map(pronoFormHTML).join('')
    : `<p class="empty">Aucun match ouvert aux pronostics pour l'instant. Revenez quand la prochaine
       rencontre sera programmée : les pronostics ferment au coup d'envoi.</p>`;
}

function renderHistory() {
  const zone = $('#pronos-history');
  if (!zone) return;

  const regles = [...state.predictions.values()].filter((mise) => mise.settled);
  const bloc = zone.closest('[data-pronos-history]') || zone;
  bloc.hidden = !regles.length;
  if (!regles.length) { zone.innerHTML = ''; return; }

  const matchs = new Map((champ().matches || []).map((match) => [match.id, match]));

  zone.innerHTML = `
    <h3 class="pronos__subtitle">Vos pronostics réglés</h3>
    <ul class="pronos__log">
      ${regles.map((mise) => {
        const match = matchs.get(mise.matchId);
        const titre = match
          ? `${teamShort(champ(), match.homeId)} ${match.homeScore} – ${match.awayScore} ${teamShort(champ(), match.awayId)}`
          : 'Match retiré du calendrier';
        return `
          <li class="pronos__log-item pronos__log-item--${esc(mise.outcome || 'played')}">
            <span class="pronos__log-match">${esc(titre)}</span>
            <span class="pronos__log-guess">votre prono : ${mise.home} – ${mise.away}</span>
            <span class="pronos__log-gain">${esc(OUTCOME_LABELS[mise.outcome] || '—')} · +${mise.awarded}</span>
          </li>`;
      }).join('')}
    </ul>`;
}

function renderBoard() {
  const zone = $('#pronos-board');
  if (!zone) return;

  const bloc = zone.closest('[data-pronos-board]') || zone;
  bloc.hidden = !state.board.length;
  if (!state.board.length) { zone.innerHTML = ''; return; }

  zone.innerHTML = `
    <h3 class="pronos__subtitle">Les meilleurs pronostiqueurs</h3>
    <ol class="pronos__board-list">
      ${state.board.map((ligne, rang) => `
        <li>
          <span class="pronos__rank">${rang + 1}</span>
          <span class="pronos__pseudo">${esc(ligne.username)}</span>
          <span class="pronos__score">
            <b>${Number(ligne.packs) || 0}</b> packs
            <small>${Number(ligne.exacts) || 0} score${Number(ligne.exacts) > 1 ? 's' : ''} exact${Number(ligne.exacts) > 1 ? 's' : ''} sur ${Number(ligne.total) || 0}</small>
          </span>
        </li>`).join('')}
    </ol>`;
}

function paint() {
  renderAccount();
  renderOpen();
  renderHistory();
  renderBoard();
}

/* ═══════════════════════════════════════════ Actions ══ */

async function submitProno(event) {
  const form = event.target.closest('form.prono');
  if (!form) return;
  event.preventDefault();
  if (state.busy) return;

  const matchId = form.dataset.match;
  const home = $('[name="home"]', form)?.value.trim();
  const away = $('[name="away"]', form)?.value.trim();

  if (home === '' || away === '') {
    setError('Indiquez les deux scores avant de valider.');
    return;
  }

  const match = (champ().matches || []).find((rencontre) => rencontre.id === matchId);
  // Le coup d'envoi a pu passer pendant que la page était ouverte.
  if (match && !isPredictable(match)) {
    setError('Trop tard : les pronostics sont fermés pour ce match.');
    paint();
    return;
  }

  state.busy = true;
  setError('');
  const bouton = $('button[type="submit"]', form);
  if (bouton) bouton.disabled = true;

  try {
    const payload = await api('/api/club/predictions', {
      method: 'POST',
      body: JSON.stringify({ matchId, home: Number(home), away: Number(away) })
    });
    state.predictions.set(matchId, payload.prediction);
    toast('Pronostic enregistré. Bonne chance !');
    paint();
  } catch (error) {
    setError(error.message);
    if (bouton) bouton.disabled = false;
  } finally {
    state.busy = false;
  }
}

/* ═══════════════════════════════════════════ Amorçage ══ */

export function initPronos() {
  const zone = $('#pronos-list');
  if (!zone) return;

  // Délégation : les formulaires sont redessinés à chaque rendu.
  zone.addEventListener('submit', submitProno);
  charger();
}

export function renderPronos(content) {
  state.content = content;
  if ($('#pronos-list')) paint();
}
