import { loadCatalog, openRepository, readSnapshot } from './repository.js';

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
  card.className = 'movie-card';

  const heading = document.createElement('h3');
  const link = document.createElement('a');
  link.href = `movie.html?id=${encodeURIComponent(movie.movie_id)}`;
  link.textContent = movie.title;
  heading.appendChild(link);
  card.appendChild(heading);

  const details = document.createElement('p');
  details.textContent = `개봉: ${movie.release_date ?? '미등록'} / 장르: ${genres.join(', ')} / 상영 시간: ${movie.runtime_min === null ? '미등록' : `${movie.runtime_min}분`}`;
  card.appendChild(details);

  if (watched) {
    const watchedNote = document.createElement('p');
    watchedNote.textContent = '감상한 영화';
    card.appendChild(watchedNote);
  }
  return card;
}

const navigation = [
  ['index', '메인'], ['movies', '영화 검색'], ['calendar', '캘린더'],
  ['stats', '통계'], ['achievements', '업적'], ['archive', '사진 보관함'],
  ['series', '시리즈'], ['map', '지도']
];

function mountShell(page) {
  const nav = el('nav', { ariaLabel: '주 메뉴' });
  const list = el('ul');
  for (const [key, title] of navigation) {
    const active = key === page || page === 'movie' && key === 'movies';
    const link = el('a', { href: `${key}.html` }, `${title}${active ? ' (현재)' : ''}`);
    if (active) link.setAttribute('aria-current', 'page');
    list.append(el('li', {}, link));
  }
  nav.append(list);
  document.querySelector('#sidebar').replaceChildren(nav);

  const topbar = document.querySelector('#topbar');
  topbar.replaceChildren(el('p', {}, '저장 위치: 현재 브라우저'));
  const messages = document.querySelector('#messages');
  if (messages) topbar.append(messages);
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
      el('button', { className: 'button', onclick: () => location.reload() }, '다시 시도')
    ));
  }
}
