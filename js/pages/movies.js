import { boot, movieCard, showMessage } from '../ui.js';
import { searchMovies } from '../selectors.js';

const urlParams = new URLSearchParams(location.search);
let query = urlParams.get('q');
if (query === null) {
  query = '';
}
query = query.trim();

function renderMovies(context) {
  const app = context.app;
  const catalog = context.catalog;
  const snapshot = context.snapshot;
  const refresh = context.refresh;

  const heading = document.createElement('section');
  heading.className = 'page-heading';
  const title = document.createElement('h1');
  title.textContent = '영화 검색';
  heading.appendChild(title);
  const description = document.createElement('p');
  description.textContent = '영화 제목, 별칭, 배우 또는 감독 이름으로 검색할 수 있습니다.';
  heading.appendChild(description);

  const form = document.createElement('form');
  form.className = 'search-form';
  form.action = 'movies.html';
  const label = document.createElement('label');
  label.htmlFor = 'movie-search';
  label.textContent = '영화 검색';
  const input = document.createElement('input');
  input.id = 'movie-search';
  input.type = 'search';
  input.name = 'q';
  input.value = query;
  input.placeholder = '예: 달우1';
  input.setAttribute('aria-label', '영화 제목, 별칭, 배우 또는 감독');
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'button';
  submit.textContent = '검색';
  form.appendChild(label);
  form.appendChild(input);
  form.appendChild(submit);

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    try {
      query = input.value.trim();
      const params = new URLSearchParams();
      params.set('q', query);
      history.replaceState(null, '', 'movies.html?' + params.toString());
      await refresh();
    } catch (error) {
      showMessage(error.message || '검색 결과를 불러올 수 없습니다.', 'error');
    }
  });

  const results = searchMovies(catalog, query);
  const count = document.createElement('p');
  count.className = 'result-count';
  count.setAttribute('aria-live', 'polite');
  if (query === '') {
    count.textContent = '전체 영화 ' + results.length + '편';
  } else {
    count.textContent = '“' + query + '” 검색 결과 ' + results.length + '편';
  }

  const grid = document.createElement('div');
  grid.className = 'card-grid';
  const watched = new Set();
  for (const log of snapshot.logs) {
    watched.add(log.movie_id);
  }
  for (const movie of results) {
    const hasWatched = watched.has(movie.movie_id);
    const card = movieCard(catalog, movie, { watched: hasWatched });
    grid.appendChild(card);
  }

  if (results.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const emptyTitle = document.createElement('h2');
    emptyTitle.textContent = '검색 결과가 없습니다';
    empty.appendChild(emptyTitle);
    const emptyText = document.createElement('p');
    emptyText.textContent = '다른 제목·별칭·인물 이름으로 검색해 주세요. 검색어를 비우면 전체 영화가 표시됩니다.';
    empty.appendChild(emptyText);
    grid.appendChild(empty);
  }

  app.replaceChildren(heading, form, count, grid);
}

boot({
  page: 'movies',
  title: '영화 검색',
  render: renderMovies
});
