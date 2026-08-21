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
  isPredictable, predictableMatches, teamLogo, teamName, teamShort, kickoffTime, nextMatchFor
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
  loaded: false,
  /** Formulaire du héros où l'invitation à se connecter est affichée. */
  invite: ''
};

/* ══════════════════════════════ Pronostic en attente ══ */

/**
 * Un visiteur sans compte peut saisir son pronostic : on le garde sur son
 * appareil, et il part tout seul dès qu'il se connecte. Sans cela, il faudrait
 * lui demander de créer un compte *avant* de savoir de quoi il s'agit — et
 * retaper son score après.
 */
const EN_ATTENTE = 'osa.prono.attente';

function lireAttente() {
  try {
    const brut = window.localStorage?.getItem(EN_ATTENTE);
    const valeur = brut ? JSON.parse(brut) : null;
    return valeur && typeof valeur.matchId === 'string' ? valeur : null;
  } catch {
    return null;
  }
}

function garderAttente(valeur) {
  try {
    if (valeur) window.localStorage?.setItem(EN_ATTENTE, JSON.stringify(valeur));
    else window.localStorage?.removeItem(EN_ATTENTE);
  } catch {
    // Navigation privée, stockage plein : le pronostic ne survivra pas à la
    // connexion, mais la page continue de fonctionner.
  }
}

function attenteDe(matchId) {
  const valeur = lireAttente();
  return valeur && valeur.matchId === matchId ? valeur : null;
}

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

/** Envoie le pronostic mis de côté avant la connexion, s'il tient encore. */
async function envoyerAttente() {
  const attente = lireAttente();
  if (!state.user || !attente) return false;

  const match = (champ().matches || []).find((rencontre) => rencontre.id === attente.matchId);
  if (!match || !isPredictable(match)) {
    garderAttente(null);
    return false;
  }

  try {
    const payload = await api('/api/club/predictions', {
      method: 'POST',
      body: JSON.stringify({ matchId: attente.matchId, home: attente.home, away: attente.away })
    });
    state.predictions.set(attente.matchId, payload.prediction);
    garderAttente(null);
    toast(`Pronostic enregistré : ${attente.home} – ${attente.away}. Bonne chance !`);
    return true;
  } catch {
    garderAttente(null);
    return false;
  }
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
    await envoyerAttente();
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
    : `<span class="pronos__who">Saisissez vos scores : le compte n'est demandé qu'au moment
         d'enregistrer, et vos pronostics vous suivent.</span>
       <a class="btn btn--primary btn--sm" href="/packs?retour=%2Fresultats%23pronos">Créer mon compte</a>`;
}

function predictionState(match) {
  const mise = state.predictions.get(match.id);
  if (!mise) {
    const attente = attenteDe(match.id);
    return attente
      ? `<span class="prono__state prono__state--set">${attente.home} – ${attente.away}, en attente de connexion</span>`
      : '<span class="prono__state">Pas encore de pronostic</span>';
  }
  if (!mise.settled) {
    return `<span class="prono__state prono__state--set">Pronostic enregistré : ${mise.home} – ${mise.away}</span>`;
  }
  return `<span class="prono__state prono__state--won">${esc(OUTCOME_LABELS[mise.outcome] || 'Réglé')} · +${mise.awarded} pack${mise.awarded > 1 ? 's' : ''}</span>`;
}

/* ══════════════════════════════════ Héros ══ */

/** Rappel du barème, affiché tant que rien n'est joué. */
function baremeTexte() {
  return `Score exact : ${state.rewards.exact} packs · bon résultat : ${state.rewards.result} · `
    + `participation : ${state.rewards.played}`;
}

/**
 * Le pronostic du prochain match, directement dans le héros. Les champs sont
 * ouverts à tous : c'est en validant, pas avant, qu'on demande un compte.
 */
function renderHero() {
  const zone = $('#pronos-hero');
  if (!zone) return;

  const match = predictableMatches(champ())
    .find((rencontre) => rencontre.id === nextMatchFor(champ())?.id)
    || predictableMatches(champ())[0];

  zone.hidden = !match;
  if (!match) { zone.innerHTML = ''; return; }

  const mise = state.predictions.get(match.id);
  const attente = attenteDe(match.id);
  const valeurs = mise || attente;
  const invite = state.invite === match.id && !state.user;

  zone.innerHTML = `
    <form class="hero-prono__form" data-match="${esc(match.id)}">
      <p class="hero-prono__title">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4.5 6v6c0 4.4 3.2 8.5 7.5 9.5 4.3-1 7.5-5.1 7.5-9.5V6L12 2zm-1 5h2v6h-2V7zm0 8h2v2h-2v-2z"/></svg>
        ${mise ? 'Ton pronostic' : 'Ton pronostic ?'}
      </p>

      <div class="hero-prono__row">
        <span class="hero-prono__team">${esc(teamShort(champ(), match.homeId))}</span>
        <span class="prono__inputs">
          <label class="sr-only" for="hero-prono-home">Buts de ${esc(teamName(champ(), match.homeId))}</label>
          <input id="hero-prono-home" name="home" type="number" min="0" max="30" step="1"
                 inputmode="numeric" placeholder="0" value="${valeurs ? valeurs.home : ''}">
          <i aria-hidden="true">–</i>
          <label class="sr-only" for="hero-prono-away">Buts de ${esc(teamName(champ(), match.awayId))}</label>
          <input id="hero-prono-away" name="away" type="number" min="0" max="30" step="1"
                 inputmode="numeric" placeholder="0" value="${valeurs ? valeurs.away : ''}">
        </span>
        <span class="hero-prono__team">${esc(teamShort(champ(), match.awayId))}</span>
        <button class="btn btn--primary btn--sm" type="submit">${mise ? 'Modifier' : 'Valider'}</button>
      </div>

      ${invite ? `
        <p class="hero-prono__invite" role="status">
          Créez votre compte pour enregistrer ce pronostic — c'est gratuit, et votre
          score est déjà gardé de côté.
          <a class="btn btn--primary btn--sm" href="/packs?retour=%2F">Créer mon compte</a>
        </p>`
      : `
        <p class="hero-prono__note">
          ${mise
            ? `Enregistré : <b>${mise.home} – ${mise.away}</b>. Modifiable jusqu'au coup d'envoi.`
            : esc(baremeTexte())}
          <a class="hero-prono__more" href="/resultats#pronos">Tous les pronostics</a>
        </p>`}
    </form>`;
}

/* ══════════════════════════════════ Liste ══ */

function pronoFormHTML(match, index) {
  const mise = state.predictions.get(match.id);
  // Un pronostic saisi sans compte reste affiche : il part des la connexion.
  const valeurs = mise || attenteDe(match.id);
  const champId = (cote) => `prono-${esc(match.id)}-${cote}`;

  /*
   * Pas de `data-reveal` ici : l'animation d'apparition est pilotee par app.js,
   * qui observe les blocs presents dans SA page. Ce module dessine les siens
   * apres coup et n'a pas acces a l'observateur — un `data-reveal` resterait
   * donc a opacite zero, et le formulaire serait invisible dans un vrai
   * navigateur (les tests, sans IntersectionObserver, ne le voyaient pas).
   */
  return `
    <form class="prono" data-match="${esc(match.id)}">
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
                 inputmode="numeric" placeholder="0" value="${valeurs ? valeurs.home : ''}">
          <i aria-hidden="true">–</i>
          <label class="sr-only" for="${champId('away')}">Buts de ${esc(teamName(champ(), match.awayId))}</label>
          <input id="${champId('away')}" name="away" type="number" min="0" max="30" step="1"
                 inputmode="numeric" placeholder="0" value="${valeurs ? valeurs.away : ''}">
        </span>

        <span class="prono__team prono__team--away">
          <span class="prono__crest">${crest(match.awayId)}</span>
          <span class="prono__name">${esc(teamName(champ(), match.awayId))}</span>
        </span>
      </div>

      <div class="prono__foot">
        <button class="btn btn--primary btn--sm" type="submit">
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
  renderHero();
  renderAccount();
  renderOpen();
  renderHistory();
  renderBoard();
}

/* ═══════════════════════════════════════════ Actions ══ */

/** Une erreur s'affiche sous le formulaire concerné, pas ailleurs sur la page. */
function signaler(form, message) {
  if (form.closest('#pronos-hero')) {
    const zone = $('.hero-prono__note, .hero-prono__invite', form);
    if (zone) zone.textContent = message;
    return;
  }
  setError(message);
}

async function submitProno(event) {
  const form = event.target.closest('form[data-match]');
  if (!form) return;
  event.preventDefault();
  if (state.busy) return;

  const matchId = form.dataset.match;
  const home = $('[name="home"]', form)?.value.trim();
  const away = $('[name="away"]', form)?.value.trim();

  if (home === '' || away === '') {
    signaler(form, 'Indiquez les deux scores avant de valider.');
    return;
  }

  const match = (champ().matches || []).find((rencontre) => rencontre.id === matchId);
  // Le coup d'envoi a pu passer pendant que la page était ouverte.
  if (match && !isPredictable(match)) {
    signaler(form, 'Trop tard : les pronostics sont fermés pour ce match.');
    paint();
    return;
  }

  // Sans compte, on garde le pronostic sous le coude et on invite à s'inscrire.
  // Demander le compte d'abord, c'est demander avant d'avoir explique pourquoi.
  if (!state.user) {
    garderAttente({ matchId, home: Number(home), away: Number(away) });
    state.invite = matchId;
    paint();
    if (!$('#pronos-hero')) {
      setError('Connectez-vous pour enregistrer votre pronostic — il est gardé de côté.');
    }
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
    state.invite = '';
    garderAttente(null);
    toast('Pronostic enregistré. Bonne chance !');
    paint();
  } catch (error) {
    signaler(form, error.message);
    if (bouton) bouton.disabled = false;
  } finally {
    state.busy = false;
  }
}

/* ═══════════════════════════════════════════ Amorçage ══ */

export function initPronos() {
  // Délégation : les formulaires sont redessinés à chaque rendu.
  const zones = ['#pronos-list', '#pronos-hero'].map((sel) => $(sel)).filter(Boolean);
  if (!zones.length) return;

  zones.forEach((zone) => zone.addEventListener('submit', submitProno));
  charger();
}

export function renderPronos(content) {
  state.content = content;
  if ($('#pronos-list') || $('#pronos-hero')) paint();
}
