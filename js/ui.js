import { loadCatalog, openRepository, readSnapshot } from './repository.js';
import { createParticleText } from './effects/particle-text.js';
import { createSonarGrid } from './effects/sonar-grid.js';

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;

    if (key === 'dataset' || key === 'style') Object.assign(node[key], value);

    else if (key in node) node[key] = value;

    else node.setAttribute(key, String(value));
  }

  for (const child of children.flat(Infinity)) {
    if (child !== null && child !== undefined) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  return node;
}

let messageTimer;

export function showMessage(text, type = 'success') {
  const region = document.querySelector('#messages');

  clearTimeout(messageTimer);

  region.className = `toast ${type}`;
  region.textContent = text;
  region.hidden = false;

  messageTimer = setTimeout(() => { region.hidden = true; }, type === 'error' ? 12000 : 6000);
}

export function movieCard(catalog, movie, { watched = false } = {}) {
  const genres = catalog.MovieGenre
    .filter(row => row.movie_id === movie.movie_id)
    .map(row => catalog.lookup.genreById.get(row.genre_id).name);

  const card = document.createElement('article');
  card.className = 'movie-card card';

  const poster = document.createElement('img');
  poster.className = 'movie-card-poster card-img-top';
  poster.src = movie.poster_url || 'assets/posters/placeholder.jpg';
  poster.alt = '';
  poster.loading = 'lazy';
  card.appendChild(poster);

  const body = document.createElement('div');
  body.className = 'card-body';
  card.appendChild(body);

  const heading = document.createElement('h3');
  heading.className = 'card-title';
  const link = document.createElement('a');
  link.className = 'stretched-link';
  link.href = `movie.html?id=${encodeURIComponent(movie.movie_id)}`;
  link.textContent = movie.title;
  heading.appendChild(link);
  body.appendChild(heading);

  const details = document.createElement('p');
  details.className = 'movie-card-meta';
  let yearText = '개봉일 미등록';
  if (movie.release_date) {
    yearText = movie.release_date.slice(0, 4);
  }
  let runtimeText = '상영 시간 미등록';
  if (movie.runtime_min !== null) {
    runtimeText = `${movie.runtime_min}분`;
  }
  details.textContent = `${yearText} · ${runtimeText}`;
  body.appendChild(details);

  if (genres.length > 0) {
    const genreLine = document.createElement('p');
    genreLine.className = 'movie-card-genres';
    genreLine.textContent = genres.join(' · ');
    body.appendChild(genreLine);
  }

  if (watched) {
    const watchedNote = document.createElement('p');
    watchedNote.className = 'movie-card-watched badge';
    watchedNote.textContent = '감상한 영화';
    body.appendChild(watchedNote);
  }
  return card;
}

const navigation = [
  ['index', '메인'], ['movies', '영화 검색'], ['calendar', '캘린더'],
  ['stats', '통계'], ['achievements', '업적'], ['archive', '사진 보관함'],
  ['series', '시리즈'], ['map', '지도']
];

function isFirstBrandView() {
  let first = false;
  try {
    if (sessionStorage.getItem('filmlog-brand-gathered') === null) {
      sessionStorage.setItem('filmlog-brand-gathered', 'yes');
      first = true;
    }
  } catch (error) {
    first = false;
  }
  return first;
}

function mountBrandParticles(brand, word) {
  const layer = el('span', { className: 'brand-particles-layer' });
  word.append(layer);
  let intro = 'none';
  if (isFirstBrandView()) {
    intro = 'gather';
  }

  function readFontSize() {
    return parseFloat(getComputedStyle(word).fontSize);
  }

  function showParticles() {
    brand.classList.add('brand-particles-ready');
  }

  const style = getComputedStyle(word);
  createParticleText(layer, {
    segments: [{ text: 'FILM', color: '#FFFFFF' }, { text: 'LOG', color: '#FF5A00' }],
    fontFamily: style.fontFamily,
    fontWeight: 400,
    fontSize: readFontSize,
    letterSpacing: parseFloat(style.letterSpacing) || 0,
    step: 1.5,
    particleSize: 1,
    intro: intro,
    scatter: 14,
    gatherDuration: 900,
    stagger: 450,
    pointerRepel: 4,
    repelRadius: 16,
    clickBurst: false,
    highlightColor: '#FF5A00',
    onReady: showParticles
  });
}

const SONAR_QUIET_TARGETS = 'a, button, input, select, textarea, label, summary, dialog, [role], [tabindex]:not([tabindex="-1"]), [contenteditable], img, video, canvas, iframe, .intro, .map-canvas';

function mountSonarGrid() {
  const tokens = getComputedStyle(document.documentElement);
  const layer = el('div', { className: 'site-sonar' });
  layer.setAttribute('aria-hidden', 'true');
  document.body.prepend(layer);
  createSonarGrid(layer, {
    color: tokens.getPropertyValue('--color-ink').trim(),
    ringColor: tokens.getPropertyValue('--color-orange').trim(),
    spacing: 26,
    dotRadius: 1.1,
    baseOpacity: 0.16,
    peakOpacity: 0.42,
    amplitude: 1.1,
    ringWidth: 90,
    speed: 260,
    pingEvery: 6,
    pingRest: 3,
    maxRings: 4,
    pingArea: [0.1, 0.15, 0.9, 0.85],
    pingSource: document,
    ignoreSelector: SONAR_QUIET_TARGETS,
    watch: document.querySelector('.main-wrap')
  });
}

function mountDataCredit() {
  const footer = document.querySelector('footer');
  if (footer === null) {
    return;
  }
  const link = el('a', { className: 'text-reset text-decoration-underline', href: 'https://www.themoviedb.org', target: '_blank', rel: 'noopener' }, 'TMDB(themoviedb.org)');
  footer.append(el('p', { className: 'small mt-2' }, '포스터·영화 정보 일부 출처: ', link, ' · 이 사이트는 TMDB의 승인·인증을 받지 않았습니다.'));
}

function mountShell(page) {
  const nav = el('nav', { className: 'navbar navbar-expand site-navbar', ariaLabel: '주 메뉴', dataset: { bsTheme: 'dark' } });
  const shell = el('div', { className: 'container-xl' });
  const word = el('span', { className: 'brand-particles-word' }, 'FILM', el('span', { className: 'navbar-brand-accent' }, 'LOG'));
  const brand = el('a', { className: 'navbar-brand', href: 'index.html' }, word);
  const list = el('ul', { className: 'navbar-nav' });
  for (const [key, title] of navigation) {
    const active = key === page || page === 'movie' && key === 'movies';
    let linkClass = 'nav-link';
    if (active) {
      linkClass = 'nav-link active';
    }
    const link = el('a', { className: linkClass, href: `${key}.html` }, title);
    if (active) {
      link.append(el('span', { className: 'visually-hidden' }, ' (현재)'));
      link.setAttribute('aria-current', 'page');
    }
    list.append(el('li', { className: 'nav-item' }, link));
  }
  shell.append(brand, list);
  nav.append(shell);
  document.querySelector('#sidebar').replaceChildren(nav);
  mountBrandParticles(brand, word);
  mountSonarGrid();

  const topbar = document.querySelector('#topbar');
  topbar.replaceChildren(el('p', {}, '저장 위치: 현재 브라우저'));
  const messages = document.querySelector('#messages');
  if (messages) topbar.append(messages);
  mountDataCredit();
}

export async function boot({ page, title, render }) {
  document.title = title;
  mountShell(page);
  const app = document.querySelector('#app');
  app.append(el('div', { className: 'empty-state' }, '데이터를 불러오는 중입니다.'));

  let cleanup;
  let queue = Promise.resolve();

  try {
    const [catalog, repo] = await Promise.all([loadCatalog(), openRepository()]);

    const refresh = () => {
      queue = queue.catch(() => {}).then(async () => {
        const snapshot = await readSnapshot(repo);

        if (typeof cleanup === 'function') cleanup();
        cleanup = undefined;

        cleanup = await render({ app, catalog, repo, snapshot, refresh });
      }).catch(error => {
        showMessage(error.message || '화면을 불러올 수 없습니다.', 'error');
        throw error;
      });

      return queue;
    };

    await refresh();

    const refreshQuietly = () => refresh().catch(() => {});

    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshQuietly(); });

    addEventListener('pageshow', event => { if (event.persisted) refreshQuietly(); });

    addEventListener('pagehide', () => { if (typeof cleanup === 'function') cleanup(); });
  } catch (error) {
    app.replaceChildren(el('section', { className: 'empty-state' },
      el('h1', {}, '페이지를 불러올 수 없습니다'),
      el('p', {}, error.message),
      el('p', { className: 'muted' }, '위 오류 내용을 확인한 뒤 다시 시도해 주세요.'),
      el('button', { className: 'btn btn-link', onclick: () => location.reload() }, '다시 시도')
    ));
  }
}
