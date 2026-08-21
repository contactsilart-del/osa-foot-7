/**
 * OSA FOOT 7 — les paris, côté navigateur.
 *
 * Trois natures, un seul geste : on répond, on valide, et les packs tombent
 * quand la réponse est connue. Le score d'un match se règle tout seul dès qu'il
 * est saisi dans l'administration ; les autres paris attendent que le bureau
 * désigne la bonne réponse.
 *
 * Le navigateur n'arbitre rien. Il envoie une réponse, le serveur la compare à
 * la bonne — sans quoi il suffirait de modifier la page pour gagner. Ce que ce
 * module calcule (qui est ouvert, ce que ça rapporte) n'est qu'un affichage :
 * les mêmes règles tournent côté serveur, dans le même module `bets.js`.
 */

import {
  allBets, answerLabel, betById, betStatus, correctAnswers, deadlineOf, isOpen,
  matchOf, openBets, optionsOf, outcomeLabel, parseScore, scaleOf, scoreAnswer,
  tallyRows
} from './bets.js';
import { competitionName, nextMatchFor, teamLogo, teamName, teamShort } from './league.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const DATE_MATCH = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
});

const state = {
  content: null,
  user: null,
  /** betId → { answer, settled, outcome, awarded } */
  wagers: new Map(),
  board: [],
  /** betId → { réponse: nombre }, seulement pour les paris qu'on a le droit de voir. */
  tallies: {},
  busy: false,
  loaded: false,
  /** Pari du héros où l'invitation à se connecter est affichée. */
  invite: '',
  /** Diapositive affichée dans le carrousel du héros. */
  slide: 0,
  /** Le défilement s'arrête tant que le visiteur s'occupe du bloc. */
  pause: false
};

/** Cadence du carrousel du héros. Assez lent pour lire, assez vif pour vivre. */
const CADENCE = 7000;

/* ══════════════════════════════ Pari en attente ══ */

/**
 * Un visiteur sans compte peut répondre : on garde sa réponse sur son appareil,
 * et elle part toute seule dès qu'il se connecte. Sans cela, il faudrait lui
 * demander de créer un compte *avant* de savoir de quoi il s'agit — et retaper
 * sa réponse après.
 */
const EN_ATTENTE = 'osa.prono.attente';

function lireAttente() {
  try {
    const brut = window.localStorage?.getItem(EN_ATTENTE);
    const valeur = brut ? JSON.parse(brut) : null;
    return valeur && typeof valeur.betId === 'string' ? valeur : null;
  } catch {
    return null;
  }
}

function garderAttente(valeur) {
  try {
    if (valeur) window.localStorage?.setItem(EN_ATTENTE, JSON.stringify(valeur));
    else window.localStorage?.removeItem(EN_ATTENTE);
  } catch {
    // Navigation privée, stockage plein : la réponse ne survivra pas à la
    // connexion, mais la page continue de fonctionner.
  }
}

function attenteDe(betId) {
  const valeur = lireAttente();
  return valeur && valeur.betId === betId ? valeur : null;
}

/** La réponse déjà posée sur un pari : enregistrée, ou en attente de connexion. */
function miseDe(betId) {
  return state.wagers.get(betId) || attenteDe(betId) || null;
}

function contenu() {
  return state.content || {};
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
  state.wagers = new Map(
    (Array.isArray(payload.wagers) ? payload.wagers : []).map((mise) => [mise.betId, mise])
  );
  if (payload.tallies && typeof payload.tallies === 'object') state.tallies = payload.tallies;
  state.loaded = true;
}

/** Envoie la réponse mise de côté avant la connexion, si le pari tient encore. */
async function envoyerAttente() {
  const attente = lireAttente();
  if (!state.user || !attente) return false;

  const pari = betById(contenu(), attente.betId);
  if (!pari || !isOpen(contenu(), pari)) {
    garderAttente(null);
    return false;
  }

  try {
    const payload = await api('/api/club/predictions', {
      method: 'POST',
      body: JSON.stringify({ betId: attente.betId, answer: attente.answer })
    });
    state.wagers.set(attente.betId, payload.wager);
    if (payload.tally) state.tallies = { ...state.tallies, [attente.betId]: payload.tally };
    garderAttente(null);
    toast(`Pari enregistré : ${answerLabel(contenu(), pari, attente.answer)}. Bonne chance !`);
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
      toast(`+${payload.settled.packs} pack${payload.settled.packs > 1 ? 's' : ''} : vos paris sont tombés !`);
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
  const champ = contenu().championship || {};
  const logo = teamLogo(champ, teamId);
  const nom = teamShort(champ, teamId);
  return logo
    ? `<img src="${esc(logo)}" alt="" width="44" height="44" loading="lazy" decoding="async">`
    : `<span class="crest__initial" aria-hidden="true">${esc(nom.charAt(0) || '?')}</span>`;
}

/** « ferme dimanche 13 septembre à 10:00 », ou rien si rien ne ferme. */
function echeanceTexte(pari) {
  const limite = deadlineOf(contenu(), pari);
  if (limite === null) return 'Ouvert jusqu’à nouvel ordre';
  const quand = DATE_MATCH.format(new Date(limite));
  return betStatus(contenu(), pari) === 'open' ? `Ferme ${quand}` : `Fermé le ${quand}`;
}

/** Le barème, en pastilles : ce que chaque palier rapporte. */
function baremeHTML(pari) {
  const paliers = scaleOf(pari);
  if (!paliers.length) return '';
  return `
    <span class="prono__scale">
      ${paliers.map((palier) => `
        <span class="prono__scale-item">
          <b>${palier.packs}</b> ${esc(palier.label.toLowerCase())}
        </span>`).join('')}
    </span>`;
}

/* ────────────────────────────── Répartition ── */

/**
 * Comment les autres ont répondu.
 *
 * Le serveur ne l'envoie qu'une fois qu'on a soi-même répondu, ou que les mises
 * sont closes : voir la répartition avant de choisir, c'est suivre le troupeau
 * plutôt que son idée. Rien à afficher tant que `state.tallies` est muet.
 */
function oddsHTML(pari, classe = 'prono__odds') {
  const decompte = state.tallies[pari.id];
  if (!decompte) return '';

  const mienne = state.wagers.get(pari.id)?.answer || '';
  const { total, rows, top } = tallyRows(contenu(), pari, decompte, mienne);
  if (!total) return '';

  const ligne = (entree) => `
    <li class="odds__row${entree.mine ? ' is-mine' : ''}" style="--share:${entree.share}%">
      <span class="odds__label">${esc(entree.label)}</span>
      <span class="odds__bar" aria-hidden="true"><i></i></span>
      <span class="odds__share">${entree.share}&nbsp;%</span>
    </li>`;

  return `
    <div class="${esc(classe)} odds">
      <p class="odds__head">
        Réponses des parieurs
        <small>${total} mise${total > 1 ? 's' : ''}</small>
      </p>
      <ul class="odds__list">${rows.map(ligne).join('')}</ul>
      ${top.length ? `
        <p class="odds__top">Scores les plus joués&nbsp;:
          ${top.map((entree) => `<b${entree.mine ? ' class="is-mine"' : ''}>${esc(entree.label)}</b> ${entree.share}&nbsp;%`).join(' · ')}
        </p>` : ''}
    </div>`;
}

/* ─────────────────────────── Champs de réponse ── */

/**
 * Les deux scores d'un pari de match. Le libellé des équipes accompagne chaque
 * champ : sans lui, on ne sait plus lequel des deux nombres est pour qui.
 */
function scoreControlsHTML(pari, prefixe) {
  const champ = contenu().championship || {};
  const match = matchOf(contenu(), pari);
  const valeurs = parseScore(miseDe(pari.id)?.answer);
  const domicile = match ? teamName(champ, match.homeId) : 'Domicile';
  const exterieur = match ? teamName(champ, match.awayId) : 'Extérieur';
  const id = (cote) => `${prefixe}-${cote}`;

  return `
    <span class="prono__inputs">
      <label class="sr-only" for="${id('home')}">Buts de ${esc(domicile)}</label>
      <input id="${id('home')}" name="home" type="number" min="0" max="30" step="1"
             inputmode="numeric" placeholder="0" value="${valeurs ? valeurs.home : ''}">
      <i aria-hidden="true">–</i>
      <label class="sr-only" for="${id('away')}">Buts de ${esc(exterieur)}</label>
      <input id="${id('away')}" name="away" type="number" min="0" max="30" step="1"
             inputmode="numeric" placeholder="0" value="${valeurs ? valeurs.away : ''}">
    </span>`;
}

/** Les réponses au choix : des pastilles à cocher, une seule à la fois. */
function choiceControlsHTML(pari, prefixe) {
  const posee = miseDe(pari.id)?.answer || '';
  return `
    <span class="prono__choices" role="radiogroup" aria-label="${esc(pari.question)}">
      ${optionsOf(contenu(), pari).map((option, rang) => `
        <label class="prono__choice">
          <input type="radio" name="answer" value="${esc(option.id)}"
                 id="${prefixe}-o${rang}"${posee === option.id ? ' checked' : ''}>
          <span>${esc(option.label)}</span>
        </label>`).join('')}
    </span>`;
}

function controlsHTML(pari, prefixe) {
  return pari.type === 'score'
    ? scoreControlsHTML(pari, prefixe)
    : choiceControlsHTML(pari, prefixe);
}

/** L'état d'un pari du point de vue du visiteur. */
function etatHTML(pari) {
  const mise = state.wagers.get(pari.id);
  if (!mise) {
    const attente = attenteDe(pari.id);
    return attente
      ? `<span class="prono__state prono__state--set">${esc(answerLabel(contenu(), pari, attente.answer))}, en attente de connexion</span>`
      : '<span class="prono__state">Pas encore de réponse</span>';
  }
  if (!mise.settled) {
    return `<span class="prono__state prono__state--set">Enregistré : ${esc(answerLabel(contenu(), pari, mise.answer))}</span>`;
  }
  return `<span class="prono__state prono__state--won">${esc(outcomeLabel(pari, mise.outcome) || 'Réglé')} · +${mise.awarded} pack${mise.awarded > 1 ? 's' : ''}</span>`;
}

/* ══════════════════════════════════ Héros ══ */

/**
 * Les paris du prochain match, dans l'ordre où on veut les voir.
 *
 * Le score exact d'abord : c'est celui que tout le monde attend, et le seul qui
 * existe sur tous les matchs. Viennent ensuite le 1/N/2, puis les questions que
 * le bureau a inventées. Si aucun pari ne porte sur le prochain match — un mois
 * sans rencontre programmée, par exemple — on montre les autres plutôt que rien.
 */
const RANG_TYPE = { score: 0, result: 1, choice: 2 };

function parisDuHeros() {
  const ouverts = openBets(contenu());
  if (!ouverts.length) return [];

  const prochain = nextMatchFor(contenu().championship || {});
  const duMatch = prochain ? ouverts.filter((pari) => pari.matchId === prochain.id) : [];
  const retenus = duMatch.length ? duMatch : ouverts;

  return [...retenus].sort((a, b) => (RANG_TYPE[a.type] ?? 9) - (RANG_TYPE[b.type] ?? 9));
}

/** Le contenu d'une diapositive : un pari, prêt à recevoir une réponse. */
function heroSlideHTML(pari, rang) {
  const champ = contenu().championship || {};
  const match = matchOf(contenu(), pari);
  const mise = state.wagers.get(pari.id);
  const invite = state.invite === pari.id && !state.user;
  const paliers = scaleOf(pari);
  const prefixe = `hero-prono-${rang}`;

  const rappel = paliers.length
    ? paliers.map((palier) => `${palier.label.toLowerCase()} : ${palier.packs}`).join(' · ')
    : 'Réponse juste, packs à la clé';

  const corps = pari.type === 'score' && match
    ? `
      <div class="hero-prono__row">
        <span class="hero-prono__team">${esc(teamShort(champ, match.homeId))}</span>
        ${controlsHTML(pari, prefixe)}
        <span class="hero-prono__team">${esc(teamShort(champ, match.awayId))}</span>
        <button class="btn btn--primary btn--sm" type="submit">${mise ? 'Modifier' : 'Valider'}</button>
      </div>`
    : `
      <p class="hero-prono__question">${esc(pari.question)}</p>
      <div class="hero-prono__row hero-prono__row--choice">
        ${controlsHTML(pari, prefixe)}
        <button class="btn btn--primary btn--sm" type="submit">${mise ? 'Modifier' : 'Valider'}</button>
      </div>`;

  return `
    <div class="hero-prono__slide" data-slide="${rang}">
      <form class="hero-prono__form" data-bet="${esc(pari.id)}">
        ${corps}
        ${invite ? `
          <p class="hero-prono__invite" role="status">
            Créez votre compte pour enregistrer ce pari — c'est gratuit, et votre
            réponse est déjà gardée de côté.
            <a class="btn btn--primary btn--sm" href="/packs?retour=%2F">Créer mon compte</a>
          </p>`
        : `
          <p class="hero-prono__note">
            ${mise
              ? `Enregistré : <b>${esc(answerLabel(contenu(), pari, mise.answer))}</b>. Modifiable jusqu'à la clôture.`
              : esc(rappel)}
          </p>`}
        ${oddsHTML(pari, 'hero-prono__odds')}
      </form>
    </div>`;
}

/**
 * Le carrousel du héros.
 *
 * Il défile tout seul, mais s'arrête dès que le visiteur s'en approche : rien
 * n'est plus agaçant qu'un formulaire qui glisse pendant qu'on le remplit.
 * `positionHero` déplace la piste sans redessiner, pour ne pas voler le focus.
 */
function renderHero() {
  const zone = $('#pronos-hero');
  if (!zone) return;

  const paris = parisDuHeros();
  zone.hidden = !paris.length;
  if (!paris.length) { zone.innerHTML = ''; return; }

  if (state.slide >= paris.length) state.slide = 0;

  zone.innerHTML = `
    <p class="hero-prono__title">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4.5 6v6c0 4.4 3.2 8.5 7.5 9.5 4.3-1 7.5-5.1 7.5-9.5V6L12 2zm-1 5h2v6h-2V7zm0 8h2v2h-2v-2z"/></svg>
      ${paris.length > 1 ? 'Les paris du match' : 'Ton pari ?'}
    </p>

    <div class="hero-prono__viewport">
      <div class="hero-prono__track">
        ${paris.map(heroSlideHTML).join('')}
      </div>
    </div>

    <div class="hero-prono__foot">
      ${paris.length > 1 ? `
        <span class="hero-prono__dots" role="tablist" aria-label="Paris du match">
          ${paris.map((pari, rang) => `
            <button class="hero-prono__dot" type="button" role="tab"
                    data-slide-to="${rang}" aria-label="${esc(pari.question)}"></button>`).join('')}
        </span>` : ''}
      <a class="btn btn--ghost btn--sm hero-prono__more" href="/pronostics">Voir tous les paris
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 5l7 7-7 7v-4H4v-6h9V5z"/></svg>
      </a>
    </div>`;

  positionHero();
}

/** Applique la position courante : piste, pastilles, et accessibilité. */
function positionHero() {
  const zone = $('#pronos-hero');
  const piste = $('.hero-prono__track', zone || document);
  if (!zone || !piste) return;

  const diapos = $$('.hero-prono__slide', zone);
  if (!diapos.length) return;
  const actif = Math.min(Math.max(state.slide, 0), diapos.length - 1);
  state.slide = actif;

  piste.style.transform = `translateX(-${actif * 100}%)`;

  diapos.forEach((diapo, rang) => {
    const visible = rang === actif;
    /*
     * `inert` retire d'un coup les champs cachés du parcours au clavier et des
     * lecteurs d'écran. Sans lui, une tabulation emmènerait le visiteur dans un
     * formulaire invisible, hors de l'écran.
     */
    diapo.classList.toggle('is-active', visible);
    if (visible) diapo.removeAttribute('inert');
    else diapo.setAttribute('inert', '');
    diapo.setAttribute('aria-hidden', visible ? 'false' : 'true');
  });

  $$('.hero-prono__dot', zone).forEach((point, rang) => {
    point.classList.toggle('is-active', rang === actif);
    point.setAttribute('aria-selected', rang === actif ? 'true' : 'false');
  });
}

/** Fait tourner le carrousel, sauf si le visiteur s'en occupe. */
function avancerHeros() {
  const zone = $('#pronos-hero');
  if (!zone || zone.hidden || state.pause) return;
  const diapos = $$('.hero-prono__slide', zone).length;
  if (diapos < 2) return;
  state.slide = (state.slide + 1) % diapos;
  positionHero();
}

/* ══════════════════════════════════ Liste ══ */

/** Le chapeau d'un pari : sa compétition, sa journée, son échéance. */
function metaHTML(pari) {
  const champ = contenu().championship || {};
  const match = matchOf(contenu(), pari);
  const competition = match ? competitionName(champ, match.competitionId) : '';
  return `
    <p class="prono__meta">
      ${match?.day ? `<span class="chip">${match.day}${match.day === 1 ? 're' : 'e'} journée</span>` : ''}
      ${competition ? `<span class="chip chip--soft">${esc(competition)}</span>` : ''}
      <span class="prono__when">${esc(echeanceTexte(pari))}</span>
    </p>`;
}

/*
 * Pas de `data-reveal` sur ces formulaires : l'animation d'apparition est
 * pilotée par app.js, qui observe les blocs présents dans SA page. Ce module
 * dessine les siens après coup et n'a pas accès à l'observateur — un
 * `data-reveal` resterait donc à opacité zéro, et le formulaire serait invisible
 * dans un vrai navigateur (les tests, sans IntersectionObserver, ne le voyaient
 * pas passer).
 */
function pariHTML(pari) {
  const champ = contenu().championship || {};
  const match = matchOf(contenu(), pari);
  const mise = state.wagers.get(pari.id);
  const prefixe = `prono-${pari.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

  const corps = pari.type === 'score' && match
    ? `
      <div class="prono__row">
        <span class="prono__team">
          <span class="prono__crest">${crest(match.homeId)}</span>
          <span class="prono__name">${esc(teamName(champ, match.homeId))}</span>
        </span>
        ${controlsHTML(pari, prefixe)}
        <span class="prono__team prono__team--away">
          <span class="prono__crest">${crest(match.awayId)}</span>
          <span class="prono__name">${esc(teamName(champ, match.awayId))}</span>
        </span>
      </div>`
    : `<div class="prono__row prono__row--choice">${controlsHTML(pari, prefixe)}</div>`;

  const titre = pari.type === 'score' && match ? '' : `<p class="prono__question">${esc(pari.question)}</p>`;

  return `
    <form class="prono prono--${esc(pari.type)}" data-bet="${esc(pari.id)}">
      ${metaHTML(pari)}
      ${titre}
      ${pari.note ? `<p class="prono__note">${esc(pari.note)}</p>` : ''}
      ${corps}
      <div class="prono__foot">
        <button class="btn btn--primary btn--sm" type="submit">${mise ? 'Modifier' : 'Valider'}</button>
        ${etatHTML(pari)}
        ${baremeHTML(pari)}
      </div>
      ${oddsHTML(pari)}
    </form>`;
}

function renderOpen() {
  const zone = $('#pronos-list');
  if (!zone) return;

  const ouverts = openBets(contenu());
  zone.innerHTML = ouverts.length
    ? ouverts.map(pariHTML).join('')
    : `<p class="empty">Aucun pari ouvert pour l'instant. Revenez quand la prochaine rencontre
       sera programmée, ou quand le bureau aura lancé un nouveau pari.</p>`;

  const compte = $('#pronos-count');
  if (compte) {
    compte.hidden = !ouverts.length;
    compte.textContent = `${ouverts.length} pari${ouverts.length > 1 ? 's' : ''} ouvert${ouverts.length > 1 ? 's' : ''}`;
  }
}

/** Les paris dont les mises sont closes, mais dont on attend encore la réponse. */
function renderLocked() {
  const zone = $('#pronos-locked');
  if (!zone) return;

  const bloc = zone.closest('[data-pronos-locked]') || zone;
  const attente = allBets(contenu())
    .filter((pari) => betStatus(contenu(), pari) === 'locked')
    // Un pari sans mise de notre part n'a rien à faire dans « en attente » : la
    // page se remplirait de rencontres qui ne nous concernent pas.
    .filter((pari) => miseDe(pari.id));

  bloc.hidden = !attente.length;
  if (!attente.length) { zone.innerHTML = ''; return; }

  zone.innerHTML = `
    <h2 class="pronos__subtitle">En attente du résultat</h2>
    <ul class="pronos__log">
      ${attente.map((pari) => `
        <li class="pronos__log-item">
          <span class="pronos__log-match">${esc(pari.question)}</span>
          <span class="pronos__log-guess">votre réponse : ${esc(answerLabel(contenu(), pari, miseDe(pari.id).answer))}</span>
          <span class="pronos__log-gain">à venir</span>
        </li>`).join('')}
    </ul>`;
}

function renderHistory() {
  const zone = $('#pronos-history');
  if (!zone) return;

  const regles = [...state.wagers.values()].filter((mise) => mise.settled);
  const bloc = zone.closest('[data-pronos-history]') || zone;
  bloc.hidden = !regles.length;
  if (!regles.length) { zone.innerHTML = ''; return; }

  zone.innerHTML = `
    <h2 class="pronos__subtitle">Vos paris réglés</h2>
    <ul class="pronos__log">
      ${regles.map((mise) => {
        const pari = betById(contenu(), mise.betId);
        if (!pari) {
          return `
            <li class="pronos__log-item">
              <span class="pronos__log-match">Pari retiré du site</span>
              <span class="pronos__log-guess">votre réponse : ${esc(mise.answer)}</span>
              <span class="pronos__log-gain">+${mise.awarded}</span>
            </li>`;
        }
        const bonnes = correctAnswers(contenu(), pari)
          .map((reponse) => answerLabel(contenu(), pari, reponse)).join(' ou ');
        return `
          <li class="pronos__log-item pronos__log-item--${esc(mise.outcome || 'played')}">
            <span class="pronos__log-match">${esc(pari.question)}${bonnes ? ` — ${esc(bonnes)}` : ''}</span>
            <span class="pronos__log-guess">votre réponse : ${esc(answerLabel(contenu(), pari, mise.answer))}</span>
            <span class="pronos__log-gain">${esc(outcomeLabel(pari, mise.outcome) || '—')} · +${mise.awarded}</span>
          </li>`;
      }).join('')}
    </ul>`;
}

function renderAccount() {
  const zone = $('#pronos-account');
  if (!zone) return;

  if (!state.loaded) { zone.innerHTML = ''; return; }

  zone.innerHTML = state.user
    ? `<span class="pronos__who">Vous pariez en tant que <b>${esc(state.user.username)}</b></span>
       <span class="pronos__stock">${state.user.packs} pack${state.user.packs > 1 ? 's' : ''} en réserve</span>`
    : `<span class="pronos__who">Répondez d'abord : le compte n'est demandé qu'au moment
         d'enregistrer, et vos réponses vous suivent.</span>
       <a class="btn btn--primary btn--sm" href="/packs?retour=%2Fpronostics">Créer mon compte</a>`;
}

function renderBoard() {
  const zone = $('#pronos-board');
  if (!zone) return;

  const bloc = zone.closest('[data-pronos-board]') || zone;
  bloc.hidden = !state.board.length;
  if (!state.board.length) { zone.innerHTML = ''; return; }

  zone.innerHTML = `
    <h2 class="pronos__subtitle">Les meilleurs parieurs</h2>
    <ol class="pronos__board-list">
      ${state.board.map((ligne, rang) => `
        <li>
          <span class="pronos__rank">${rang + 1}</span>
          <span class="pronos__pseudo">${esc(ligne.username)}</span>
          <span class="pronos__score">
            <b>${Number(ligne.packs) || 0}</b> packs
            <small>${Number(ligne.exacts) || 0} bonne${Number(ligne.exacts) > 1 ? 's' : ''} réponse${Number(ligne.exacts) > 1 ? 's' : ''} sur ${Number(ligne.total) || 0}</small>
          </span>
        </li>`).join('')}
    </ol>`;
}

/** Le mot d'introduction saisi dans l'administration, s'il y en a un. */
function renderIntro() {
  const zone = $('#pronos-intro');
  if (!zone) return;
  const texte = String(contenu().bets?.intro || '').trim();
  zone.hidden = !texte;
  zone.textContent = texte;
}

function paint() {
  renderIntro();
  renderHero();
  renderAccount();
  renderOpen();
  renderLocked();
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

/** Ce que le formulaire propose, sous la forme attendue par le serveur. */
function reponseDe(form, pari) {
  if (pari.type === 'score') {
    const home = $('[name="home"]', form)?.value.trim();
    const away = $('[name="away"]', form)?.value.trim();
    if (home === '' || away === '') return null;
    return scoreAnswer(Number(home), Number(away));
  }
  return $$('[name="answer"]', form).find((champ) => champ.checked)?.value || null;
}

async function submitPari(event) {
  const form = event.target.closest('form[data-bet]');
  if (!form) return;
  event.preventDefault();
  if (state.busy) return;

  const betId = form.dataset.bet;
  const pari = betById(contenu(), betId);
  if (!pari) { signaler(form, "Ce pari n'existe plus."); return; }

  // La clôture a pu tomber pendant que la page était ouverte.
  if (!isOpen(contenu(), pari)) {
    signaler(form, 'Trop tard : les mises sont fermées sur ce pari.');
    paint();
    return;
  }

  const answer = reponseDe(form, pari);
  if (!answer) {
    signaler(form, pari.type === 'score'
      ? 'Indiquez les deux scores avant de valider.'
      : 'Choisissez une réponse avant de valider.');
    return;
  }

  // Sans compte, on garde la réponse sous le coude et on invite à s'inscrire.
  // Demander le compte d'abord, c'est demander avant d'avoir expliqué pourquoi.
  if (!state.user) {
    garderAttente({ betId, answer });
    state.invite = betId;
    paint();
    if (!$('#pronos-hero')) {
      setError('Connectez-vous pour enregistrer votre pari — il est gardé de côté.');
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
      body: JSON.stringify({ betId, answer })
    });
    state.wagers.set(betId, payload.wager);
    // Le pari vient d'être posé : la répartition devient visible pour ce pari-là.
    if (payload.tally) state.tallies = { ...state.tallies, [betId]: payload.tally };
    state.invite = '';
    garderAttente(null);
    toast('Pari enregistré. Bonne chance !');
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

  zones.forEach((zone) => zone.addEventListener('submit', submitPari));

  const heros = $('#pronos-hero');
  if (heros) {
    heros.addEventListener('click', (event) => {
      const point = event.target.closest('[data-slide-to]');
      if (!point) return;
      state.slide = Number(point.dataset.slideTo) || 0;
      positionHero();
    });

    /*
     * Le défilement s'interrompt dès qu'on survole le bloc ou qu'on y pose le
     * curseur de saisie, et ne reprend qu'une fois qu'on l'a quitté. Un
     * formulaire qui glisse pendant qu'on le remplit est une mauvaise farce.
     */
    const suspendre = () => { state.pause = true; };
    const reprendre = () => { state.pause = false; };
    heros.addEventListener('mouseenter', suspendre);
    heros.addEventListener('mouseleave', reprendre);
    heros.addEventListener('focusin', suspendre);
    heros.addEventListener('focusout', reprendre);

    // Le mouvement automatique n'est pas imposé à qui l'a désactivé.
    const sobre = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!sobre?.matches) setInterval(avancerHeros, CADENCE);
  }

  charger();
}

export function renderPronos(content) {
  state.content = content;
  if ($('#pronos-list') || $('#pronos-hero')) paint();
}
