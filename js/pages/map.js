import { boot, el } from '../ui.js';
import { buildProjections } from '../selectors.js';
import { createCrosshair } from '../effects/crosshair.js';
import { arrangeMapPins } from '../map-layout.js';

let mode = 'watched';
let selectedCode = null;
let crosshairResume = null;

function toMapPosition(lat, lng) {
  const left = (lng + 180) / 360 * 100;
  const top = (90 - lat) / 180 * 100;
  return { left: left, top: top };
}

function toLatLng(leftRatio, topRatio) {
  const lng = leftRatio * 360 - 180;
  const lat = 90 - topRatio * 180;
  return { lat: lat, lng: lng };
}

function formatDegree(value, positive, negative) {
  let direction = positive;
  if (value < 0) {
    direction = negative;
  }
  return Math.abs(value).toFixed(1) + '°' + direction;
}

function mapReadout(leftRatio, topRatio, head) {
  if (head !== null) {
    const pin = head.closest('.map-pin');
    const label = pin.querySelector('.map-pin-label');
    if (label !== null) {
      return label.textContent;
    }
    return pin.getAttribute('aria-label');
  }
  const point = toLatLng(leftRatio, topRatio);
  return formatDegree(point.lat, 'N', 'S') + ' ' + formatDegree(point.lng, 'E', 'W');
}

function cssColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function startCrosshair(stage) {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    return undefined;
  }
  const crosshair = createCrosshair(stage, {
    className: 'map-crosshair',
    color: cssColor('--color-ink'),
    lockColor: cssColor('--color-orange'),
    thickness: 1,
    opacity: 0.45,
    gap: 10,
    smoothing: 0.2,
    targetSelector: '.map-pin-head',
    readout: mapReadout,
    clickPulse: true,
    resume: crosshairResume
  });
  crosshairResume = null;

  function stopCrosshair() {
    crosshairResume = crosshair.destroy();
  }
  return stopCrosshair;
}

const labelSides = ['below', 'right', 'left', 'above', 'below-right', 'below-left', 'above-right', 'above-left'];
const labelGap = 4;

function pinBox(position) {
  return {
    left: position.x - position.size / 2 - 2,
    right: position.x + position.size / 2 + 2,
    top: position.y - position.size / 2 - 2,
    bottom: position.y + position.size * 0.707 + 2
  };
}

function labelBox(side, position, width, height) {
  const half = position.size / 2;
  const corner = position.size * 0.36 + labelGap;
  let left = position.x - width / 2;
  let top = position.y + position.size * 0.707 + labelGap;
  if (side === 'above') {
    top = position.y - half - labelGap - height;
  }
  if (side === 'right') {
    left = position.x + half + labelGap;
    top = position.y - height / 2;
  }
  if (side === 'left') {
    left = position.x - half - labelGap - width;
    top = position.y - height / 2;
  }
  if (side === 'below-right' || side === 'above-right') {
    left = position.x + corner;
  }
  if (side === 'below-left' || side === 'above-left') {
    left = position.x - corner - width;
  }
  if (side === 'below-right' || side === 'below-left') {
    top = position.y + corner;
  }
  if (side === 'above-right' || side === 'above-left') {
    top = position.y - corner - height;
  }
  return { left: left, right: left + width, top: top, bottom: top + height };
}

function boxesOverlap(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function lineCrossesBox(line, box) {
  for (let step = 0; step <= 20; step += 1) {
    const x = line.x1 + (line.x2 - line.x1) * step / 20;
    const y = line.y1 + (line.y2 - line.y1) * step / 20;
    if (x > box.left && x < box.right && y > box.top && y < box.bottom) {
      return true;
    }
  }
  return false;
}

function distanceToBox(x, y, box) {
  const dx = Math.max(box.left - x, 0, x - box.right);
  const dy = Math.max(box.top - y, 0, y - box.bottom);
  return Math.hypot(dx, dy);
}

function labelCost(box, own, positions, width, obstacles, lines) {
  const ownDistance = distanceToBox(own.x, own.y, box);
  let cost = 0;
  if (box.left < 0 || box.top < 0 || box.right > width || box.bottom > width / 2) {
    cost += 10000;
  }
  for (const other of obstacles) {
    if (boxesOverlap(box, other)) {
      cost += 1000;
    }
  }
  for (const other of positions) {
    if (other !== own && distanceToBox(other.x, other.y, box) < ownDistance) {
      cost += 100;
    }
  }
  for (const line of lines) {
    if (lineCrossesBox(line, box)) {
      cost += 10;
    }
  }
  return cost;
}

function moveLabel(label, side, box, position) {
  const buttonLeft = position.x - position.size / 2;
  const buttonTop = position.y - position.size / 2;
  label.style.top = (box.top - buttonTop) + 'px';
  if (side === 'below' || side === 'above') {
    return;
  }
  label.style.transform = 'none';
  if (side === 'left' || side === 'below-left' || side === 'above-left') {
    label.style.left = 'auto';
    label.style.right = (buttonLeft + position.size - box.right) + 'px';
    return;
  }
  label.style.left = (box.left - buttonLeft) + 'px';
}

function compareFreeSides(a, b) {
  return a.freeSides - b.freeSides;
}

function placeLabels(spreadPositions, positions, pinByCode, width, obstacles, lines) {
  const jobs = [];
  for (const position of spreadPositions) {
    const label = pinByCode[position.code].button.querySelector('.map-pin-label');
    const job = { position: position, label: label, width: label.offsetWidth, height: label.offsetHeight, freeSides: 0 };
    for (const side of labelSides) {
      if (labelCost(labelBox(side, position, job.width, job.height), position, positions, width, obstacles, lines) < 100) {
        job.freeSides += 1;
      }
    }
    jobs.push(job);
  }
  jobs.sort(compareFreeSides);

  for (const job of jobs) {
    let bestSide = labelSides[0];
    let bestBox = null;
    let bestCost = Infinity;
    for (const side of labelSides) {
      const box = labelBox(side, job.position, job.width, job.height);
      const cost = labelCost(box, job.position, positions, width, obstacles, lines);
      if (cost < bestCost) {
        bestSide = side;
        bestBox = box;
        bestCost = cost;
      }
    }
    moveLabel(job.label, bestSide, bestBox, job.position);
    obstacles.push(bestBox);
  }
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
  const description = el('p', { className: 'muted' }, '영화의 제작 국가를 지도 위의 핀으로 보여줍니다. 핀을 누르면 그 국가의 영화 목록을 볼 수 있습니다.');
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
    className: 'btn btn-link'
  }, '감상한 영화');
  const allButton = el('button', {
    id: 'map-mode-all',
    type: 'button',
    className: 'btn btn-link'
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
  const svgNamespace = 'http://www.w3.org/2000/svg';
  const connections = document.createElementNS(svgNamespace, 'svg');
  connections.setAttribute('class', 'map-connections');
  connections.setAttribute('aria-hidden', 'true');
  canvas.append(connections);
  const pins = [];
  const pinByCode = {};

  for (const entry of ranking) {
    const country = entry.country;
    const count = entry.movie_ids.length;
    const position = toMapPosition(country.pin_lat, country.pin_lng);
    const pinId = 'map-pin-' + country.country_code;

    const pin = el('button', {
      id: pinId,
      type: 'button',
      className: 'map-pin',
      ariaLabel: `${country.name}, 영화 ${count}편`
    });
    pin.style.left = position.left + '%';
    pin.style.top = position.top + '%';

    const pinHead = el('span', { className: 'map-pin-head' });
    const pinCount = el('span', { className: 'map-pin-count' }, ` · ${count}편`);
    const pinLabel = el('span', { className: 'map-pin-label' }, country.name, pinCount);
    pin.append(pinHead, pinLabel);
    const pinInfo = { code: country.country_code, left: position.left, top: position.top, size: 0, button: pin };
    pins.push(pinInfo);
    pinByCode[country.country_code] = pinInfo;

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

  function positionPins() {
    let width = Math.max(560, viewport.getBoundingClientRect().width);
    for (const pin of pins) {
      pin.size = pin.button.offsetWidth;
    }
    let positions = arrangeMapPins(pins, width, width / 2);
    while (positions === null) {
      width += 80;
      positions = arrangeMapPins(pins, width, width / 2);
    }
    canvas.style.width = width + 'px';
    connections.setAttribute('viewBox', '0 0 ' + width + ' ' + width / 2);
    connections.replaceChildren();
    const obstacles = [];
    const lines = [];
    const spreadPositions = [];
    for (const position of positions) {
      const pin = pinByCode[position.code];
      const tipY = position.y + position.size * 0.707;
      pin.button.style.left = position.x + 'px';
      pin.button.style.top = tipY + 'px';
      const label = pin.button.querySelector('.map-pin-label');
      pin.button.classList.remove('map-pin-spread');
      label.removeAttribute('style');
      obstacles.push(pinBox(position));
      if (Math.hypot(position.x - position.anchorX, tipY - position.anchorY) < 1) {
        if (position.code === selectedCode) {
          obstacles.push(labelBox('below', position, label.offsetWidth, label.offsetHeight));
        }
        continue;
      }
      pin.button.classList.add('map-pin-spread');
      spreadPositions.push(position);
      lines.push({ x1: position.anchorX, y1: position.anchorY, x2: position.x, y2: tipY });
      obstacles.push({ left: position.anchorX - 5, right: position.anchorX + 5, top: position.anchorY - 5, bottom: position.anchorY + 5 });
      const line = document.createElementNS(svgNamespace, 'line');
      line.setAttribute('x1', position.anchorX);
      line.setAttribute('y1', position.anchorY);
      line.setAttribute('x2', position.x);
      line.setAttribute('y2', tipY);
      const dot = document.createElementNS(svgNamespace, 'circle');
      dot.setAttribute('cx', position.anchorX);
      dot.setAttribute('cy', position.anchorY);
      dot.setAttribute('r', '3');
      if (position.code === selectedCode) {
        line.classList.add('selected');
        dot.classList.add('selected');
      }
      connections.append(line, dot);
    }
    placeLabels(spreadPositions, positions, pinByCode, width, obstacles, lines);
  }

  function startMapEffects() {
    positionPins();
    const observer = new ResizeObserver(positionPins);
    observer.observe(viewport);
    const stopCrosshair = startCrosshair(canvas);

    function stopMapEffects() {
      observer.disconnect();
      if (stopCrosshair !== undefined) {
        stopCrosshair();
      }
    }
    return stopMapEffects;
  }

  const viewport = el('div', { className: 'map-viewport', tabIndex: 0, role: 'region', ariaLabel: '세계 지도. 좁은 화면에서는 좌우로 스크롤할 수 있습니다.' });
  viewport.append(canvas);
  const mapPanel = el('section', { className: 'map-panel' });
  const mapTitle = el('h2', {}, '세계 지도');
  const mapHelp = el('p', { className: 'map-help' }, '가까운 핀은 펼쳐서 국가 이름과 함께 표시합니다. 연결선 끝의 점이 실제 국가 위치입니다. 지도가 잘리면 좌우로 스크롤하세요.');
  mapPanel.append(mapTitle, toolbar, viewport, mapHelp);

  if (ranking.length === 0 && mode === 'watched') {
    const empty = el('div', { className: 'empty-state' });
    const emptyMessage = el('p', {}, '아직 감상 기록이 없어 지도에 표시할 핀이 없습니다.');
    const homeLink = el('a', { href: 'index.html', className: 'btn btn-link' }, '메인 페이지로 이동');
    const allMoviesButton = el('button', { type: 'button', className: 'btn btn-link' }, '등록된 전체 영화로 보기');
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
    return startMapEffects();
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
  return startMapEffects();
}

boot({
  page: 'map',
  title: '영화 지도',
  render: renderMap
});
