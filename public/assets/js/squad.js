/**
 * OSA FOOT 7 — présentation de l'effectif.
 *
 * Ce module ne touche pas au DOM : il fabrique du HTML à partir d'un joueur.
 * Le câblage (grille, bandeau défilant, ouverture des profils) reste dans
 * `app.js`, qui l'utilise aussi bien sur la page d'accueil que sur `/effectif`.
 */

/** Échappe une chaîne destinée à être injectée dans du HTML. */
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const POSITIONS = {
  GB:  { label: 'Gardien',   accent: '#E9A13B' },
  DEF: { label: 'Défenseur', accent: '#3DA5E0' },
  MIL: { label: 'Milieu',    accent: '#3DC08A' },
  ATT: { label: 'Attaquant', accent: '#E2604A' }
};

/** Les six notes d'un joueur de champ, dans l'ordre d'affichage. */
export const RATINGS_OUTFIELD = [
  ['pace', 'Vitesse'],
  ['dribbling', 'Dribble'],
  ['shooting', 'Tir'],
  ['passing', 'Passe'],
  ['defending', 'Défense'],
  ['physical', 'Physique']
];

/** Celles d'un gardien : rien à voir avec le tir ou le dribble. */
export const RATINGS_GK = [
  ['reflexes', 'Réflexes'],
  ['positioning', 'Positionnement'],
  ['diving', 'Plongeon'],
  ['kicking', 'Jeu au pied'],
  ['handling', 'Jeu à la main'],
  ['speed', 'Vitesse']
];

/**
 * Les deux jeux cohabitent dans la même fiche : changer un joueur de poste
 * n'efface pas les notes de l'autre jeu, elles cessent seulement d'être
 * affichées.
 */
export function ratingsFor(player) {
  return player?.position === 'GB' ? RATINGS_GK : RATINGS_OUTFIELD;
}

/** Compatibilité : l'ancien nom pointe sur le jeu des joueurs de champ. */
export const RATINGS = RATINGS_OUTFIELD;

export const RATING_MAX = 99;

/**
 * Paliers de couleur des notes. Un dégradé continu rendait deux notes voisines
 * indiscernables ; des paliers nets se lisent d'un coup d'œil.
 *
 * Le seuil du vert court jusqu'à 84 pour ne laisser aucun trou entre les
 * paliers demandés (75-80 vert, 85-99 vert foncé).
 */
export const RATING_BANDS = [
  { min: 85, color: '#14663C', label: 'vert foncé' },
  { min: 75, color: '#2FA35A', label: 'vert' },
  { min: 65, color: '#C9911A', label: 'jaune' },
  { min: 0,  color: '#D23B30', label: 'rouge' }
];

/** Couleur d'une note, par palier. */
export function ratingColor(value) {
  const note = Math.max(0, Math.min(RATING_MAX, Number(value) || 0));
  return RATING_BANDS.find((band) => note >= band.min).color;
}

/** Moyenne des six notes du poste, arrondie. Sert de note générale. */
export function overallOf(player) {
  const values = ratingsFor(player).map(([key]) => Number(player?.ratings?.[key]) || 0);
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

/** Nom complet, sans espace superflu quand le nom de famille manque. */
export function fullName(player) {
  return [player?.firstName, player?.lastName].filter(Boolean).join(' ').trim() || 'Joueur';
}

/** Nombre de saisons au club, à partir de l'année d'arrivée. */
export function seasonsAtClub(player, now = new Date()) {
  const since = Number(player?.since) || 0;
  if (!since) return 0;
  // La saison bascule en été : avant juillet, on est encore dans celle entamée
  // l'année précédente.
  const seasonStart = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return Math.max(1, seasonStart - since + 1);
}

/** Cinq étoiles, `count` remplies. */
export function starsHTML(count, label) {
  const filled = Math.max(0, Math.min(5, Number(count) || 0));
  const star = (on) =>
    `<svg viewBox="0 0 24 24" class="stars__item${on ? ' is-on' : ''}" aria-hidden="true"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.8 21l1.2-6.9-5-4.9 6.9-1L12 2z"/></svg>`;
  return `
    <span class="stars" role="img" aria-label="${esc(label)} : ${filled} sur 5">
      ${[1, 2, 3, 4, 5].map((i) => star(i <= filled)).join('')}
    </span>`;
}

function initialsOf(player) {
  const name = fullName(player);
  return name.split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('');
}

function avatarHTML(player, size) {
  return player?.photo
    ? `<img src="${esc(player.photo)}" alt="" loading="lazy" decoding="async" width="${size}" height="${size}">`
    : `<span class="player-avatar__initials" aria-hidden="true">${esc(initialsOf(player))}</span>`;
}

/* ═════════════════════════════════════════════ Tri ══ */

/** Ordre naturel des postes : du but vers l'attaque. */
const POSITION_ORDER = { GB: 0, DEF: 1, MIL: 2, ATT: 3 };

/**
 * Critères de tri de l'effectif.
 * `direction` est le sens par défaut appliqué quand on choisit le critère —
 * les meilleures notes d'abord, les plus anciens d'abord, etc.
 */
export const SORTS = {
  default:  { label: "Ordre de l'effectif", direction: null },
  position: { label: 'Poste', direction: 'asc' },
  overall:  { label: 'Note générale', direction: 'desc' },
  age:      { label: 'Âge', direction: 'asc' },
  since:    { label: 'Ancienneté', direction: 'desc' }
};

function sortValue(player, key) {
  switch (key) {
    case 'position': return POSITION_ORDER[player.position] ?? 9;
    case 'overall': return overallOf(player);
    // Un âge ou une ancienneté à 0 signifie « non renseigné », pas « zéro ».
    case 'age': return Number(player.age) || null;
    case 'since': return seasonsAtClub(player) || null;
    default: return null;
  }
}

/**
 * Trie une copie de l'effectif. Les fiches dont la valeur manque restent en fin
 * de liste dans les deux sens : les remonter en tête à la moindre inversion
 * n'aurait aucun intérêt pour le lecteur.
 */
export function sortPlayers(players, key = 'default', direction = 'asc') {
  const list = Array.isArray(players) ? players : [];
  if (!SORTS[key] || key === 'default') return [...list];

  const sign = direction === 'asc' ? 1 : -1;

  return [...list].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (va !== vb) return (va - vb) * sign;
    return fullName(a).localeCompare(fullName(b), 'fr');
  });
}

/* ═════════════════════════════════════════════ Carte ══ */

/**
 * Carte de joueur.
 * @param {object} player
 * @param {{index?: number, href?: string, compact?: boolean, clone?: boolean}} [options]
 *   `href` transforme la carte en lien (bandeau de la page d'accueil) ;
 *   sans lui, c'est un bouton qui ouvre le profil sur place.
 *   `clone` marque le duplicata du bandeau défilant : invisible pour les
 *   lecteurs d'écran et hors du parcours de tabulation.
 */
export function playerCardHTML(player, options = {}) {
  const { index = 0, href, compact = false, clone = false } = options;
  const position = POSITIONS[player.position] || POSITIONS.MIL;
  const overall = overallOf(player);
  const tag = href ? 'a' : 'button';
  const attrs = href
    ? `href="${esc(href)}"`
    : `type="button" data-player="${esc(player.id)}"`;
  const hidden = clone ? ' aria-hidden="true" tabindex="-1"' : '';

  return `
    <${tag} class="player-card${compact ? ' player-card--compact' : ''}" ${attrs}${hidden}
            style="--position-accent:${position.accent}; --overall-color:${ratingColor(overall)}; --delay:${index * 60}ms"
            ${compact ? '' : 'data-reveal'}>
      <span class="player-card__top">
        <span class="player-card__overall" aria-label="Note générale ${overall} sur ${RATING_MAX}">${overall}</span>
        <span class="player-card__position">${esc(position.label)}</span>
      </span>

      <span class="player-avatar player-avatar--card">${avatarHTML(player, 220)}</span>

      <span class="player-card__identity">
        <span class="player-card__first">${esc(player.firstName || '')}</span>
        <span class="player-card__last">${esc(player.lastName || '')}</span>
      </span>

      <span class="player-card__meta">
        ${player.nationality ? `<span>${esc(player.nationality)}</span>` : ''}
        ${Number(player.age) ? `<span>${esc(player.age)} ans</span>` : ''}
      </span>
    </${tag}>`;
}

/* ═══════════════════════════════════════════ Profil ══ */

/** Fiche complète, affichée en fenêtre modale. */
export function playerProfileHTML(player) {
  const position = POSITIONS[player.position] || POSITIONS.MIL;
  const overall = overallOf(player);
  const seasons = seasonsAtClub(player);

  const facts = [
    Number(player.age) ? ['Âge', `${player.age} ans`] : null,
    player.nationality ? ['Nationalité', player.nationality] : null,
    ['Poste', position.label],
    Number(player.since) ? ['Au club depuis', `${player.since} · ${seasons} saison${seasons > 1 ? 's' : ''}`] : null,
    player.marketValue ? ['Valeur marchande', player.marketValue] : null
  ].filter(Boolean);

  return `
    <article class="player-profile" style="--position-accent:${position.accent}; --overall-color:${ratingColor(overall)}">
      <header class="player-profile__head">
        <span class="player-avatar player-avatar--profile">${avatarHTML(player, 320)}</span>
        <div class="player-profile__title">
          <p class="player-profile__position">${esc(position.label)}</p>
          <h2 class="modal__title" id="modal-title">${esc(fullName(player))}</h2>
          <p class="player-profile__overall">
            <b>${overall}</b><small>note générale</small>
          </p>
        </div>
      </header>

      <div class="player-profile__body">
        ${facts.length ? `
          <dl class="player-facts">
            ${facts.map(([label, value]) => `
              <div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}
          </dl>` : ''}

        <div class="player-skills">
          <div class="player-skills__item">
            <span>Mauvais pied</span>
            ${starsHTML(player.weakFoot, 'Mauvais pied')}
          </div>
          <div class="player-skills__item">
            <span>Gestes techniques</span>
            ${starsHTML(player.skillMoves, 'Gestes techniques')}
          </div>
        </div>

        <div class="player-ratings">
          ${ratingsFor(player).map(([key, label]) => {
            const value = Math.max(0, Math.min(RATING_MAX, Number(player.ratings?.[key]) || 0));
            return `
              <div class="rating" style="--rating-color:${ratingColor(value)}; --rating-fill:${Math.round((value / RATING_MAX) * 100)}%">
                <span class="rating__label">${esc(label)}</span>
                <span class="rating__value">${value}</span>
                <span class="rating__bar"><i></i></span>
              </div>`;
          }).join('')}
        </div>

        ${player.description ? `
          <div class="player-profile__text">
            ${String(player.description).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
              .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}
          </div>` : ''}
      </div>
    </article>`;
}
