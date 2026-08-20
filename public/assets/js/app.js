/**
 * OSA FOOT 7 — logique du site public.
 *
 * Le contenu vient de `/api/content` (Cloudflare D1) et retombe sur
 * DEFAULT_CONTENT si l'API est absente, vide ou en erreur : le site reste donc
 * parfaitement fonctionnel même déployé en 100 % statique.
 */

import { DEFAULT_CONTENT, cloneContent, deepMerge, migrateContent } from './content.js';
import { playerCardHTML, playerProfileHTML, sortPlayers, SORTS, fullName } from './squad.js';
import {
  computeStandings, formOf, homeTeamId, involves, isPlayed, matchesByDay, matchesOf,
  nextMatchFor, outcomeFor, sortByDate, teamLogo, teamName, teamShort, OUTCOME_LABEL
} from './league.js';
import { initCompo, renderCompo } from './compo.js';
import { initPacks, renderPacks } from './packs.js';
import { initPronos, renderPronos } from './pronos.js';

/* ═══════════════════════════════════════════ Utilitaires ══ */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Contenu courant du site. Rempli par `render()`, lu par les gestionnaires d'événements. */
const state = {
  /** Matchs porteurs d'un récit, dans l'ordre où « Lire la suite » les indexe. */
  articles: [],
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
  // Les liaisons `nextMatch.*` du HTML décrivent l'affiche calculée, pas le
  // bloc enregistré : c'est le championnat qui commande dès qu'il est rempli.
  const affiche = nextFixture(content);
  const vue = { ...content, nextMatch: affiche };
  const kickoff = parseDate(affiche.kickoff);

  const computed = {
    'nextMatch.dateFull': kickoff ? capitalize(DATE_FULL.format(kickoff)) : 'Date à venir',
    'nextMatch.dateLabel': kickoff ? capitalize(DATE_SHORT.format(kickoff)) : 'À venir',
    // L'adresse de contact des mentions légales retombe sur celle du club.
    'legal.email': content.legal?.email || content.club?.email || ''
  };

  $$('[data-bind]').forEach((el) => {
    const path = el.dataset.bind;
    const value = path in computed ? computed[path] : get(vue, path);
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

/* ═══════════════════════════════════════ Championnat ══ */

const DATE_DAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const DATE_LONG = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });
const HEURE = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** Lettre affichée dans le carré de forme, pour qui ne distingue pas les couleurs. */
const FORM_LETTER = { win: 'V', draw: 'N', loss: 'D' };

function champOf(content) {
  return content?.championship || {};
}

/** L'identifiant de notre équipe dans le tableau du championnat. */
function usId(content) {
  return homeTeamId(champOf(content));
}

/** Écusson d'un club : son logo, ou son initiale si aucun n'a été téléversé. */
function crestHTML(content, teamId, size = 96) {
  const logo = teamLogo(champOf(content), teamId);
  const nom = teamShort(champOf(content), teamId);
  return logo
    ? `<img src="${esc(logo)}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async">`
    : `<span class="crest__initial" aria-hidden="true">${esc(nom.charAt(0) || '?')}</span>`;
}

function matchSummary(champ, match) {
  const score = isPlayed(match) ? `${match.homeScore} – ${match.awayScore}` : 'à venir';
  return `${teamShort(champ, match.homeId)} ${score} ${teamShort(champ, match.awayId)}`;
}

/** Libellé de date d'un match : « ven. 5 sept. · 20:30 ». */
function matchWhen(match) {
  const date = parseDate(match?.date);
  if (!date) return '';
  return `${capitalize(DATE_DAY.format(date))} · ${HEURE.format(date)}`;
}

/**
 * L'affiche du prochain match. Elle vient du championnat dès qu'une rencontre y
 * est programmée ; à défaut, du bloc « Prochain match » saisi à la main, qui
 * reste le filet de sécurité d'avant-saison.
 */
function nextFixture(content) {
  const champ = champOf(content);
  const match = nextMatchFor(champ);
  if (!match) {
    const secours = content?.nextMatch || {};
    return { ...secours, matchId: '', homeId: '', awayId: '' };
  }

  const aDomicile = match.homeId === usId(content);
  return {
    matchId: match.id,
    competition: match.competition || content?.nextMatch?.competition || '',
    home: { name: teamShort(champ, match.homeId), logo: teamLogo(champ, match.homeId) },
    away: { name: teamShort(champ, match.awayId), logo: teamLogo(champ, match.awayId) },
    kickoff: match.date,
    venue: match.venue
      || (aDomicile ? (content?.venue?.name || '') : `Chez ${teamName(champ, match.homeId)}`),
    homeId: match.homeId,
    awayId: match.awayId
  };
}

/**
 * La forme du moment : cinq carrés, du plus ancien au plus récent. Chacun porte
 * sa lettre — un daltonien ne distingue pas le vert du rouge, et la couleur
 * seule ne suffirait donc pas à lire la série.
 */
function formStripHTML(champ, teamId) {
  const suite = formOf(champ, teamId);
  if (!suite.length) return '';

  const resume = suite.map(({ outcome }) => OUTCOME_LABEL[outcome] || '—').join(', ');
  return `
    <span class="form-strip" role="img"
          aria-label="Forme du moment, du plus ancien au plus récent : ${esc(resume)}">
      ${suite.map(({ outcome, match }) => `
        <i class="form-strip__box form-strip__box--${outcome}" title="${esc(matchSummary(champ, match))}">
          ${FORM_LETTER[outcome] || ''}
        </i>`).join('')}
    </span>`;
}

/** L'affiche de la page d'accueil, écussons et forme des deux équipes. */
function renderFixture(content) {
  const zone = $('#fixture');
  if (!zone) return;

  const affiche = nextFixture(content);
  const champ = champOf(content);
  const kickoff = parseDate(affiche.kickoff);

  const cote = (teamId, equipe, eager) => `
    <div class="fixture__side">
      <div class="fixture__crest">${
        equipe?.logo
          ? `<img src="${esc(equipe.logo)}" alt="" width="120" height="120" loading="${eager ? 'eager' : 'lazy'}">`
          : `<span class="crest__initial" aria-hidden="true">${esc(String(equipe?.name || '?').charAt(0))}</span>`
      }</div>
      <span class="fixture__team">${esc(equipe?.name || '—')}</span>
      ${formStripHTML(champ, teamId)}
    </div>`;

  zone.innerHTML = `
    ${cote(affiche.homeId, affiche.home, true)}
    <div class="fixture__center">
      <span class="fixture__vs">VS</span>
      <span class="fixture__when">${esc(kickoff ? capitalize(DATE_SHORT.format(kickoff)) : 'À venir')}</span>
    </div>
    ${cote(affiche.awayId, affiche.away, true)}`;
}

/* ════════════════════════════════════════ Actualités ══ */

/** Les matchs porteurs d'un récit, du plus récent au plus ancien. */
function articleMatches(content) {
  return sortByDate(matchesOf(champOf(content)).filter((match) => match.title), -1);
}

function renderNews(content) {
  // La liste sert aussi de table d'index à la page Résultats : on la calcule
  // même quand la grille d'actualités n'est pas sur la page.
  state.articles = articleMatches(content);

  const grid = $('#news-grid');
  if (!grid) return;

  const champ = champOf(content);
  const nous = usId(content);
  // L'accueil n'en montre que six ; la page Résultats renvoie vers le récit.
  const items = state.articles.slice(0, 6);

  if (!items.length) {
    grid.innerHTML = '<p class="empty">Aucun récit de match pour le moment.</p>';
    return;
  }

  grid.innerHTML = items.map((match, index) => {
    const outcome = outcomeFor(match, nous);
    const score = isPlayed(match) ? `${match.homeScore} – ${match.awayScore}` : '';
    const date = parseDate(match.date);

    return `
      <article class="news-card" data-reveal style="--delay:${index * 70}ms">
        <div class="news-card__media">
          <img src="${esc(match.image || '/img/osa.png')}" alt="Affiche du match ${esc(matchSummary(champ, match))}" loading="lazy" decoding="async" width="600" height="600">
          ${outcome ? `<span class="badge badge--${outcome}">${OUTCOME_LABEL[outcome]}</span>` : ''}
          ${score ? `<span class="news-card__score">${esc(score)}</span>` : ''}
        </div>
        <div class="news-card__body">
          <p class="news-card__meta">
            ${match.competition ? `<span class="chip">${esc(match.competition)}</span>` : ''}
            ${involves(match, nous) ? `<span class="chip chip--soft">${match.homeId === nous ? 'Domicile' : 'Extérieur'}</span>` : ''}
            ${date ? `<span class="news-card__date">${esc(capitalize(DATE_LONG.format(date)))}</span>` : ''}
          </p>
          <h3 class="news-card__title">${esc(match.title)}</h3>
          <p class="news-card__excerpt">${esc(match.excerpt)}</p>
          <button class="link-btn" type="button" data-news="${index}">
            Lire la suite
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 5l7 7-7 7v-4H4v-6h9V5z"/></svg>
          </button>
        </div>
      </article>`;
  }).join('');

  initReveal(grid);
}

function openNewsModal(match) {
  if (!match) return;
  const content = state.content || {};
  const champ = champOf(content);
  const nous = usId(content);
  const outcome = outcomeFor(match, nous);
  const score = isPlayed(match) ? `${match.homeScore} – ${match.awayScore}` : '';
  const date = parseDate(match.date);

  modal.open(`
    <figure class="modal__figure">
      <img src="${esc(match.image || '/img/osa.png')}" alt="Affiche du match ${esc(matchSummary(champ, match))}" loading="lazy" decoding="async">
    </figure>
    <div class="modal__content">
      <p class="modal__meta">
        ${outcome ? `<span class="badge badge--${outcome}">${OUTCOME_LABEL[outcome]}</span>` : ''}
        ${match.competition ? `<span class="chip">${esc(match.competition)}</span>` : ''}
        ${involves(match, nous) ? `<span class="chip chip--soft">${match.homeId === nous ? 'À domicile' : "À l'extérieur"}</span>` : ''}
        ${date ? `<span class="news-card__date">${esc(capitalize(DATE_LONG.format(date)))}</span>` : ''}
      </p>
      <h2 class="modal__title" id="modal-title">${esc(match.title)}</h2>
      ${score ? `<p class="modal__score"><span>${esc(teamName(champ, match.homeId))} — ${esc(teamName(champ, match.awayId))}</span><strong>${esc(score)}</strong></p>` : ''}
      <div class="modal__text">${toParagraphs(match.body || match.excerpt)}</div>
      ${Array.isArray(match.scorers) && match.scorers.length ? `
        <div class="modal__scorers">
          <h3>Buteurs OSA</h3>
          <ul>${match.scorers.map((s) => `<li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 3.2 3.4 2.5-1.3 4H9.9l-1.3-4zM4.6 12.6l1.3-1 3.3 2.4-.6 4.1a8 8 0 0 1-4-5.5zm10.8 5.5-.6-4.1 3.3-2.4 1.3 1a8 8 0 0 1-4 5.5z"/></svg>${esc(s)}</li>`).join('')}</ul>
        </div>` : ''}
    </div>
  `);
}

/* ═════════════════════════════════════════ Classement ══ */

/**
 * Le tableau du championnat. Il n'est jamais saisi : chaque ligne se déduit des
 * scores entrés dans l'administration, ce qui interdit à la somme des colonnes
 * de contredire les résultats affichés juste à côté.
 */
function ladderHTML(content) {
  const champ = champOf(content);
  const rows = computeStandings(champ);
  if (!rows.length) {
    return soonState('Classement à venir',
      "Les clubs de la poule s'ajoutent depuis l'onglet « Championnat » de l'administration.");
  }

  const nous = usId(content);
  const entete = [
    ['J', 'Matchs joués'], ['G', 'Gagnés'], ['N', 'Nuls'], ['D', 'Perdus'],
    ['+/−', 'Buts marqués et encaissés'], ['DB', 'Différence de buts']
  ];

  return `
    <div class="table-scroll">
      <table class="ladder">
        <caption class="ladder__caption">
          ${esc(champ.title || 'Classement')}${champ.season ? ` — saison ${esc(champ.season)}` : ''}
        </caption>
        <thead>
          <tr>
            <th scope="col" class="ladder__rank">#</th>
            <th scope="col" class="ladder__club">Club</th>
            ${entete.map(([court, long]) => `<th scope="col"><abbr title="${esc(long)}">${court}</abbr></th>`).join('')}
            <th scope="col" class="ladder__pts">PTS</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr${row.id === nous ? ' class="is-us"' : ''}>
              <td class="ladder__rank">${row.rank}</td>
              <th scope="row" class="ladder__club">
                <span class="ladder__crest">${crestHTML(content, row.id, 48)}</span>
                <span class="ladder__name">${esc(row.team.name)}</span>
                ${row.penalty ? `<span class="ladder__penalty" title="Points de pénalité">−${row.penalty}</span>` : ''}
              </th>
              <td>${row.played}</td>
              <td>${row.won}</td>
              <td>${row.drawn}</td>
              <td>${row.lost}</td>
              <td class="ladder__goals">${row.goalsFor}<i aria-hidden="true">:</i>${row.goalsAgainst}</td>
              <td class="ladder__diff">${row.diff > 0 ? '+' : ''}${row.diff}</td>
              <td class="ladder__pts">${row.points}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderStandings(content) {
  const zones = ['#standings-grid', '#ladder-full'].map((sel) => $(sel)).filter(Boolean);
  if (!zones.length) return;
  const html = ladderHTML(content);
  zones.forEach((zone) => {
    zone.innerHTML = html;
    initReveal(zone);
  });
}

/* ══════════════════════════════════════════ Résultats ══ */

function resultRowHTML(content, match, groupe = '') {
  const champ = champOf(content);
  const nous = usId(content);
  const joue = isPlayed(match);
  const outcome = outcomeFor(match, nous);
  const recit = state.articles.indexOf(match);
  const quand = matchWhen(match);

  return `
    <li class="result${involves(match, nous) ? ' result--ours' : ''}${outcome ? ` result--${outcome}` : ''}">
      <span class="result__team result__team--home">
        <span class="result__name">${esc(teamName(champ, match.homeId))}</span>
        <span class="result__crest">${crestHTML(content, match.homeId, 48)}</span>
      </span>

      <span class="result__score">
        ${joue
          ? `<b>${match.homeScore}</b><i aria-hidden="true">–</i><b>${match.awayScore}</b>`
          : '<span class="result__soon">à venir</span>'}
      </span>

      <span class="result__team result__team--away">
        <span class="result__crest">${crestHTML(content, match.awayId, 48)}</span>
        <span class="result__name">${esc(teamName(champ, match.awayId))}</span>
      </span>

      <span class="result__meta">
        ${match.competition && match.competition !== groupe
          ? `<span class="chip chip--soft">${esc(match.competition)}</span>`
          : ''}
        ${quand ? `<span class="result__when">${esc(quand)}</span>` : ''}
        ${match.title && recit >= 0
          ? `<button class="link-btn" type="button" data-news="${recit}">Le récit</button>`
          : ''}
      </span>
    </li>`;
}

function renderResults(content) {
  const zone = $('#results-list');
  if (!zone) return;

  const groupes = matchesByDay(champOf(content));
  if (!groupes.length) {
    zone.innerHTML = soonState('Saison à venir',
      "Les rencontres s'ajoutent depuis l'onglet « Championnat » de l'administration.");
    return;
  }

  zone.innerHTML = groupes.map((groupe, index) => `
    <section class="matchday" data-reveal style="--delay:${index * 60}ms">
      <h3 class="matchday__title">${esc(groupe.label)}</h3>
      <ul class="matchday__list">
        ${groupe.matches.map((match) => resultRowHTML(content, match, groupe.label)).join('')}
      </ul>
    </section>`).join('');

  initReveal(zone);
}

/* ═══════════════════════════════════════════ Palmarès ══ */

const TROPHY = '<path d="M6 3h12v2h3v3a5 5 0 0 1-4.6 5A6 6 0 0 1 13 16.9V19h4v2H7v-2h4v-2.1a6 6 0 0 1-3.4-3.9A5 5 0 0 1 3 8V5h3V3zm0 4H5v1a3 3 0 0 0 1.2 2.4A8 8 0 0 1 6 8.5V7zm12 0v1.5a8 8 0 0 1-.2 1.9A3 3 0 0 0 19 8V7h-1z"/>';
const MEDAL = '<path d="M7 2h3l2.5 6.5L15 2h3l-3 7.4A6.5 6.5 0 1 1 9.9 9.3L7 2zm5 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/>';

function renderPalmares(content) {
  const zone = $('#palmares-list');
  if (!zone) return;

  const entries = Array.isArray(content.palmares?.entries) ? content.palmares.entries : [];
  zone.innerHTML = entries.length
    ? entries.map((entry, index) => `
        <article class="palmares-card${entry.highlight ? ' palmares-card--top' : ''}" data-reveal style="--delay:${index * 70}ms">
          <span class="palmares-card__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">${entry.highlight ? TROPHY : MEDAL}</svg>
          </span>
          <div class="palmares-card__body">
            ${entry.year ? `<p class="palmares-card__year">${esc(entry.year)}</p>` : ''}
            <h3 class="palmares-card__title">${esc(entry.title)}</h3>
            ${entry.competition || entry.rank ? `
              <p class="palmares-card__meta">
                ${entry.competition ? `<span class="chip">${esc(entry.competition)}</span>` : ''}
                ${entry.rank ? `<span class="chip chip--soft">${esc(entry.rank)}</span>` : ''}
              </p>` : ''}
            ${entry.description ? `<p class="palmares-card__text">${esc(entry.description)}</p>` : ''}
          </div>
          ${entry.image ? `<img class="palmares-card__photo" src="${esc(entry.image)}" alt="" loading="lazy" decoding="async">` : ''}
        </article>`).join('')
    : soonState('Palmarès à venir',
        "Les titres et les places du club s'ajoutent depuis l'onglet « Palmarès » de l'administration.");

  initReveal(zone);
}

/* ═════════════════════════════════════════ Chant du club ══ */

/** Sans paroles saisies, la section entière disparaît de la page. */
function renderAnthem(content) {
  const zone = $('#anthem-lyrics');
  if (!zone) return;

  const paroles = String(content.anthem?.lyrics || '').trim();
  const section = zone.closest('section');
  if (section) section.hidden = !paroles;

  zone.innerHTML = paroles
    ? paroles.split(/\n{2,}/).map((bloc) => bloc.trim()).filter(Boolean)
        .map((bloc) => `<p>${esc(bloc).replace(/\n/g, '<br>')}</p>`).join('')
    : '';
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
    key: 'gallery',
    grid: '#gallery-grid',
    count: '#gallery-count',
    fallbackAlt: 'Photo du club',
    emptyTitle: 'Galerie vide',
    emptyText: "Les premières photos du club seront publiées ici. Elles s'ajoutent depuis l'administration."
  },
  {
    // Aperçu de l'accueil : les six premières photos, dans l'ordre de la galerie.
    // Les index restent alignés sur le tableau complet, donc la visionneuse
    // ouvre bien la bonne photo.
    key: 'gallery',
    grid: '#gallery-preview',
    limit: 6,
    fallbackAlt: 'Photo du club',
    emptyTitle: 'Galerie vide',
    emptyText: 'Les premières photos du club seront publiées ici.'
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

  const toutes = Array.isArray(content[section.key]?.images) ? content[section.key].images : [];
  const images = section.limit ? toutes.slice(0, section.limit) : toutes;

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

  const count = section.count ? $(section.count) : null;
  if (count) {
    count.hidden = !toutes.length;
    count.textContent = `${toutes.length} photo${toutes.length > 1 ? 's' : ''}`;
  }

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
  // Le récit d'un match s'ouvre depuis l'accueil comme depuis les résultats.
  ['#news-grid', '#results-list'].forEach((selecteur) => {
    $(selecteur)?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-news]');
      if (!button) return;
      openNewsModal(state.articles[Number(button.dataset.news)]);
    });
  });

  IMAGE_SECTIONS.forEach((section) => {
    $(section.grid)?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-zoom]');
      if (!button) return;
      const images = state.content?.[button.dataset.zoom]?.images;
      openImageModal(images?.[Number(button.dataset.index)], section.fallbackAlt);
    });
  });

  ['#squad-grid', '#squad-spotlights'].forEach((selecteur) => {
    $(selecteur)?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-player]');
      if (button) openPlayer(button.dataset.player);
    });
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
  oops: '<path d="M12 2 1 21h22L12 2zm0 5.6 6.9 11.9H5.1L12 7.6zM11 10v5h2v-5h-2zm0 6v2h2v-2h-2z"/>',
  card: '<path d="M7.5 2h9A1.5 1.5 0 0 1 18 3.5v17a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20.5v-17A1.5 1.5 0 0 1 7.5 2z"/>',
  glove: '<path d="M6 9V4.5a1.5 1.5 0 0 1 3 0V8h.5V3.5a1.5 1.5 0 0 1 3 0V8h.5V4.5a1.5 1.5 0 0 1 3 0V9l1.6-1.1a1.6 1.6 0 0 1 2.2 2.3l-3.1 4.3V22H6.5v-7.6l-2-3.2A1.6 1.6 0 0 1 6 9z"/>',
  shirt: '<path d="m9 2 3 1.7L15 2l6 3.4-2.2 4.2-2.3-1.2V22H7.5V8.4L5.2 9.6 3 5.4 9 2z"/>',
  check: '<path d="M9.6 18.6 3.2 12.2l1.8-1.8 4.6 4.6L19 5.6l1.8 1.8z"/>'
};

/**
 * Une ligne de classement. `rank` est l'index 0-based.
 * Chaque ligne renvoie vers la fiche du joueur sur la page Effectif.
 */
function podiumRow(entry, rank, leader, unit) {
  const { player, value } = entry;
  const fill = Math.round((value / leader) * 100);
  const medal = rank < 3 ? ' podium__row--' + (rank + 1) : '';
  const name = fullName(player);

  return `
    <li>
      <a class="podium__row${medal}" href="/effectif#joueur-${encodeURIComponent(player.id)}">
        <span class="podium__rank">${rank + 1}</span>
        <span class="podium__avatar">
          ${player.photo
            ? `<img src="${esc(player.photo)}" alt="" loading="lazy" decoding="async" width="120" height="120">`
            : `<span class="podium__initial" aria-hidden="true">${esc(name.charAt(0))}</span>`}
        </span>
        <span class="podium__body">
          <span class="podium__name">${esc(name)}</span>
          <span class="podium__bar"><i style="--fill:${fill}%"></i></span>
        </span>
        <span class="podium__value">
          <b>${esc(value)}</b>
          <small>${esc(unit || '')}</small>
        </span>
      </a>
    </li>`;
}

/* ═══════════════════════════════════════════ Stade ══ */

/**
 * La carte Google n'est pas chargée d'emblée : l'afficher ouvre une connexion
 * aux serveurs de Google, qui peuvent y déposer des cookies. Un clic explicite
 * du visiteur vaut mieux qu'un traceur imposé — et la page se charge d'autant
 * plus vite pour ceux que le plan n'intéresse pas.
 */
let venueMapAccepted = false;

function renderVenue(content) {
  const zone = $('#venue-map');
  if (!zone) return;

  const adresse = content.club?.address || '';
  const embed = content.venue?.mapsEmbed || '';

  const itineraire = $('#venue-directions');
  if (itineraire) {
    itineraire.setAttribute('href', adresse
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adresse)}`
      : 'https://www.google.com/maps');
    itineraire.setAttribute('aria-label', `Itinéraire vers ${adresse || 'le stade'}`);
  }

  if (!embed) {
    zone.innerHTML = `
      <p class="venue__none">Le plan sera ajouté prochainement. En attendant, le bouton
        « Itinéraire » ouvre l'adresse dans votre application de cartes.</p>`;
    return;
  }

  if (venueMapAccepted) {
    showVenueMap(embed);
    return;
  }

  zone.innerHTML = `
    <button class="venue__consent" type="button" id="venue-load">
      <span class="venue__consent-ico" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M20.5 3.1 15 5 9 3 3.4 4.9a1 1 0 0 0-.7 1V20a.5.5 0 0 0 .7.5L9 18.5l6 2 5.6-1.9a1 1 0 0 0 .7-1V3.6a.5.5 0 0 0-.8-.5zM9 16.4 5 17.8V6.6l4-1.4v11.2zm6 2-4-1.4V5.6l4 1.4v11.4zm4-1.2-3 1V6.9l3-1v11.3z"/></svg>
      </span>
      <b>Afficher le plan du stade</b>
      <small>La carte est fournie par Google. En l'affichant, votre navigateur se
        connecte aux serveurs de Google, qui peuvent y déposer des cookies.</small>
    </button>`;
}

function showVenueMap(embed) {
  const zone = $('#venue-map');
  if (!zone || !embed) return;
  venueMapAccepted = true;
  zone.innerHTML = `
    <iframe class="venue__frame" src="${esc(embed)}" title="Plan du stade"
            loading="lazy" allowfullscreen
            referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
}

function initVenue() {
  $('#venue-map')?.addEventListener('click', (event) => {
    if (!event.target.closest('#venue-load')) return;
    showVenueMap(state.content?.venue?.mapsEmbed || '');
  });

  $('#venue-copy')?.addEventListener('click', async () => {
    const adresse = state.content?.club?.address || '';
    if (!adresse) return;
    const presse = window.navigator?.clipboard;
    try {
      if (!presse?.writeText) throw new Error('presse-papiers indisponible');
      await presse.writeText(adresse);
      toast("Adresse copiée !");
    } catch {
      // Sans presse-papiers, on montre l'adresse : elle reste sélectionnable.
      if (typeof window.prompt === 'function') window.prompt("Copiez l'adresse :", adresse);
      else toast(adresse);
    }
  });
}

/* ════════════════════════════════════════════ Effectif ══ */

const PLAYER_HASH = /^#joueur-(.+)$/;

function playerById(id) {
  return state.content?.squad?.players?.find((player) => player.id === id) || null;
}

/**
 * Les joueurs mis en avant, appariés à leur fiche. Une mise en avant qui
 * désigne un joueur disparu de l'effectif est simplement ignorée.
 */
function spotlightEntries(content) {
  const spots = Array.isArray(content.squad?.spotlights) ? content.squad.spotlights : [];
  const players = Array.isArray(content.squad?.players) ? content.squad.players : [];
  return spots
    .map((spot) => ({ spot, player: players.find((joueur) => joueur.id === spot.playerId) }))
    .filter((entry) => entry.player);
}

/** Bandeau « en forme / à surveiller », en tête de la page Effectif. */
function renderSpotlights(content) {
  const zone = $('#squad-spotlights');
  if (!zone) return;

  const entries = spotlightEntries(content);
  const bloc = zone.closest('[data-spotlights]') || zone;
  bloc.hidden = !entries.length;

  zone.innerHTML = entries.map(({ spot, player }, index) => `
    <article class="spotlight" data-reveal style="--delay:${index * 80}ms">
      ${playerCardHTML(player, { index, spotlight: spot })}
      ${spot.reason ? `<p class="spotlight__reason">${esc(spot.reason)}</p>` : ''}
    </article>`).join('');

  initReveal(zone);
}

/** Grille complète, page /effectif. */
function renderSquadGrid(content) {
  const grid = $('#squad-grid');
  if (!grid) return;

  const players = Array.isArray(content.squad?.players) ? content.squad.players : [];
  const { key, direction } = state.squadSort;
  const ordered = sortPlayers(players, key, direction);
  // Le fanion suit le joueur jusque dans la grille : on le retrouve au tri.
  const enAvant = new Map(spotlightEntries(content).map(({ spot, player }) => [player.id, spot]));

  grid.innerHTML = ordered.length
    ? ordered.map((player, index) =>
        playerCardHTML(player, { index, spotlight: enAvant.get(player.id) || null })).join('')
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
  const squad = Array.isArray(content.squad?.players) ? content.squad.players : [];

  if (!groups.length || !squad.length) {
    grid.innerHTML = soonState('Bientôt disponible', 'Les statistiques de la saison seront publiées ici.');
    initReveal(grid);
    return;
  }

  grid.innerHTML = groups.map((group, gIndex) => {
    // Tout l'effectif figure dans chaque classement : les compteurs à zéro
    // aussi. Du meilleur au moins bon, à égalité dans l'ordre de l'effectif.
    const values = group.values && typeof group.values === 'object' ? group.values : {};
    // Un classement peut être réservé à un poste : les arrêts, par exemple.
    const concernes = group.only ? squad.filter((player) => player.position === group.only) : squad;
    const players = concernes
      .map((player) => ({ player, value: Number(values[player.id]) || 0 }))
      .sort((a, b) => b.value - a.value);
    const leader = players.reduce((max, entry) => Math.max(max, entry.value), 0) || 1;

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
        ` : `<p class="stat-card__empty">${group.only
              ? 'Aucun joueur \u00e0 ce poste dans l&rsquo;effectif.'
              : 'Aucun joueur dans l&rsquo;effectif pour le moment.'}</p>`}
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
  renderFixture(content);
  // Doit précéder les résultats : c'est lui qui indexe les récits.
  renderNews(content);
  renderStandings(content);
  renderResults(content);
  renderPalmares(content);
  renderAnthem(content);
  renderSquadGrid(content);
  renderSpotlights(content);
  renderSquadStrip(content);
  refreshOpenPlayer();
  IMAGE_SECTIONS.forEach((section) => renderImageSection(content, section));
  renderStats(content);
  renderVenue(content);
  renderCompo(content);
  renderPacks(content);
  renderPronos(content);
  startCountdown(nextFixture(content).kickoff);
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
  initVenue();
  initCompo();
  initPacks();
  initPronos();
  window.addEventListener('hashchange', syncPlayerFromHash);

  render(cloneContent(DEFAULT_CONTENT));
  syncPlayerFromHash();

  const remote = await loadRemoteContent();
  if (remote) {
    render(deepMerge(cloneContent(DEFAULT_CONTENT), migrateContent(remote)));
    // Le joueur visé n'existait peut-être que dans le contenu distant.
    syncPlayerFromHash();
  }
}

boot();
