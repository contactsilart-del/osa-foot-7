/**
 * OSA FOOT 7 — composition d'équipe.
 *
 * Football à 7 : 7 titulaires, 4 remplaçants, 1 coach. Trois dispositifs, une
 * note moyenne calculée sur les titulaires, et une compo partageable par lien.
 *
 * La compo vit dans l'URL (`/compo#f=1-2-3-1&t=…`) : copier le lien suffit à
 * l'envoyer, et le retour sur la page la retrouve telle quelle. Le stockage
 * local ne sert que de filet quand l'URL est nue.
 */

import { POSITIONS, overallOf, fullName, ratingColor } from './squad.js';

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ═════════════════════════════════════════ Dispositifs ══ */

/**
 * Les emplacements sont en pourcentage du terrain, notre but en bas (y = 100).
 * `role` est le poste attendu : il n'interdit rien, il ne fait que proposer les
 * bons joueurs en premier.
 */
function ligne(role, y, nombre) {
  // Réparties régulièrement, avec la même marge de chaque côté.
  const pas = 100 / (nombre + 1);
  return Array.from({ length: nombre }, (_, i) => ({ role, x: Math.round(pas * (i + 1)), y }));
}

function dispositif(label, lignes) {
  const slots = [{ role: 'GB', x: 50, y: 88 }, ...lignes.flat()]
    .map((slot, index) => ({ ...slot, key: 't' + index }));
  return { label, slots };
}

export const FORMATIONS = {
  '1-2-3-1': dispositif('1-2-3-1', [ligne('DEF', 68, 2), ligne('MIL', 45, 3), ligne('ATT', 20, 1)]),
  '1-3-2-1': dispositif('1-3-2-1', [ligne('DEF', 68, 3), ligne('MIL', 45, 2), ligne('ATT', 20, 1)]),
  '1-3-3':   dispositif('1-3-3',   [ligne('DEF', 70, 3), ligne('ATT', 32, 3)])
};

export const DEFAULT_FORMATION = '1-2-3-1';
export const BENCH_SIZE = 4;

/** Le dispositif demandé, ou celui par défaut si le nom est inconnu. */
export function formationOf(name) {
  return FORMATIONS[name] ? name : DEFAULT_FORMATION;
}

/* ═══════════════════════════════════════════ Compo ══ */

/** Une compo vide pour le dispositif demandé. */
export function emptyLineup(formation = DEFAULT_FORMATION) {
  return {
    formation: formationOf(formation),
    starters: Array(FORMATIONS[formationOf(formation)].slots.length).fill(''),
    bench: Array(BENCH_SIZE).fill(''),
    coach: ''
  };
}

/** Tous les identifiants employés, titulaires et remplaçants confondus. */
export function usedIds(lineup) {
  return new Set([...lineup.starters, ...lineup.bench, lineup.coach].filter(Boolean));
}

/**
 * Note moyenne de l'équipe : moyenne des notes générales des titulaires en
 * place. Une compo incomplète donne donc la moyenne de ce qui est déjà posé,
 * pas une note diluée par des trous.
 */
export function teamAverage(lineup, players) {
  const notes = lineup.starters
    .map((id) => players.find((player) => player.id === id))
    .filter(Boolean)
    .map((player) => overallOf(player));
  if (!notes.length) return { average: 0, count: 0 };
  return {
    average: Math.round(notes.reduce((sum, n) => sum + n, 0) / notes.length),
    count: notes.length
  };
}

/**
 * Change de dispositif en gardant les joueurs déjà posés. Les emplacements se
 * correspondent poste par poste : un défenseur reste défenseur, et seuls les
 * joueurs sans place équivalente partent sur le banc.
 */
export function changeFormation(lineup, players, next) {
  const cible = formationOf(next);
  if (cible === lineup.formation) return lineup;

  const ancien = FORMATIONS[lineup.formation].slots;
  const nouveau = FORMATIONS[cible].slots;
  const restants = lineup.starters
    .map((id, index) => ({ id, role: ancien[index].role }))
    .filter((place) => place.id);

  const starters = nouveau.map((slot) => {
    const trouve = restants.findIndex((place) => place.role === slot.role);
    if (trouve === -1) return '';
    return restants.splice(trouve, 1)[0].id;
  });

  // Les joueurs sans emplacement équivalent glissent sur les places libres du
  // banc plutôt que de disparaître sans prévenir.
  const bench = [...lineup.bench];
  for (const place of restants) {
    const libre = bench.indexOf('');
    if (libre !== -1) bench[libre] = place.id;
  }

  return { ...lineup, formation: cible, starters, bench };
}

/** Place un joueur, en le retirant d'abord de l'endroit où il se trouvait. */
export function assign(lineup, target, playerId) {
  const next = {
    ...lineup,
    starters: [...lineup.starters],
    bench: [...lineup.bench]
  };

  if (playerId) {
    const i = next.starters.indexOf(playerId);
    if (i !== -1) next.starters[i] = '';
    const j = next.bench.indexOf(playerId);
    if (j !== -1) next.bench[j] = '';
    if (next.coach === playerId) next.coach = '';
  }

  if (target.zone === 'starter') next.starters[target.index] = playerId;
  else if (target.zone === 'bench') next.bench[target.index] = playerId;
  else if (target.zone === 'coach') next.coach = playerId;

  return next;
}

/**
 * Remplit la compo toute seule : le meilleur disponible à chaque poste, puis le
 * banc, puis le coach. Ce qui est déjà posé n'est jamais délogé.
 */
export function autoFill(lineup, players) {
  const next = { ...lineup, starters: [...lineup.starters], bench: [...lineup.bench] };
  const pris = usedIds(next);
  const dispo = players
    .filter((player) => !pris.has(player.id))
    .sort((a, b) => overallOf(b) - overallOf(a));

  const prendre = (predicat) => {
    const index = dispo.findIndex(predicat);
    return index === -1 ? null : dispo.splice(index, 1)[0].id;
  };

  const slots = FORMATIONS[next.formation].slots;
  // Les gardiens d'abord : ils ne sont pas interchangeables avec le reste.
  const ordre = slots
    .map((slot, index) => ({ slot, index }))
    .sort((a, b) => (a.slot.role === 'GB' ? -1 : 0) - (b.slot.role === 'GB' ? -1 : 0));

  for (const { slot, index } of ordre) {
    if (next.starters[index]) continue;
    const joueur = prendre((p) => p.position === slot.role)
      // À défaut, n'importe quel joueur de champ : mieux vaut un poste
      // approximatif qu'un trou dans l'équipe. Jamais un gardien ni le staff.
      || (slot.role === 'GB' ? null : prendre((p) => p.position !== 'GB' && p.position !== 'COACH'));
    if (joueur) next.starters[index] = joueur;
  }

  for (let i = 0; i < next.bench.length; i += 1) {
    if (next.bench[i]) continue;
    const joueur = prendre((p) => p.position !== 'COACH');
    if (joueur) next.bench[i] = joueur;
  }

  if (!next.coach) {
    const coach = prendre((p) => p.position === 'COACH');
    if (coach) next.coach = coach;
  }

  return next;
}

/* ═══════════════════════════════════ Lien partageable ══ */

/** Compo → fragment d'URL. */
export function encodeLineup(lineup) {
  return `f=${lineup.formation}&t=${lineup.starters.join(',')}`
       + `&b=${lineup.bench.join(',')}&c=${lineup.coach || ''}`;
}

/**
 * Fragment d'URL → compo. Tout ce qui ne correspond pas à un joueur connu est
 * ignoré : un lien vieilli ne casse pas la page, il arrive juste incomplet.
 */
export function decodeLineup(hash, players) {
  const brut = String(hash || '').replace(/^#/, '');
  const params = new Map(brut.split('&').filter(Boolean).map((paire) => {
    const [cle, ...reste] = paire.split('=');
    return [cle, decodeURIComponent(reste.join('='))];
  }));

  const lineup = emptyLineup(params.get('f'));
  const connus = new Set(players.map((player) => player.id));
  const propre = (valeur) => (connus.has(valeur) ? valeur : '');

  const titulaires = (params.get('t') || '').split(',');
  lineup.starters = lineup.starters.map((_, i) => propre(titulaires[i]));

  const banc = (params.get('b') || '').split(',');
  lineup.bench = lineup.bench.map((_, i) => propre(banc[i]));

  lineup.coach = propre(params.get('c'));

  // Un même joueur ne peut pas occuper deux places : le premier gagne.
  const vus = new Set();
  const dedoublonner = (id) => {
    if (!id || vus.has(id)) return '';
    vus.add(id);
    return id;
  };
  lineup.starters = lineup.starters.map(dedoublonner);
  lineup.bench = lineup.bench.map(dedoublonner);
  lineup.coach = dedoublonner(lineup.coach);

  return lineup;
}

/** Vrai si la compo ne contient rien du tout. */
export function isEmpty(lineup) {
  return usedIds(lineup).size === 0;
}

/* ═══════════════════════════════════════════ Rendu ══ */

const STORAGE_KEY = 'osa-compo';

const state = {
  content: null,
  lineup: emptyLineup(),
  /**
   * Dernier fragment connu, sous sa forme textuelle. Le site rend d'abord le
   * contenu par défaut, puis celui de l'API : sans cette source conservée, une
   * compo reçue par lien serait vidée au premier rendu, faute de reconnaître
   * des joueurs pas encore chargés.
   */
  source: '',
  /** Emplacement en cours de remplissage, ou `null` quand rien n'est en attente. */
  target: null,
  search: ''
};

function players() {
  return Array.isArray(state.content?.squad?.players) ? state.content.squad.players : [];
}

function playerById(id) {
  return players().find((player) => player.id === id) || null;
}

function avatar(player, taille = 'md') {
  if (!player) return '';
  const initiales = fullName(player).split(/\s+/).slice(0, 2)
    .map((mot) => mot.charAt(0).toUpperCase()).join('');
  return player.photo
    ? `<img src="${esc(player.photo)}" alt="" loading="lazy" decoding="async" width="120" height="120">`
    : `<span class="compo-avatar__initials compo-avatar__initials--${taille}" aria-hidden="true">${esc(initiales)}</span>`;
}

/** Une case de terrain ou de banc. */
function slotHTML(zone, index, player, role, libelle) {
  const occupe = Boolean(player);
  const note = occupe ? overallOf(player) : 0;
  const accent = (POSITIONS[role] || POSITIONS.MIL).accent;

  return `
    <div class="compo-slot${occupe ? ' is-filled' : ''}" style="--slot-accent:${accent}">
      <button class="compo-slot__btn" type="button"
              data-slot="${zone}" data-index="${index}"
              aria-label="${occupe ? `${esc(fullName(player))} — remplacer` : `Emplacement libre : ${esc(libelle)}`}">
        <span class="compo-avatar compo-avatar--slot">${occupe ? avatar(player) : `
          <span class="compo-slot__plus" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z"/></svg>
          </span>`}</span>
        <span class="compo-slot__label">${occupe ? esc(fullName(player)) : esc(libelle)}</span>
        ${occupe
          ? `<span class="compo-slot__note" style="--note-color:${ratingColor(note)}">${note}</span>`
          : ''}
      </button>
      ${occupe ? `
        <button class="compo-slot__remove" type="button" data-remove="${zone}" data-index="${index}"
                aria-label="Retirer ${esc(fullName(player))}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"/></svg>
        </button>` : ''}
    </div>`;
}

function renderPitch() {
  const pitch = $('#compo-pitch');
  if (!pitch) return;

  const slots = FORMATIONS[state.lineup.formation].slots;
  pitch.innerHTML = slots.map((slot, index) => `
    <div class="compo-pitch__spot" style="left:${slot.x}%; top:${slot.y}%">
      ${slotHTML('starter', index, playerById(state.lineup.starters[index]), slot.role,
                 (POSITIONS[slot.role] || POSITIONS.MIL).label)}
    </div>`).join('');
}

function renderBench() {
  const bench = $('#compo-bench');
  if (!bench) return;

  bench.innerHTML = `
    <div class="compo-bench__group">
      <h3 class="compo-bench__title">Remplaçants <span>${state.lineup.bench.filter(Boolean).length}/${BENCH_SIZE}</span></h3>
      <div class="compo-bench__row">
        ${state.lineup.bench.map((id, index) =>
          slotHTML('bench', index, playerById(id), 'MIL', 'Remplaçant')).join('')}
      </div>
    </div>
    <div class="compo-bench__group compo-bench__group--coach">
      <h3 class="compo-bench__title">Coach</h3>
      <div class="compo-bench__row">
        ${slotHTML('coach', 0, playerById(state.lineup.coach), 'COACH', 'Coach')}
      </div>
    </div>`;
}

function renderSummary() {
  const { average, count } = teamAverage(state.lineup, players());
  const total = FORMATIONS[state.lineup.formation].slots.length;

  const note = $('#compo-average');
  if (note) {
    note.textContent = count ? String(average) : '—';
    note.style.setProperty('--note-color', count ? ratingColor(average) : 'var(--dark-muted)');
  }

  const detail = $('#compo-average-note');
  if (detail) {
    detail.textContent = count === total
      ? `moyenne des ${total} titulaires`
      : count
        ? `moyenne sur ${count} titulaire${count > 1 ? 's' : ''} — il en manque ${total - count}`
        : 'aucun titulaire placé';
  }

  const compte = $('#compo-filled');
  if (compte) compte.textContent = `${count}/${total}`;
}

/** Le panneau de choix : disponibles d'abord, au poste attendu en tête. */
function renderPicker() {
  const liste = $('#compo-list');
  if (!liste) return;

  const pris = usedIds(state.lineup);
  const recherche = state.search.trim().toLowerCase();
  const role = state.target?.role || '';

  const dispo = players()
    .filter((player) => !pris.has(player.id))
    .filter((player) => !recherche || fullName(player).toLowerCase().includes(recherche))
    // Un coach ne joue pas, et seul le poste de coach l'accepte.
    .filter((player) => (state.target?.zone === 'coach'
      ? player.position === 'COACH'
      : player.position !== 'COACH'))
    .sort((a, b) => {
      if (role) {
        const ra = a.position === role ? 0 : 1;
        const rb = b.position === role ? 0 : 1;
        if (ra !== rb) return ra - rb;
      }
      return overallOf(b) - overallOf(a);
    });

  const titre = $('#compo-picker-title');
  if (titre) {
    titre.textContent = state.target
      ? (state.target.zone === 'coach' ? 'Choisir un coach'
        : state.target.zone === 'bench' ? 'Choisir un remplaçant'
        : `Choisir un ${(POSITIONS[role] || POSITIONS.MIL).label.toLowerCase()}`)
      : 'Joueurs disponibles';
  }

  const aide = $('#compo-picker-hint');
  if (aide) {
    aide.textContent = state.target
      ? 'Cliquez sur un joueur pour le placer.'
      : 'Cliquez sur un emplacement du terrain, puis sur un joueur.';
  }

  liste.innerHTML = dispo.length
    ? dispo.map((player) => {
      const note = overallOf(player);
      const poste = POSITIONS[player.position] || POSITIONS.MIL;
      const conseille = role && player.position === role;
      return `
        <li>
          <button class="compo-pick${conseille ? ' is-suggested' : ''}" type="button"
                  data-pick="${esc(player.id)}" style="--slot-accent:${poste.accent}">
            <span class="compo-avatar compo-avatar--pick">${avatar(player, 'sm')}</span>
            <span class="compo-pick__body">
              <span class="compo-pick__name">${esc(fullName(player))}</span>
              <span class="compo-pick__pos">${esc(poste.label)}${conseille ? ' · au poste' : ''}</span>
            </span>
            <span class="compo-pick__note" style="--note-color:${ratingColor(note)}">${note}</span>
          </button>
        </li>`;
    }).join('')
    : `<li class="compo-empty">${recherche
        ? 'Aucun joueur ne correspond à cette recherche.'
        : state.target?.zone === 'coach'
          ? "Aucun coach dans l'effectif. Ajoutez-en un depuis l'administration."
          : 'Tous les joueurs sont déjà placés.'}</li>`;

  const panneau = $('#compo-picker');
  if (panneau) panneau.classList.toggle('is-active', Boolean(state.target));
}

function markActiveSlot() {
  $$('.compo-slot').forEach((slot) => slot.classList.remove('is-target'));
  if (!state.target) return;
  const bouton = $(`[data-slot="${state.target.zone}"][data-index="${state.target.index}"]`);
  bouton?.closest('.compo-slot')?.classList.add('is-target');
}

function draw() {
  renderPitch();
  renderBench();
  renderSummary();
  renderPicker();
  markActiveSlot();
}

/* ══════════════════════════════════════ Persistance ══ */

function save() {
  const fragment = encodeLineup(state.lineup);
  state.source = fragment;
  try {
    if (isEmpty(state.lineup)) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, fragment);
  } catch { /* navigation privée : tant pis, l'URL suffit */ }

  try {
    window.history.replaceState(null, '', '#' + fragment);
  } catch { /* pas d'historique dans certains contextes de test */ }
}

function restore() {
  const depuisUrl = String(window.location?.hash || '').replace(/^#/, '');
  if (depuisUrl.includes('f=') || depuisUrl.includes('t=')) {
    state.source = depuisUrl;
    state.lineup = decodeLineup(depuisUrl, players());
    return;
  }
  let stocke = '';
  try { stocke = window.localStorage.getItem(STORAGE_KEY) || ''; } catch { stocke = ''; }
  state.source = stocke;
  state.lineup = stocke ? decodeLineup(stocke, players()) : emptyLineup();
}

/* ════════════════════════════════════════ Câblage ══ */

function setLineup(lineup) {
  state.lineup = lineup;
  save();
  draw();
}

function toast(message) {
  const boite = $('#toast');
  if (!boite) return;
  boite.textContent = message;
  boite.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { boite.hidden = true; }, 2600);
}

export function initCompo() {
  const pitch = $('#compo-pitch');
  if (!pitch) return;

  // Un module ES n'est évalué qu'une fois : l'état est remis à neuf ici, à
  // chaque chargement de page, plutôt que laissé à l'initialisation du module.
  state.content = null;
  state.lineup = emptyLineup();
  state.source = '';
  state.target = null;
  state.search = '';

  const select = $('#compo-formation');
  if (select) {
    select.innerHTML = Object.entries(FORMATIONS)
      .map(([key, f]) => `<option value="${key}">${esc(f.label)}</option>`).join('');
    select.addEventListener('change', () => {
      setLineup(changeFormation(state.lineup, players(), select.value));
      toast(`Dispositif ${select.value}`);
    });
  }

  // Choix d'un emplacement, retrait d'un joueur.
  $('#compo-board')?.addEventListener('click', (event) => {
    const retrait = event.target.closest('[data-remove]');
    if (retrait) {
      setLineup(assign(state.lineup, {
        zone: retrait.dataset.remove, index: Number(retrait.dataset.index)
      }, ''));
      return;
    }

    const bouton = event.target.closest('[data-slot]');
    if (!bouton) return;
    const zone = bouton.dataset.slot;
    const index = Number(bouton.dataset.index);
    const meme = state.target?.zone === zone && state.target?.index === index;
    state.target = meme ? null : {
      zone,
      index,
      role: zone === 'starter' ? FORMATIONS[state.lineup.formation].slots[index].role
        : zone === 'coach' ? 'COACH' : ''
    };
    draw();
    if (state.target) $('#compo-picker')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  // Choix d'un joueur.
  $('#compo-list')?.addEventListener('click', (event) => {
    const bouton = event.target.closest('[data-pick]');
    if (!bouton) return;
    if (!state.target) {
      toast("Choisissez d'abord un emplacement");
      return;
    }
    const cible = state.target;
    // On enchaîne : le prochain emplacement libre s'ouvre tout seul.
    setLineup(assign(state.lineup, cible, bouton.dataset.pick));
    state.target = nextFreeSlot(cible);
    draw();
  });

  $('#compo-search')?.addEventListener('input', (event) => {
    state.search = event.target.value;
    renderPicker();
  });

  $('#compo-auto')?.addEventListener('click', () => {
    setLineup(autoFill(state.lineup, players()));
    toast('Équipe complétée automatiquement');
  });

  $('#compo-clear')?.addEventListener('click', () => {
    state.target = null;
    setLineup(emptyLineup(state.lineup.formation));
    toast('Compo vidée');
  });

  $('#compo-share')?.addEventListener('click', async () => {
    const lien = `${window.location?.origin || ''}/compo#${encodeLineup(state.lineup)}`;
    const presse = window.navigator?.clipboard;
    try {
      if (!presse?.writeText) throw new Error('presse-papiers indisponible');
      await presse.writeText(lien);
      toast('Lien copié !');
    } catch {
      // Sans presse-papiers (connexion non sécurisée, permission refusée), on
      // montre le lien : il reste sélectionnable à la main.
      if (typeof window.prompt === 'function') window.prompt('Copiez ce lien :', lien);
      else toast(lien);
    }
  });

  window.addEventListener('hashchange', () => {
    const fragment = String(window.location.hash || '');
    if (fragment.includes('f=') || fragment.includes('t=')) {
      state.source = fragment.replace(/^#/, '');
      state.lineup = decodeLineup(state.source, players());
      draw();
    }
  });
}

/**
 * Aligne la liste déroulante sur le dispositif courant.
 *
 * L'attribut `selected` est posé en plus de la propriété : le DOM allégé des
 * tests dérive `value` de l'attribut et refuse l'affectation directe.
 */
function syncFormationSelect() {
  const select = $('#compo-formation');
  if (!select) return;
  Array.from(select.options).forEach((option) => {
    if (option.value === state.lineup.formation) option.setAttribute('selected', '');
    else option.removeAttribute('selected');
  });
  try { select.value = state.lineup.formation; } catch { /* propriété en lecture seule */ }
}

/** Après une affectation, l'emplacement libre suivant, pour enchaîner. */
function nextFreeSlot(cible) {
  const slots = FORMATIONS[state.lineup.formation].slots;
  if (cible.zone === 'starter') {
    for (let i = cible.index + 1; i < slots.length; i += 1) {
      if (!state.lineup.starters[i]) return { zone: 'starter', index: i, role: slots[i].role };
    }
    const premier = state.lineup.starters.findIndex((id) => !id);
    if (premier !== -1) return { zone: 'starter', index: premier, role: slots[premier].role };
    const banc = state.lineup.bench.findIndex((id) => !id);
    return banc === -1 ? null : { zone: 'bench', index: banc, role: '' };
  }
  if (cible.zone === 'bench') {
    const banc = state.lineup.bench.findIndex((id) => !id);
    return banc === -1 ? null : { zone: 'bench', index: banc, role: '' };
  }
  return null;
}

/** Appelé à chaque arrivée de contenu : l'effectif peut avoir changé. */
export function renderCompo(content) {
  if (!$('#compo-pitch')) return;
  const premier = state.content === null;
  state.content = content;
  // Le fragment est relu à chaque arrivée de contenu : les joueurs absents du
  // rendu par défaut se rattachent dès que l'effectif réel est là, et une fiche
  // supprimée entre-temps libère sa place.
  if (premier) restore();
  else state.lineup = decodeLineup(state.source, players());
  syncFormationSelect();
  draw();
}
