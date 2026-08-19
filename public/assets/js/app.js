/**
 * OSA FOOT 7 — logique du site public.
 *
 * Le contenu vient de `/api/content` (Cloudflare D1) et retombe sur
 * DEFAULT_CONTENT si l'API est absente, vide ou en erreur : le site reste donc
 * parfaitement fonctionnel même déployé en 100 % statique.
 */

import { DEFAULT_CONTENT, cloneContent, deepMerge } from './content.js';
import { playerCardHTML, playerProfileHTML, sortPlayers, SORTS } from './squad.js';

/* ═══════════════════════════════════════════ Utilitaires ══ */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Contenu courant du site. Rempli par `render()`, lu par les gestionnaires d'événements. */
const state = {
  content: null,
  /** Fiche ouverte, pour la rafraîchir quand le contenu distant arrive. */
  openPlayerId: null,
  // Sur le site, l'effectif s'ouvre sur les meilleures notes.
  squadSort: { key: 'overall', direction: 'desc' }
};

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Échappe une chaîne destinée à être injectée dans du HTML. */
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Transforme un texte brut en paragraphes HTML sûrs. */
function toParagraphs(text) {
  return String(text ?? '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${esc(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** Lit une valeur imbriquée : get(obj, 'a.b.c'). */
function get(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

const DATE_FULL = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  hour: '2-digit', minute: '2-digit'
});
const DATE_SHORT = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
});

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/* ══════════════════════════════════════════════ Toasts ══ */

const toastEl = $('#toast');
let toastTimer = null;

function toast(message, variant = 'info') {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.className = `toast toast--${variant} is-visible`;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('is-visible');
    setTimeout(() => { toastEl.hidden = true; }, 300);
  }, 4200);
}

/* ═══════════════════════════════════════════════ Modale ══ */

const modal = {
  root: $('#modal'),
  dialog: $('#modal .modal__dialog'),
  body: $('#modal-body'),
  lastFocused: null,

  open(html, onClose = null) {
    if (!this.root) return;
    this.onClose = onClose;
    this.lastFocused = document.activeElement;
    this.body.innerHTML = html;
    this.root.hidden = false;
    document.body.classList.add('is-locked');
    requestAnimationFrame(() => {
      this.root.classList.add('is-open');
      this.dialog.focus();
      this.dialog.scrollTop = 0;
    });
  },

  close() {
    if (!this.root || this.root.hidden) return;
    this.root.classList.remove('is-open');
    document.body.classList.remove('is-locked');
    const callback = this.onClose;
    this.onClose = null;
    const finish = () => {
      this.root.hidden = true;
      this.body.innerHTML = '';
      if (this.lastFocused && document.contains(this.lastFocused)) this.lastFocused.focus();
      callback?.();
    };
    REDUCED_MOTION ? finish() : setTimeout(finish, 220);
  },

  get isOpen() {
    return this.root && !this.root.hidden;
  }
};

function initModal() {
  if (!modal.root) return;

  modal.root.addEventListener('click', (event) => {
    if (event.target.closest('[data-close-modal]')) modal.close();
  });

  document.addEventListener('keydown', (event) => {
    if (!modal.isOpen) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      modal.close();
      return;
    }

    // Piège à focus : on garde la tabulation à l'intérieur de la modale.
    if (event.key === 'Tab') {
      const focusables = $$(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
        modal.dialog
      ).filter((el) => el.offsetParent !== null || el === modal.dialog);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
}

/* ══════════════════════════════════════════ Navigation ══ */

function initNavigation() {
  const header = $('#site-header');
  const burger = $('#burger');
  const nav = $('#primary-nav');
  const scrim = $('#nav-scrim');
  const progress = $('#scroll-progress');

  const closeButton = $('#nav-close');

  const closeNav = () => {
    const wasOpen = document.body.classList.contains('nav-open');
    document.body.classList.remove('nav-open');
    burger?.setAttribute('aria-expanded', 'false');
    if (scrim) scrim.hidden = true;
    // Le focus ne doit jamais rester sur un élément devenu invisible.
    if (wasOpen && nav?.contains(document.activeElement)) burger?.focus();
  };

  burger?.addEventListener('click', () => {
    const open = document.body.classList.toggle('nav-open');
    burger.setAttribute('aria-expanded', String(open));
    if (scrim) scrim.hidden = !open;
    if (open) closeButton?.focus();
  });

  closeButton?.addEventListener('click', closeNav);
  scrim?.addEventListener('click', closeNav);
  nav?.addEventListener('click', (event) => {
    if (event.target.closest('a')) closeNav();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeNav();
  });

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      header?.classList.toggle('is-scrolled', window.scrollY > 24);
      if (progress) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        progress.style.transform = `scaleX(${max > 0 ? Math.min(window.scrollY / max, 1) : 0})`;
      }
      ticking = false;
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Surlignage du lien correspondant à la section visible.
  // Seuls les liens d'ancrage sont concernés : les pages secondaires
  // (mentions légales) pointent vers « / », qui n'est pas un sélecteur valide.
  const links = $$('.nav__link');
  const sections = links
    .map((link) => link.getAttribute('href'))
    .filter((href) => href && href.length > 1 && href.startsWith('#'))
    .map((href) => $(href))
    .filter(Boolean);

  if (sections.length && 'IntersectionObserver' in window) {
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((link) => {
          link.classList.toggle('is-active', link.getAttribute('href') === `#${entry.target.id}`);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    sections.forEach((section) => spy.observe(section));
  }
}

/* ═════════════════════════════════════ Reveal au scroll ══ */

function initReveal(root = document) {
  const items = $$('[data-reveal]', root).filter((el) => !el.classList.contains('is-visible'));
  if (REDUCED_MOTION || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
  items.forEach((el) => observer.observe(el));
}

/* ═══════════════════════════════════════ Compte à rebours ══ */

let countdownTimer = null;

function startCountdown(kickoffISO) {
  const root = $('#countdown');
  const status = $('#countdown-status');
  if (!root) return;

  const fields = {
    days: $('[data-cd="days"]', root),
    hours: $('[data-cd="hours"]', root),
    minutes: $('[data-cd="minutes"]', root),
    seconds: $('[data-cd="seconds"]', root)
  };

  const kickoff = parseDate(kickoffISO);
  clearInterval(countdownTimer);

  const paint = (d, h, m, s) => {
    fields.days.textContent = String(d).padStart(2, '0');
    fields.hours.textContent = String(h).padStart(2, '0');
    fields.minutes.textContent = String(m).padStart(2, '0');
    fields.seconds.textContent = String(s).padStart(2, '0');
  };

  const setStatus = (message, tone) => {
    if (!status) return;
    status.hidden = !message;
    status.textContent = message || '';
    status.className = `countdown__status${tone ? ` countdown__status--${tone}` : ''}`;
  };

  if (!kickoff) {
    paint(0, 0, 0, 0);
    root.classList.add('is-idle');
    setStatus('Date du prochain match bientôt communiquée.', 'muted');
    return;
  }

  const tick = () => {
    const diff = kickoff.getTime() - Date.now();

    if (diff <= 0) {
      paint(0, 0, 0, 0);
      root.classList.add('is-idle');
      // On considère un match « en cours » pendant les 2 heures qui suivent le coup d'envoi.
      if (diff > -2 * 60 * 60 * 1000) {
        setStatus('⚽ Coup d\'envoi donné — allez l\'OSA !', 'live');
      } else {
        setStatus('Ce match est terminé. Prochaine affiche bientôt annoncée.', 'muted');
        clearInterval(countdownTimer);
      }
      return;
    }

    root.classList.remove('is-idle');
    setStatus('', null);

    const totalSeconds = Math.floor(diff / 1000);
    paint(
      Math.floor(totalSeconds / 86400),
      Math.floor((totalSeconds % 86400) / 3600),
      Math.floor((totalSeconds % 3600) / 60),
      totalSeconds % 60
    );
  };

  tick();
  countdownTimer = setInterval(tick, 1000);
}

/* ════════════════════════════════════════════ Rendu ══ */

/** Applique les liaisons simples déclarées en HTML via data-bind*. */
function applyBindings(content) {
  const kickoff = parseDate(content.nextMatch?.kickoff);

  const computed = {
    'nextMatch.dateFull': kickoff ? capitalize(DATE_FULL.format(kickoff)) : 'Date à venir',
    'nextMatch.dateLabel': kickoff ? capitalize(DATE_SHORT.format(kickoff)) : 'À venir',
    // L'adresse de contact des mentions légales retombe sur celle du club.
    'legal.email': content.legal?.email || content.club?.email || ''
  };

  $$('[data-bind]').forEach((el) => {
    const path = el.dataset.bind;
    const value = path in computed ? computed[path] : get(content, path);
    if (value === undefined || value === null || value === '') return;
    if (el.tagName === 'IMG') el.src = value;
    else el.textContent = value;
  });

  $$('[data-bind-row]').forEach((el) => {
    el.hidden = !String(get(content, el.dataset.bindRow) ?? '').trim();
  });

  $$('[data-bind-href]').forEach((el) => {
    const value = get(content, el.dataset.bindHref);
    if (value) {
      el.href = value;
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  });

  $$('[data-bind-mail]').forEach((el) => {
    const value = get(content, el.dataset.bindMail);
    if (!value) return;
    el.href = `mailto:${value}`;
    if (el.dataset.keepText !== 'true' && el.tagName === 'A' && el.children.length === 0) {
      el.textContent = value;
    }
  });

  // Le titre du document ne se recalcule que sur la page d'accueil : les pages
  // secondaires (mentions légales) gardent le leur.
  if (document.body.dataset.page === 'home') {
    document.title = `${content.club?.name || 'OSA FOOT 7'} — ${content.club?.tagline || ''}`
      .trim().replace(/—\s*$/, '');
  }

}

/** Résultat d'un match : 'win' | 'draw' | 'loss' | null */
function outcomeOf(item) {
  const score = item?.score;
  if (!score || typeof score.osa !== 'number' || typeof score.opponent !== 'number') return null;
  if (score.osa > score.opponent) return 'win';
  if (score.osa < score.opponent) return 'loss';
  return 'draw';
}

const OUTCOME_LABEL = { win: 'Victoire', draw: 'Match nul', loss: 'Défaite' };

function scoreLine(item) {
  const score = item?.score;
  if (!score || typeof score.osa !== 'number' || typeof score.opponent !== 'number') return '';
  return item.venue === 'home'
    ? `${score.osa} – ${score.opponent}`
    : `${score.opponent} – ${score.osa}`;
}

function matchTitle(item) {
  const opponent = item.opponent || 'Adversaire';
  return item.venue === 'home' ? `OSA — ${opponent}` : `${opponent} — OSA`;
}

function renderNews(content) {
  const grid = $('#news-grid');
  if (!grid) return;

  const items = Array.isArray(content.news) ? content.news : [];
  if (!items.length) {
    grid.innerHTML = '<p class="empty">Aucune actualité pour le moment.</p>';
    return;
  }

  grid.innerHTML = items.map((item, index) => {
    const outcome = outcomeOf(item);
    const score = scoreLine(item);
    const dateLabel = item.date ? capitalize(new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(item.date))) : '';

    return `
      <article class="news-card" data-reveal style="--delay:${index * 70}ms">
        <div class="news-card__media">
          <img src="${esc(item.image || '/img/osa.png')}" alt="Affiche du match ${esc(matchTitle(item))}" loading="lazy" decoding="async" width="600" height="600">
          ${outcome ? `<span class="badge badge--${outcome}">${OUTCOME_LABEL[outcome]}</span>` : ''}
          ${score ? `<span class="news-card__score">${esc(score)}</span>` : ''}
        </div>
        <div class="news-card__body">
          <p class="news-card__meta">
            ${item.competition ? `<span class="chip">${esc(item.competition)}</span>` : ''}
            ${item.venue ? `<span class="chip chip--soft">${item.venue === 'home' ? 'Domicile' : 'Extérieur'}</span>` : ''}
            ${dateLabel ? `<span class="news-card__date">${esc(dateLabel)}</span>` : ''}
          </p>
          <h3 class="news-card__title">${esc(item.title)}</h3>
          <p class="news-card__excerpt">${esc(item.excerpt)}</p>
          <button class="link-btn" type="button" data-news="${index}">
            Lire la suite
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 5l7 7-7 7v-4H4v-6h9V5z"/></svg>
          </button>
        </div>
      </article>`;
  }).join('');

  initReveal(grid);
}

function openNewsModal(item) {
  if (!item) return;
  const outcome = outcomeOf(item);
  const score = scoreLine(item);
  const dateLabel = item.date
    ? capitalize(new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(item.date)))
    : '';

  modal.open(`
    <figure class="modal__figure">
      <img src="${esc(item.image || '/img/osa.png')}" alt="Affiche du match ${esc(matchTitle(item))}" loading="lazy" decoding="async">
    </figure>
    <div class="modal__content">
      <p class="modal__meta">
        ${outcome ? `<span class="badge badge--${outcome}">${OUTCOME_LABEL[outcome]}</span>` : ''}
        ${item.competition ? `<span class="chip">${esc(item.competition)}</span>` : ''}
        ${item.venue ? `<span class="chip chip--soft">${item.venue === 'home' ? 'À domicile' : 'À l\'extérieur'}</span>` : ''}
        ${dateLabel ? `<span class="news-card__date">${esc(dateLabel)}</span>` : ''}
      </p>
      <h2 class="modal__title" id="modal-title">${esc(item.title)}</h2>
      ${score ? `<p class="modal__score"><span>${esc(matchTitle(item))}</span><strong>${esc(score)}</strong></p>` : ''}
      <div class="modal__text">${toParagraphs(item.body || item.excerpt)}</div>
      ${Array.isArray(item.scorers) && item.scorers.length ? `
        <div class="modal__scorers">
          <h3>Buteurs OSA</h3>
          <ul>${item.scorers.map((s) => `<li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 3.2 3.4 2.5-1.3 4H9.9l-1.3-4zM4.6 12.6l1.3-1 3.3 2.4-.6 4.1a8 8 0 0 1-4-5.5zm10.8 5.5-.6-4.1 3.3-2.4 1.3 1a8 8 0 0 1-4 5.5z"/></svg>${esc(s)}</li>`).join('')}</ul>
        </div>` : ''}
    </div>
  `);
}

/** Métadonnées des deux sections faites d'images téléversées. */
const IMAGE_SECTIONS = [
  {
    key: 'calendar',
    grid: '#calendar-grid',
    fallbackAlt: 'Calendrier de la saison',
    emptyTitle: 'Bientôt disponible',
    emptyText: "Le calendrier de la saison n'est pas encore paru. Il sera publié ici dès réception."
  },
  {
    key: 'standings',
    grid: '#standings-grid',
    fallbackAlt: 'Classement de la poule',
    emptyTitle: 'Bientôt disponible',
    emptyText: 'Le classement sera publié ici dès les premières journées disputées.'
  }
];

/** État affiché tant qu'une section n'a aucune image. */
function soonState(title, text) {
  return `
    <div class="soon" data-reveal>
      <span class="soon__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm-1 3v6l5 3 .8-1.3-4.3-2.5V7H11z"/></svg>
      </span>
      <p class="soon__title">${esc(title)}</p>
      <p class="soon__text">${esc(text)}</p>
    </div>`;
}

function renderImageSection(content, section) {
  const grid = $(section.grid);
  if (!grid) return;

  const images = Array.isArray(content[section.key]?.images) ? content[section.key].images : [];

  grid.innerHTML = images.length
    ? images.map((image, index) => `
        <figure class="image-card" data-reveal style="--delay:${index * 90}ms">
          <button class="image-card__zoom" type="button" data-zoom="${esc(section.key)}" data-index="${index}"
                  aria-label="Agrandir : ${esc(image.caption || image.alt || section.fallbackAlt)}">
            <img src="${esc(image.src)}" alt="${esc(image.alt || image.caption || section.fallbackAlt)}" loading="lazy" decoding="async">
            <span class="image-card__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm-1 2v2H7v2h2v2h2v-2h2V8h-2V6H9z"/></svg>
            </span>
          </button>
          ${image.caption ? `<figcaption>${esc(image.caption)}</figcaption>` : ''}
        </figure>`).join('')
    : soonState(section.emptyTitle, section.emptyText);

  initReveal(grid);
}

function openImageModal(image, fallbackAlt) {
  if (!image) return;
  modal.open(`
    <figure class="modal__figure modal__figure--full">
      <img src="${esc(image.src)}" alt="${esc(image.alt || image.caption || fallbackAlt)}">
    </figure>
    ${image.caption ? `<div class="modal__content"><h2 class="modal__title" id="modal-title">${esc(image.caption)}</h2></div>` : ''}
  `);
}

/**
 * Délégation d'événements branchée une seule fois : les grilles sont
 * régénérées à chaque rendu, mais leurs conteneurs ne changent jamais.
 */
function initGridDelegates() {
  $('#news-grid')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-news]');
    if (!button) return;
    openNewsModal(state.content?.news?.[Number(button.dataset.news)]);
  });

  IMAGE_SECTIONS.forEach((section) => {
    $(section.grid)?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-zoom]');
      if (!button) return;
      const images = state.content?.[button.dataset.zoom]?.images;
      openImageModal(images?.[Number(button.dataset.index)], section.fallbackAlt);
    });
  });

  $('#squad-grid')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-player]');
    if (button) openPlayer(button.dataset.player);
  });

  // Déroulé du classement complet, au-delà du podium.
  $('#stats-grid')?.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-more]');
    if (!toggle) return;
    const card = toggle.closest('.stat-card');
    const rest = $('.podium--rest', card);
    const open = card.classList.toggle('is-expanded');
    toggle.setAttribute('aria-expanded', String(open));
    rest.setAttribute('aria-hidden', String(!open));
    $('.podium__more-label', toggle).textContent = open
      ? 'Réduire'
      : 'Voir les ' + rest.children.length + ' suivants';
  });
}

const STAT_ICONS = {
  ball: '<path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 3.2 3.4 2.5-1.3 4H9.9l-1.3-4zM4.6 12.6l1.3-1 3.3 2.4-.6 4.1a8 8 0 0 1-4-5.5zm10.8 5.5-.6-4.1 3.3-2.4 1.3 1a8 8 0 0 1-4 5.5z"/>',
  boot: '<path d="M3 6h6.3l2.2 3.4L15 7.8l1 1.8 2.6-.7A3.4 3.4 0 0 1 21 12.2V16H3V6zm0 11.5h18V20H3v-2.5z"/>',
  oops: '<path d="M12 2 1 21h22L12 2zm0 5.6 6.9 11.9H5.1L12 7.6zM11 10v5h2v-5h-2zm0 6v2h2v-2h-2z"/>'
};

/** Une ligne de classement. `rank` est l'index 0-based. */
function podiumRow(player, rank, leader, unit) {
  const value = Number(player.value) || 0;
  const fill = Math.round((value / leader) * 100);
  const medal = rank < 3 ? ' podium__row--' + (rank + 1) : '';

  return `
    <li class="podium__row${medal}">
      <span class="podium__rank">${rank + 1}</span>
      <span class="podium__avatar">
        ${player.photo
          ? `<img src="${esc(player.photo)}" alt="" loading="lazy" decoding="async" width="120" height="120">`
          : `<span class="podium__initial" aria-hidden="true">${esc((player.name || '?').charAt(0))}</span>`}
      </span>
      <span class="podium__body">
        <span class="podium__name">${esc(player.name)}</span>
        <span class="podium__bar"><i style="--fill:${fill}%"></i></span>
      </span>
      <span class="podium__value">
        <b>${esc(value)}</b>
        <small>${esc(unit || '')}</small>
      </span>
    </li>`;
}

/* ════════════════════════════════════════════ Effectif ══ */

const PLAYER_HASH = /^#joueur-(.+)$/;

function playerById(id) {
  return state.content?.squad?.players?.find((player) => player.id === id) || null;
}

/** Grille complète, page /effectif. */
function renderSquadGrid(content) {
  const grid = $('#squad-grid');
  if (!grid) return;

  const players = Array.isArray(content.squad?.players) ? content.squad.players : [];
  const { key, direction } = state.squadSort;
  const ordered = sortPlayers(players, key, direction);

  grid.innerHTML = ordered.length
    ? ordered.map((player, index) => playerCardHTML(player, { index })).join('')
    : soonState('Effectif à venir', "Les fiches des joueurs seront publiées ici prochainement.");

  // Le tri n'a pas de sens en dessous de deux fiches.
  const toolbar = $('#squad-toolbar');
  if (toolbar) toolbar.hidden = players.length < 2;

  const count = $('#squad-count');
  if (count) {
    count.hidden = !players.length;
    count.textContent = `${players.length} joueur${players.length > 1 ? 's' : ''} dans l'effectif`;
  }

  initReveal(grid);
}

/** Bandeau défilant, page d'accueil. Chaque carte mène au profil sur /effectif. */
function renderSquadStrip(content) {
  const strip = $('#squad-strip');
  if (!strip) return;

  const players = Array.isArray(content.squad?.players) ? content.squad.players : [];
  const section = strip.closest('section');
  if (section) section.hidden = !players.length;
  if (!players.length) { strip.innerHTML = ''; return; }

  const ordered = sortPlayers(players, state.squadSort.key, state.squadSort.direction);
  const card = (player, index, clone) => playerCardHTML(player, {
    index,
    compact: true,
    clone,
    href: `/effectif#joueur-${encodeURIComponent(player.id)}`
  });

  const original = ordered.map((player, index) => card(player, index, false)).join('');
  const duplicate = ordered.map((player, index) => card(player, index, true)).join('');

  // La durée suit le nombre de cartes : la vitesse perçue reste constante.
  strip.innerHTML = `
    <div class="marquee__track" style="--marquee-duration:${Math.max(28, players.length * 7)}s">
      ${original}${duplicate}
    </div>`;
}

/** Barre de tri de la page Effectif. */
function initSquadSort() {
  const select = $('#squad-sort');
  const button = $('#squad-dir');
  if (!select) return;

  // L'option retenue est marquée dans le HTML plutôt qu'affectée après coup :
  // une seule source, et rien à resynchroniser.
  select.innerHTML = Object.entries(SORTS)
    .map(([key, { label }]) =>
      `<option value="${key}"${key === state.squadSort.key ? ' selected' : ''}>${esc(label)}</option>`)
    .join('');

  const paint = () => {
    const { key, direction } = state.squadSort;
    const sortable = key !== 'default';
    button.disabled = !sortable;
    button.setAttribute('aria-pressed', String(direction === 'desc'));
    $('.squad-dir__label', button).textContent = sortable
      ? (direction === 'asc' ? 'Croissant' : 'Décroissant')
      : 'Ordre libre';
    button.classList.toggle('is-desc', direction === 'desc');
  };

  select.addEventListener('change', () => {
    const key = select.value;
    // Chaque critère a un sens de lecture naturel : meilleures notes d'abord,
    // joueurs les plus anciens d'abord…
    state.squadSort = { key, direction: SORTS[key]?.direction || 'asc' };
    paint();
    renderSquadGrid(state.content);
  });

  button.addEventListener('click', () => {
    if (state.squadSort.key === 'default') return;
    state.squadSort.direction = state.squadSort.direction === 'asc' ? 'desc' : 'asc';
    paint();
    renderSquadGrid(state.content);
  });

  paint();
}

function openPlayer(id) {
  const player = playerById(id);
  if (!player) return false;

  state.openPlayerId = id;
  modal.open(playerProfileHTML(player), () => {
    state.openPlayerId = null;
    // L'ancre disparaît à la fermeture : recharger la page ne rouvre pas la fiche.
    if (PLAYER_HASH.test(window.location.hash)) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  });

  const hash = `#joueur-${encodeURIComponent(id)}`;
  if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
  return true;
}

/**
 * Remet la fiche ouverte à jour après un nouveau rendu.
 *
 * Au chargement d'une URL du type /effectif#joueur-keks, la fiche s'ouvre
 * d'abord à partir du contenu livré avec le code, puis le contenu enregistré
 * arrive de la base. Sans ce rafraîchissement, la modale resterait figée sur
 * l'ancienne version du joueur.
 */
function refreshOpenPlayer() {
  if (!state.openPlayerId || !modal.isOpen) return;

  const player = playerById(state.openPlayerId);
  if (player) {
    modal.body.innerHTML = playerProfileHTML(player);
  } else {
    // La fiche a été supprimée entre-temps : inutile de garder la modale.
    modal.close();
  }
}

/** Ouvre la fiche désignée par l'ancre de l'URL, si elle existe. */
function syncPlayerFromHash() {
  if (modal.isOpen) return;
  const match = PLAYER_HASH.exec(window.location.hash);
  if (match) openPlayer(decodeURIComponent(match[1]));
}

function renderStats(content) {
  const grid = $('#stats-grid');
  if (!grid) return;

  const groups = Array.isArray(content.stats?.groups) ? content.stats.groups : [];
  if (!groups.length) {
    grid.innerHTML = soonState('Bientôt disponible', 'Les statistiques de la saison seront publiées ici.');
    initReveal(grid);
    return;
  }

  grid.innerHTML = groups.map((group, gIndex) => {
    // Toujours du meilleur au moins bon, quel que soit l'ordre de saisie en admin.
    const players = (Array.isArray(group.players) ? [...group.players] : [])
      .sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
    const leader = players.reduce((max, p) => Math.max(max, Number(p.value) || 0), 0) || 1;

    const podium = players.slice(0, 3);
    const rest = players.slice(3);

    return `
      <article class="stat-card stat-card--${esc(group.accent || 'blue')}" data-reveal style="--delay:${gIndex * 110}ms">
        <header class="stat-card__head">
          <span class="stat-card__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">${STAT_ICONS[group.icon] || STAT_ICONS.ball}</svg>
          </span>
          <h3>${esc(group.title)}</h3>
        </header>

        ${players.length ? `
          <ol class="podium">
            ${podium.map((p, i) => podiumRow(p, i, leader, group.unit)).join('')}
          </ol>
          ${rest.length ? `
            <div class="podium__wrap">
              <ol class="podium podium--rest" aria-hidden="true">
                ${rest.map((p, i) => podiumRow(p, i + 3, leader, group.unit)).join('')}
              </ol>
            </div>
            <button class="podium__more" type="button" data-more aria-expanded="false">
              <span class="podium__more-label">Voir les ${rest.length} suivants</span>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.4 5.6 9 7 7.6l5 5 5-5L18.4 9z"/></svg>
            </button>` : ''}
        ` : '<p class="stat-card__empty">Aucun joueur classe pour l instant.</p>'}
      </article>`;
  }).join('');

  initReveal(grid);
}

/* ═════════════════════════════════════ Formulaire contact ══ */

function initContactForm() {
  const form = $('#contact-form');
  if (!form) return;

  const status = $('#cf-status');
  const submit = $('#cf-submit');

  /** Champ du formulaire par son attribut `name`. */
  const control = (name) => $(`[name="${name}"]`, form);

  const setError = (name, message) => {
    const holder = $(`[data-error-for="${name}"]`, form);
    const input = control(name);
    if (holder) holder.textContent = message || '';
    if (input) {
      input.classList.toggle('is-invalid', Boolean(message));
      input.setAttribute('aria-invalid', message ? 'true' : 'false');
    }
  };

  const setStatus = (message, variant) => {
    if (!status) return;
    status.innerHTML = message || '';
    status.className = `form__status${variant ? ` form__status--${variant}` : ''}`;
  };

  ['name', 'email', 'message'].forEach((name) => {
    control(name)?.addEventListener('input', () => setError(name, ''));
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('', null);

    const data = {
      name: control('name').value.trim(),
      email: control('email').value.trim(),
      subject: control('subject').value,
      message: control('message').value.trim(),
      website: control('website').value
    };

    let valid = true;
    if (data.name.length < 2) { setError('name', 'Merci d\'indiquer votre nom.'); valid = false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) { setError('email', 'Adresse e-mail invalide.'); valid = false; }
    if (data.message.length < 10) { setError('message', 'Votre message est un peu court (10 caractères minimum).'); valid = false; }
    if (!control('consent').checked) {
      setStatus('Merci de cocher la case de consentement.', 'error');
      valid = false;
    }
    if (!valid) {
      $('.is-invalid', form)?.focus();
      return;
    }

    submit.disabled = true;
    form.classList.add('is-sending');

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const payload = await response.json().catch(() => ({}));

      if (response.ok) {
        form.reset();
        setStatus('Message envoyé ! Nous vous répondons très vite. ⚽', 'success');
        toast('Message bien reçu, merci !', 'success');
      } else {
        throw new Error(payload.error || `Erreur ${response.status}`);
      }
    } catch (error) {
      const mail = state.content?.club?.email;
      const fallback = mail
        ? ` Écrivez-nous directement à <a href="mailto:${esc(mail)}?subject=${encodeURIComponent(data.subject)}&body=${encodeURIComponent(data.message)}">${esc(mail)}</a>.`
        : '';
      setStatus(`L'envoi automatique n'a pas fonctionné.${fallback}`, 'error');
      console.warn('[contact]', error);
    } finally {
      submit.disabled = false;
      form.classList.remove('is-sending');
    }
  });
}

/* ══════════════════════════════════════════ Amorçage ══ */

function render(content) {
  state.content = content;
  applyBindings(content);
  renderNews(content);
  renderSquadGrid(content);
  renderSquadStrip(content);
  refreshOpenPlayer();
  IMAGE_SECTIONS.forEach((section) => renderImageSection(content, section));
  renderStats(content);
  startCountdown(content.nextMatch?.kickoff);
}

async function loadRemoteContent() {
  try {
    const response = await fetch('/api/content', { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload && typeof payload.content === 'object' ? payload.content : null;
  } catch {
    return null; // Déploiement 100 % statique : on garde le contenu par défaut.
  }
}

async function boot() {
  initModal();
  initNavigation();
  initGridDelegates();
  initContactForm();
  initReveal();

  initSquadSort();
  window.addEventListener('hashchange', syncPlayerFromHash);

  render(cloneContent(DEFAULT_CONTENT));
  syncPlayerFromHash();

  const remote = await loadRemoteContent();
  if (remote) {
    render(deepMerge(cloneContent(DEFAULT_CONTENT), remote));
    // Le joueur visé n'existait peut-être que dans le contenu distant.
    syncPlayerFromHash();
  }
}

boot();
