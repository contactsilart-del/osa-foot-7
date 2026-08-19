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

/** Les six notes, dans l'ordre d'affichage. */
export const RATINGS = [
  ['pace', 'Vitesse'],
  ['dribbling', 'Dribble'],
  ['shooting', 'Tir'],
  ['passing', 'Passe'],
  ['defending', 'Défense'],
  ['physical', 'Physique']
];

export const RATING_MAX = 99;

/**
 * Couleur d'une note : rouge vif à 0, vert foncé à 99.
 *
 * La teinte parcourt le rouge → orange → jaune → vert, pendant que la
 * luminosité descend : sans cela le haut de l'échelle virerait au vert fluo
 * au lieu du vert profond attendu.
 */
export function ratingColor(value) {
  const ratio = Math.max(0, Math.min(RATING_MAX, Number(value) || 0)) / RATING_MAX;
  const hue = 4 + ratio * 136;
  const saturation = 74 - ratio * 16;
  const lightness = 47 - ratio * 15;
  return `hsl(${Math.round(hue)} ${Math.round(saturation)}% ${Math.round(lightness)}%)`;
}

/** Moyenne des six notes, arrondie. Sert de note générale sur la carte. */
export function overallOf(player) {
  const values = RATINGS.map(([key]) => Number(player?.ratings?.[key]) || 0);
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
          ${RATINGS.map(([key, label]) => {
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
