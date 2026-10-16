import { boot, el } from '../ui.js';
import { getSeriesProgress } from '../selectors.js';

const urlParams = new URLSearchParams(location.search);
let selectedId = urlParams.get('id');

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

function directorNames(catalog, movieId) {
  const names = [];
  for (const credit of catalog.MovieCredit) {
    if (credit.movie_id !== movieId || credit.role !== 'director') {
      continue;
    }
    const person = catalog.lookup.personById.get(credit.person_id);
    if (person !== undefined) {
      names.push(person.name);
    }
  }
  return names;
}

function formatRuntime(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return rest + '분';
  }
  if (rest === 0) {
    return hours + '시간';
  }
  return hours + '시간 ' + rest + '분';
}

function objectParticle(word) {
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xAC00 || code > 0xD7A3) {
    return '을(를)';
  }
  if ((code - 0xAC00) % 28 === 0) {
    return '를';
  }
  return '을';
}

function buildSteps(catalog, logs, seriesId) {
  const progress = getSeriesProgress(catalog, logs, seriesId);
  const steps = [];
  for (const row of progress) {
    const movie = catalog.lookup.movieById.get(row.movie_id);
    steps.push({
      order: row.release_order,
      watched: row.watched,
      movie: movie
    });
  }
  return steps;
}

function findNextStep(steps) {
  for (const step of steps) {
    if (!step.watched) {
      return step;
    }
  }
  return null;
}

function renderGuide(nextStep, steps, watchedCount) {
  const guide = el('section', { className: 'series-guide', ariaLive: 'polite' });
  const guideTitle = el('h3', {}, '다음에 볼 영화');
  guide.append(guideTitle);

  if (nextStep === null) {
    guide.classList.add('done');
    guide.append(el('p', {}, '시리즈를 모두 감상했습니다. 처음부터 다시 보며 놓친 장면을 찾아보세요.'));
    return guide;
  }

  const link = el('a', { href: `movie.html?id=${encodeURIComponent(nextStep.movie.movie_id)}` }, nextStep.movie.title);
  const sentence = el('p', { className: 'series-guide-next' });
  if (watchedCount === 0) {
    sentence.append(`${nextStep.order}편 `, link, '부터 시작하세요.');
  } else {
    sentence.append(`${nextStep.order}편 `, link, objectParticle(nextStep.movie.title) + ' 볼 차례입니다.');
  }
  guide.append(sentence);

  let skipped = false;
  for (const step of steps) {
    if (step.watched && step.order > nextStep.order) {
      skipped = true;
    }
  }
  if (skipped) {
    const warning = el('p', { className: 'series-warning' },
      `${nextStep.order}편을 건너뛰고 다음 편을 먼저 보셨어요. 이야기가 이어지므로 ${nextStep.order}편을 꼭 감상해 보세요.`);
    guide.append(warning);
  }
  return guide;
}

function renderStep(catalog, step, nextStep, watchCounts) {
  const movie = step.movie;

  let posterUrl = 'assets/posters/placeholder.jpg';
  if (movie.poster_url !== null) {
    posterUrl = movie.poster_url;
  }

  const info = [];
  if (movie.release_date !== null) {
    info.push(movie.release_date.slice(0, 4) + '년 개봉');
  } else {
    info.push('개봉일 미등록');
  }
  if (movie.runtime_min !== null) {
    info.push(formatRuntime(movie.runtime_min));
  }
  const directors = directorNames(catalog, movie.movie_id);
  if (directors.length > 0) {
    info.push('감독 ' + directors.join(', '));
  }

  let statusText = '아직 감상 전';
  if (step.watched) {
    statusText = '감상 완료 · ' + watchCounts[movie.movie_id] + '회';
  }

  const item = el('li', { className: 'series-step' });
  if (step.watched) {
    item.classList.add('watched');
  }
  const isNext = nextStep !== null && nextStep.order === step.order;
  if (isNext) {
    item.classList.add('next');
  }

  const number = el('span', { className: 'series-step-number', ariaHidden: 'true' }, String(step.order));
  const poster = el('img', { src: posterUrl, alt: movie.title + ' 포스터', loading: 'lazy' });

  const titleLink = el('a', { href: `movie.html?id=${encodeURIComponent(movie.movie_id)}` }, movie.title);
  const title = el('h3', {}, `${step.order}편 `, titleLink);
  const meta = el('p', { className: 'muted' }, info.join(' · '));
  const status = el('p', { className: 'series-status' }, statusText);
  if (isNext) {
    status.append(el('strong', { className: 'series-next-label' }, '다음 차례'));
  }

  const text = el('div', { className: 'series-step-text' });
  text.append(title, meta, status);

  item.append(number, poster, text);
  return item;
}

function renderSeries(context) {
  const app = context.app;
  const catalog = context.catalog;
  const snapshot = context.snapshot;
  const refresh = context.refresh;

  const heading = el('div', { className: 'page-heading' });
  heading.append(
    el('h1', {}, '시리즈 시청 순서'),
    el('p', { className: 'muted' }, '앞 작품을 봐야 이해할 수 있는 시리즈 영화를 어떤 순서로 보면 되는지 알려 드립니다.')
  );

  if (catalog.Series.length === 0) {
    const empty = el('div', { className: 'empty-state' }, el('p', {}, '등록된 시리즈가 없습니다.'));
    app.replaceChildren(heading, empty);
    return;
  }

  if (!catalog.lookup.seriesById.has(selectedId)) {
    selectedId = catalog.Series[0].series_id;
  }

  const watchCounts = countLogsByMovie(snapshot.logs);

  async function selectSeries(seriesId) {
    selectedId = seriesId;
    history.replaceState(null, '', 'series.html?id=' + encodeURIComponent(seriesId));
    try {
      await refresh();
    } catch (error) {
      return;
    }
    const target = document.getElementById('series-tab-' + seriesId);
    if (target !== null) {
      target.focus();
    }
  }

  const listPanel = el('section', { className: 'series-list-panel' });
  listPanel.append(el('h2', {}, '시리즈 목록'));
  const list = el('ul', { className: 'series-list' });
  for (const series of catalog.Series) {
    const steps = buildSteps(catalog, snapshot.logs, series.series_id);
    let watched = 0;
    for (const step of steps) {
      if (step.watched) {
        watched += 1;
      }
    }
    const button = el('button', { id: 'series-tab-' + series.series_id, type: 'button' });
    button.append(
      el('span', { className: 'series-list-name' }, series.name),
      el('span', { className: 'series-list-count' }, `${watched} / ${steps.length}편`)
    );
    button.setAttribute('aria-pressed', String(series.series_id === selectedId));
    button.addEventListener('click', function () {
      return selectSeries(series.series_id);
    });
    list.append(el('li', {}, button));
  }
  listPanel.append(list);

  const series = catalog.lookup.seriesById.get(selectedId);
  const steps = buildSteps(catalog, snapshot.logs, selectedId);
  const nextStep = findNextStep(steps);

  let watchedCount = 0;
  let totalMinutes = 0;
  let leftMinutes = 0;
  let unknownRuntime = false;
  for (const step of steps) {
    if (step.watched) {
      watchedCount += 1;
    }
    if (step.movie.runtime_min === null) {
      unknownRuntime = true;
      continue;
    }
    totalMinutes += step.movie.runtime_min;
    if (!step.watched) {
      leftMinutes += step.movie.runtime_min;
    }
  }

  const detail = el('section', { className: 'series-detail' });
  detail.append(el('h2', {}, series.name));
  if (series.description) {
    detail.append(el('p', { className: 'muted' }, series.description));
  }

  if (steps.length === 0) {
    detail.append(
      el('p', { className: 'empty-state compact' },
        '이 시리즈에 등록된 작품이 없습니다.')
    );

    const layout = el('div', { className: 'series-layout' });
    layout.append(listPanel, detail);
    app.replaceChildren(heading, layout);
    return;
  }
  
  const percent = Math.round(watchedCount / steps.length * 100);
  
  const progressLabel = el('p', { className: 'series-progress-label' }, `${steps.length}편 중 ${watchedCount}편 감상 (${percent}%)`);
  const progressBar = el('div', { className: 'series-progress', role: 'progressbar' });
  progressBar.setAttribute('aria-valuemin', '0');
  progressBar.setAttribute('aria-valuemax', String(steps.length));
  progressBar.setAttribute('aria-valuenow', String(watchedCount));
  progressBar.setAttribute('aria-label', '시리즈 감상 진행률');
  const progressFill = el('span');
  progressFill.style.width = percent + '%';
  progressBar.append(progressFill);

  let runtimeText = `전체 ${formatRuntime(totalMinutes)}`;
  if (leftMinutes > 0) {
    runtimeText += ` · 남은 시간 ${formatRuntime(leftMinutes)}`;
  }
  if (unknownRuntime) {
    runtimeText += ' (상영 시간 미등록 작품 제외)';
  }
  const runtime = el('p', { className: 'muted' }, runtimeText);

  const guide = renderGuide(nextStep, steps, watchedCount);

  const order = el('ol', { className: 'series-steps', ariaLabel: series.name + ' 시청 순서' });
  for (const step of steps) {
    order.append(renderStep(catalog, step, nextStep, watchCounts));
  }

  detail.append(progressLabel, progressBar, runtime, guide, el('h3', { className: 'series-steps-title' }, '시청 순서'), order);

  const layout = el('div', { className: 'series-layout' });
  layout.append(listPanel, detail);
  app.replaceChildren(heading, layout);
}

boot({
  page: 'series',
  title: '시리즈 시청 순서',
  render: renderSeries
});
