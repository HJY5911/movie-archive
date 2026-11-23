import { boot, el } from '../ui.js';

// 이 문장만 바꾸면 페이지 제목 아래의 안내 문구가 바뀝니다.
const INTRO_TEXT = '무엇을 볼지 고민될 때, 영화 한 편을 뽑아 보세요.';

// 탭을 옮겼다가 돌아와 화면이 갱신되어도 방금 뽑은 영화는 유지합니다.
// 페이지를 새로 열거나 새로고침하면 처음부터 시작합니다.
let selectedMovieId = null;

function chooseMovie(movies, previousId) {
  if (movies.length === 0) return null;
  const candidates = movies.length > 1
    ? movies.filter(movie => movie.movie_id !== previousId)
    : movies;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function genreNames(catalog, movieId) {
  return catalog.MovieGenre
    .filter(row => row.movie_id === movieId)
    .map(row => catalog.lookup.genreById.get(row.genre_id)?.name)
    .filter(Boolean);
}

function createMovieResult(catalog, movie, watched) {
  const title = movie.title || '제목 미등록';
  const poster = el('img', {
    className: 'pick-poster',
    src: movie.poster_url || 'assets/posters/placeholder.jpg',
    alt: `${title} 포스터`,
    width: 200,
    height: 300
  });
  // 외부 포스터뿐 아니라 잘못된 로컬 경로도 기본 이미지로 바꿉니다.
  poster.addEventListener('error', () => {
    const fallback = new URL('assets/posters/placeholder.jpg', location.href).href;
    if (poster.src !== fallback) poster.src = fallback;
  }, { once: true });

  const year = movie.release_date ? `${movie.release_date.slice(0, 4)}년` : '개봉일 미등록';
  const runtime = Number.isFinite(movie.runtime_min) && movie.runtime_min > 0
    ? `${movie.runtime_min}분` : '상영 시간 미등록';
  const genres = genreNames(catalog, movie.movie_id);
  const copy = el('div', { className: 'pick-result-copy' },
    el('p', { className: 'pick-eyebrow' }, 'TODAY’S PICK'),
    el('h2', { id: 'pick-movie-title' }, title),
    el('p', { className: 'pick-meta' }, `${year} · ${runtime}`),
    el('p', { className: 'pick-genres' }, genres.length ? genres.join(' · ') : '장르 미등록'),
    watched ? el('p', { className: 'pick-watched' }, '감상 기록이 있는 영화') : null,
    el('p', { className: 'pick-overview' }, movie.overview || '등록된 줄거리가 없습니다.'),
    el('a', {
      className: 'btn btn-link pick-detail-link',
      href: `movie.html?id=${encodeURIComponent(movie.movie_id)}`
    }, '상세 보기', el('span', { ariaHidden: 'true' }, ' →'))
  );
  return el('article', {
    className: 'pick-movie',
    'aria-labelledby': 'pick-movie-title',
    dataset: { movieId: movie.movie_id }
  }, poster, copy);
}

function createWaitingResult(hasMovies) {
  return el('div', { className: 'pick-waiting' },
    el('div', { className: 'pick-ticket', ariaHidden: 'true' },
      el('span', {}, 'FILMLOG'),
      el('strong', {}, '?'),
      el('span', {}, 'ONE MOVIE · YOUR DAY')
    ),
    el('h2', {}, hasMovies ? '오늘의 한 편은 무엇일까요?' : '아직 등록된 영화가 없어요'),
    el('p', {}, hasMovies
      ? '영화 뽑기 버튼을 누르면 여기에 표시됩니다.'
      : '영화 데이터가 추가되면 이곳에서 뽑을 수 있습니다.')
  );
}

function renderPicker({ app, catalog, snapshot }) {
  const movies = catalog.Movie;
  let selected = movies.find(movie => movie.movie_id === selectedMovieId) || null;
  if (!selected) selectedMovieId = null;
  const watchedIds = new Set(snapshot.logs.map(log => log.movie_id));

  const heading = el('section', { className: 'page-heading' },
    el('h1', {}, '오늘 볼 영화 뽑기'),
    el('p', {}, INTRO_TEXT)
  );
  const result = el('div', { className: 'pick-result', id: 'pick-result' });
  // 결과 전체를 반복해서 읽는 대신, 선택한 영화 제목만 알려줍니다.
  const announcement = el('p', {
    className: 'visually-hidden', role: 'status', ariaLive: 'polite', ariaAtomic: 'true'
  });
  const button = el('button', {
    className: 'btn btn-primary pick-button', type: 'button', 'aria-controls': 'pick-result'
  });
  const hint = el('p', { className: 'pick-hint' });
  const controls = el('section', { className: 'pick-controls', 'aria-labelledby': 'pick-control-title' },
    el('p', { className: 'pick-eyebrow' }, 'LET CHANCE CHOOSE'),
    el('h2', { id: 'pick-control-title' }, '고민은 잠깐, ', el('br'), '선택은 가볍게.'),
    el('p', { className: 'pick-count' }, '등록된 영화 ', el('strong', {}, `${movies.length}편`), ' 중 한 편을 골라 드려요.'),
    button,
    hint
  );

  function paintResult() {
    result.replaceChildren(selected
      ? createMovieResult(catalog, selected, watchedIds.has(selected.movie_id))
      : createWaitingResult(movies.length > 0));
    button.disabled = movies.length === 0 || (movies.length === 1 && selected !== null);
    button.textContent = movies.length === 0 ? '영화가 없습니다'
      : movies.length === 1 && selected ? '한 편을 모두 확인했어요'
      : selected ? '다시 뽑기' : '영화 뽑기';
    hint.textContent = movies.length === 0 ? '등록된 영화가 있어야 뽑을 수 있어요.'
      : movies.length === 1 ? '현재 한 편만 등록되어 있어요.'
      : selected ? '다시 뽑으면 방금 나온 영화는 제외해요.' : '어떤 영화가 나올지 버튼을 눌러 확인하세요.';
  }

  button.addEventListener('click', () => {
    const next = chooseMovie(movies, selectedMovieId);
    if (!next) return;
    selected = next;
    selectedMovieId = next.movie_id;
    paintResult();
    announcement.textContent = `오늘 뽑은 영화는 ${next.title || '제목 미등록'}입니다.`;
  });

  paintResult();
  const note = el('p', { className: 'pick-note' },
    '이미 감상한 영화도 뽑힐 수 있어요. 뽑기만으로 감상 기록이 저장되지는 않습니다.'
  );
  app.replaceChildren(heading, el('div', { className: 'pick-layout' }, controls, result), note, announcement);
}

boot({ page: 'pick', title: '오늘 볼 영화 뽑기', render: renderPicker });
