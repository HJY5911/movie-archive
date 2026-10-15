import { boot, el } from '../ui.js';
import { buildProjections } from '../selectors.js';

let mode = 'watched';
let selectedCode = null;

function toMapPosition(lat, lng) {
  const left = (lng + 180) / 360 * 100;
  const top = (90 - lat) / 180 * 100;
  return { left: left, top: top };
}

function moviesByCountry(catalog, logs) {
  if (mode === 'watched') {
    const projections = buildProjections(catalog, logs);
    return projections.country_movies;
  }

  const result = {};
  for (const row of catalog.MovieCountry) {
    if (result[row.country_code] === undefined) {
      result[row.country_code] = [];
    }
    result[row.country_code].push(row.movie_id);
  }
  return result;
}

function countLogsByMovie(logs) {
  const counts = {};
  for (const log of logs) {
    if (counts[log.movie_id] === undefined) {
      counts[log.movie_id] = 0;
    }
    counts[log.movie_id] += 1;
  }
  return counts;
}

function compareRanking(a, b) {
  const countOrder = b.movie_ids.length - a.movie_ids.length;
  if (countOrder !== 0) {
    return countOrder;
  }
  return a.country.name.localeCompare(b.country.name);
}

function renderMap(context) {
  const app = context.app;
  const catalog = context.catalog;
  const snapshot = context.snapshot;
  const refresh = context.refresh;

  const byCountry = moviesByCountry(catalog, snapshot.logs);
  const watchCounts = countLogsByMovie(snapshot.logs);

  const ranking = [];
  for (const country of catalog.Country) {
    const movieIds = byCountry[country.country_code];
    if (movieIds === undefined || movieIds.length === 0) {
      continue;
    }
    ranking.push({ country: country, movie_ids: movieIds });
  }
  ranking.sort(compareRanking);

  let maxCount = 1;
  if (ranking.length > 0) {
    maxCount = ranking[0].movie_ids.length;
  }

  const shownMovies = new Set();
  for (const entry of ranking) {
    for (const movieId of entry.movie_ids) {
      shownMovies.add(movieId);
    }
  }

  let selectedEntry = null;
  for (const entry of ranking) {
    if (entry.country.country_code === selectedCode) {
      selectedEntry = entry;
    }
  }
  if (selectedEntry === null && ranking.length > 0) {
    selectedEntry = ranking[0];
  }
  if (selectedEntry === null) {
    selectedCode = null;
  } else {
    selectedCode = selectedEntry.country.country_code;
  }

  const heading = el('div', { className: 'page-heading' });
  const pageTitle = el('h1', {}, '영화 지도');
  const description = el('p', { className: 'muted' }, '영화의 제작 국가를 지도 위의 핀으로 보여줍니다. 핀이 클수록 해당 국가의 영화가 많습니다.');
  heading.append(pageTitle, description);

  async function refreshMap(focusId) {
    try {
      await refresh();
    } catch (error) {
      return;
    }

    const target = document.getElementById(focusId);
    if (target !== null) {
      target.focus();
    }
  }

  function selectCountry(code, focusId) {
    selectedCode = code;
    return refreshMap(focusId);
  }

  function changeMode(nextMode) {
    mode = nextMode;
    selectedCode = null;
    return refreshMap('map-mode-' + nextMode);
  }

  function showWatched() {
    return changeMode('watched');
  }

  function showAll() {
    return changeMode('all');
  }

  const watchedButton = el('button', {
    id: 'map-mode-watched',
    type: 'button',
    className: 'button secondary'
  }, '감상한 영화');
  const allButton = el('button', {
    id: 'map-mode-all',
    type: 'button',
    className: 'button secondary'
  }, '등록된 전체 영화');
  watchedButton.setAttribute('aria-pressed', String(mode === 'watched'));
  allButton.setAttribute('aria-pressed', String(mode === 'all'));
  watchedButton.addEventListener('click', showWatched);
  allButton.addEventListener('click', showAll);

  const modeSwitch = el('div', { className: 'map-mode-switch', role: 'group', ariaLabel: '지도에 표시할 영화' });
  modeSwitch.append(watchedButton, allButton);

  const summary = el('p', { className: 'map-summary', ariaLive: 'polite' }, `${ranking.length}개 국가 · 영화 ${shownMovies.size}편`);

  const toolbar = el('div', { className: 'map-toolbar' });
  toolbar.append(modeSwitch, summary);

  const canvas = el('div', { className: 'map-canvas' });
  const mapImage = el('img', { src: 'assets/world-map.jpg', alt: '제작 국가 핀을 표시하는 세계 지도' });
  canvas.append(mapImage);

  for (const entry of ranking) {
    const country = entry.country;
    const count = entry.movie_ids.length;
    const position = toMapPosition(country.pin_lat, country.pin_lng);
    const size = 26 + Math.round(18 * count / maxCount);
    const pinId = 'map-pin-' + country.country_code;

    const pin = el('button', {
      id: pinId,
      type: 'button',
      className: 'map-pin',
      ariaLabel: `${country.name}, 영화 ${count}편`
    });
    pin.style.left = position.left + '%';
    pin.style.top = position.top + '%';
    pin.style.setProperty('--size', size + 'px');

    const pinHead = el('span', { className: 'map-pin-head' });
    const pinCount = el('span', { className: 'map-pin-count' }, String(count));
    pinHead.append(pinCount);
    const pinLabel = el('span', { className: 'map-pin-label' }, `${country.name} · ${count}편`);
    pin.append(pinHead, pinLabel);

    if (country.country_code === selectedCode) {
      pin.classList.add('selected');
      pin.setAttribute('aria-pressed', 'true');
    } else {
      pin.setAttribute('aria-pressed', 'false');
    }

    function selectPin() {
      return selectCountry(country.country_code, pinId);
    }
    pin.addEventListener('click', selectPin);
    canvas.append(pin);
  }

  const mapPanel = el('section', { className: 'map-panel' });
  const mapTitle = el('h2', {}, '세계 지도');
  mapPanel.append(mapTitle, toolbar, canvas);

  if (ranking.length === 0 && mode === 'watched') {
    const empty = el('div', { className: 'empty-state' });
    const emptyMessage = el('p', {}, '아직 감상 기록이 없어 지도에 표시할 핀이 없습니다.');
    const homeLink = el('a', { href: 'index.html', className: 'button' }, '메인 페이지로 이동');
    const allMoviesButton = el('button', { type: 'button', className: 'button secondary' }, '등록된 전체 영화로 보기');
    allMoviesButton.addEventListener('click', showAll);
    empty.append(emptyMessage, homeLink, allMoviesButton);
    mapPanel.append(empty);
  } else if (ranking.length === 0) {
    const emptyMessage = el('p', { className: 'empty-state compact' }, '제작 국가가 등록된 영화가 없습니다.');
    mapPanel.append(emptyMessage);
  }

  const layout = el('div', { className: 'map-layout' });
  layout.append(mapPanel);

  if (selectedEntry === null) {
    layout.classList.add('single');
    app.replaceChildren(heading, layout);
    return;
  }

  const countryPanel = el('section', { className: 'map-country-panel' });
  const countryTitle = el('h2', {}, selectedEntry.country.name);
  let countText = '등록된 영화 ' + selectedEntry.movie_ids.length + '편';
  if (mode === 'watched') {
    countText = '감상한 영화 ' + selectedEntry.movie_ids.length + '편';
  }
  const countryCount = el('p', { className: 'muted' }, countText);
  const movieList = el('ul', { className: 'map-movie-list' });

  for (const movieId of selectedEntry.movie_ids) {
    const movie = catalog.lookup.movieById.get(movieId);

    let posterUrl = 'assets/posters/placeholder.jpg';
    if (movie.poster_url !== null) {
      posterUrl = movie.poster_url;
    }
    let yearText = '개봉일 미등록';
    if (movie.release_date !== null) {
      yearText = movie.release_date.slice(0, 4);
    }
    let watchText = '감상 기록 없음';
    if (watchCounts[movieId] !== undefined) {
      watchText = '감상 ' + watchCounts[movieId] + '회';
    }

    const poster = el('img', { src: posterUrl, alt: movie.title + ' 포스터', loading: 'lazy' });
    const movieTitle = el('strong', {}, movie.title);
    const movieInfo = el('small', {}, `${yearText} · ${watchText}`);
    const text = el('span', { className: 'map-movie-text' });
    text.append(movieTitle, movieInfo);
    const link = el('a', { href: `movie.html?id=${encodeURIComponent(movieId)}` });
    link.append(poster, text);
    const item = el('li');
    item.append(link);
    movieList.append(item);
  }
  countryPanel.append(countryTitle, countryCount, movieList);

  const rankPanel = el('section', { className: 'map-rank-panel' });
  const rankTitle = el('h2', {}, '국가 순위');
  const rankList = el('ol', { className: 'map-rank-list' });

  for (const entry of ranking) {
    const country = entry.country;
    const count = entry.movie_ids.length;
    const rankId = 'map-rank-' + country.country_code;

    const rankButton = el('button', { id: rankId, type: 'button' });
    const rankName = el('span', { className: 'map-rank-name' }, country.name);
    const rankCount = el('span', { className: 'map-rank-count' }, count + '편');
    const rankBar = el('span', { className: 'map-rank-bar' });
    rankBar.style.width = (count / maxCount * 100) + '%';
    rankButton.append(rankName, rankCount, rankBar);

    if (country.country_code === selectedCode) {
      rankButton.classList.add('selected');
      rankButton.setAttribute('aria-pressed', 'true');
    } else {
      rankButton.setAttribute('aria-pressed', 'false');
    }

    function selectRank() {
      return selectCountry(country.country_code, rankId);
    }
    rankButton.addEventListener('click', selectRank);

    const rankItem = el('li');
    rankItem.append(rankButton);
    rankList.append(rankItem);
  }
  rankPanel.append(rankTitle, rankList);

  const side = el('div', { className: 'map-side' });
  side.append(countryPanel, rankPanel);
  layout.append(side);

  app.replaceChildren(heading, layout);
}

boot({
  page: 'map',
  title: '영화 지도',
  render: renderMap
});
