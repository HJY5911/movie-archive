import { boot, el } from '../ui.js';
import { buildProjections } from '../selectors.js';

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

function percentOf(count, total) {
  if (total === 0) {
    return 0;
  }
  return count / total * 100;
}

function compareByCount(a, b) {
  if (b.count !== a.count) {
    return b.count - a.count;
  }
  return a.order - b.order;
}

function compareByName(a, b) {
  if (b.count !== a.count) {
    return b.count - a.count;
  }
  return a.name.localeCompare(b.name, 'ko');
}

function compareByTitle(a, b) {
  if (b.count !== a.count) {
    return b.count - a.count;
  }
  return a.movie.title.localeCompare(b.movie.title, 'ko');
}

function compareNumbers(a, b) {
  return a - b;
}

function rankBuckets(items, buckets, idKey) {
  const rows = [];
  let order = 0;
  for (const item of items) {
    const count = buckets[item[idKey]].count;
    if (count > 0) {
      rows.push({ name: item.name, count: count, order: order });
    }
    order += 1;
  }
  rows.sort(compareByCount);
  return rows;
}

function ratingColumns(projections) {
  const columns = [];
  for (let i = 1; i <= 10; i += 1) {
    const rating = i / 2;
    const count = projections.by_rating[String(rating)].count;
    columns.push({
      count: count,
      label: rating.toFixed(1),
      year: '',
      spoken: '별점 ' + rating.toFixed(1) + '점 ' + count + '회'
    });
  }
  return columns;
}

function monthColumns(projections, today) {
  const columns = [];
  for (let back = 11; back >= 0; back -= 1) {
    const date = new Date(today.getFullYear(), today.getMonth() - back, 1);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const key = year + '-' + String(month).padStart(2, '0');
    let count = 0;
    if (projections.by_month[key] !== undefined) {
      count = projections.by_month[key];
    }
    let yearText = '';
    if (back === 11 || month === 1) {
      yearText = String(year);
    }
    columns.push({
      count: count,
      label: month + '월',
      year: yearText,
      spoken: year + '년 ' + month + '월 ' + count + '회'
    });
  }
  return columns;
}

function topPeople(catalog, watchedIds, role) {
  const movieSets = {};
  for (const credit of catalog.MovieCredit) {
    if (credit.role !== role || !watchedIds.has(credit.movie_id)) {
      continue;
    }
    if (movieSets[credit.person_id] === undefined) {
      movieSets[credit.person_id] = new Set();
    }
    movieSets[credit.person_id].add(credit.movie_id);
  }

  const people = [];
  for (const personId of Object.keys(movieSets)) {
    const person = catalog.lookup.personById.get(personId);
    people.push({ name: person.name, count: movieSets[personId].size });
  }
  people.sort(compareByName);
  return people.slice(0, 3);
}

function decadeRows(catalog, watchedIds) {
  const decades = [];
  const counts = {};
  let unknown = 0;
  for (const movie of catalog.Movie) {
    if (!movie.release_date) {
      if (watchedIds.has(movie.movie_id)) {
        unknown += 1;
      }
      continue;
    }
    const year = Number(movie.release_date.slice(0, 4));
    const decade = Math.floor(year / 10) * 10;
    if (counts[decade] === undefined) {
      counts[decade] = 0;
      decades.push(decade);
    }
    if (watchedIds.has(movie.movie_id)) {
      counts[decade] += 1;
    }
  }
  decades.sort(compareNumbers);

  const rows = [];
  for (const decade of decades) {
    rows.push({ name: decade + '년대', count: counts[decade] });
  }
  return { rows: rows, unknown: unknown };
}

function rewatchedMovies(catalog, logs) {
  const counts = countLogsByMovie(logs);
  const rows = [];
  for (const movieId of Object.keys(counts)) {
    if (counts[movieId] >= 2) {
      rows.push({ movie: catalog.lookup.movieById.get(movieId), count: counts[movieId] });
    }
  }
  rows.sort(compareByTitle);
  return rows.slice(0, 3);
}

function numberValue(number, unit) {
  return el('dd', { className: 'stats-card-value' }, el('strong', {}, String(number)), el('small', {}, unit));
}

function runtimeValue(minutes) {
  const value = el('dd', { className: 'stats-card-value' });
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours > 0) {
    value.append(el('strong', {}, String(hours)), el('small', {}, '시간'));
  }
  if (hours > 0 && rest > 0) {
    value.append(' ');
  }
  if (hours === 0 || rest > 0) {
    value.append(el('strong', {}, String(rest)), el('small', {}, '분'));
  }
  return value;
}

function ratingValue(average) {
  if (average === null) {
    return el('dd', { className: 'stats-card-value stats-card-none' }, '별점 기록 없음');
  }
  const star = el('span', { className: 'stats-star', ariaHidden: 'true' }, '★');
  return el('dd', { className: 'stats-card-value' }, star, ' ', el('strong', {}, average.toFixed(1)));
}

function summaryCard(label, value, note) {
  const card = el('div', { className: 'stats-card' });
  card.append(el('dt', {}, label), value);
  if (note !== '') {
    card.append(el('dd', { className: 'stats-card-note' }, note));
  }
  return card;
}

function renderSummary(catalog, projections, logs) {
  let countryCount = 0;
  for (const country of catalog.Country) {
    if (projections.by_country[country.country_code].count > 0) {
      countryCount += 1;
    }
  }

  let unknownRuntime = false;
  for (const log of logs) {
    if (catalog.lookup.movieById.get(log.movie_id).runtime_min === null) {
      unknownRuntime = true;
    }
  }
  let runtimeNote = '재관람 포함';
  if (unknownRuntime) {
    runtimeNote = '재관람 포함 · 상영 시간 미등록 영화 제외';
  }

  let ratingNote = '';
  if (projections.rated_count > 0) {
    ratingNote = '별점 ' + projections.rated_count + '회 기준';
  }

  const list = el('dl', { className: 'stats-summary' });
  list.append(
    summaryCard('감상한 영화', numberValue(projections.unique_movie_count, '편'), '등록된 ' + catalog.Movie.length + '편 중'),
    summaryCard('감상 횟수', numberValue(projections.watch_count, '회'), '재관람 포함'),
    summaryCard('총 감상 시간', runtimeValue(projections.runtime_total), runtimeNote),
    summaryCard('평균 별점', ratingValue(projections.rating_average), ratingNote),
    summaryCard('본 장르', numberValue(projections.genre_count, '개'), '전체 ' + catalog.Genre.length + '개 중'),
    summaryCard('본 나라', numberValue(countryCount, '개'), '전체 ' + catalog.Country.length + '개 중')
  );

  const section = el('section', { className: 'stats-summary-section', ariaLabel: '감상 요약' });
  section.append(list);
  return section;
}

function makeSection(id, title, extra) {
  const titleId = id + '-title';
  const section = el('section', { id: id, className: 'stats-section' });
  section.setAttribute('aria-labelledby', titleId);
  const head = el('div', { className: 'section-heading' }, el('h2', { id: titleId }, title));
  if (extra !== null) {
    head.append(extra);
  }
  section.append(head);
  return section;
}

function renderBarList(rows, label, showShare) {
  let total = 0;
  let maxCount = 0;
  for (const row of rows) {
    total += row.count;
    if (row.count > maxCount) {
      maxCount = row.count;
    }
  }

  const list = el('ul', { className: 'stats-bars', ariaLabel: label });
  for (const row of rows) {
    const name = el('span', { className: 'stats-bar-name' }, row.name);
    const fill = el('span', { className: 'stats-bar-fill' });
    fill.style.width = percentOf(row.count, maxCount) + '%';
    const track = el('span', { className: 'stats-bar-track', ariaHidden: 'true' }, fill);
    const value = el('span', { className: 'stats-bar-value' }, el('strong', {}, row.count + '편'));
    if (showShare) {
      value.append(' · ' + Math.round(percentOf(row.count, total)) + '%');
    }
    list.append(el('li', { className: 'stats-bar-row' }, name, track, value));
  }
  return list;
}

function renderColumns(columns, label, extraClass) {
  let maxCount = 0;
  for (const column of columns) {
    if (column.count > maxCount) {
      maxCount = column.count;
    }
  }

  const list = el('ol', { className: 'stats-columns ' + extraClass, ariaLabel: label });
  for (const column of columns) {
    const count = el('span', { className: 'stats-column-count' }, String(column.count));
    const bar = el('span', { className: 'stats-column-bar' }, count);
    bar.style.height = percentOf(column.count, maxCount) + '%';
    const plot = el('span', { className: 'stats-column-plot', ariaHidden: 'true' }, bar);

    const name = el('span', { className: 'stats-column-label', ariaHidden: 'true' }, column.label);
    if (column.year !== '') {
      name.append(el('span', { className: 'stats-column-year' }, column.year));
    }
    const spoken = el('span', { className: 'visually-hidden' }, column.spoken);

    const item = el('li', { className: 'stats-column' }, plot, name, spoken);
    if (column.count === 0) {
      item.classList.add('stats-column-zero');
    }
    list.append(item);
  }
  return list;
}

function renderGenreSection(catalog, projections) {
  const section = makeSection('stats-genre', '장르 비율', null);
  const rows = rankBuckets(catalog.Genre, projections.by_genre, 'genre_id');
  if (rows.length === 0) {
    section.append(el('p', { className: 'muted' }, '감상한 영화에 등록된 장르가 없습니다.'));
    return section;
  }
  section.append(
    renderBarList(rows, '장르별 감상한 영화 수와 비율', true),
    el('p', { className: 'stats-note' }, '한 영화가 여러 장르에 속하면 장르마다 한 번씩 셉니다.')
  );
  return section;
}

function renderRatingSection(projections) {
  const section = makeSection('stats-rating', '별점 분포', null);
  const unrated = projections.watch_count - projections.rated_count;

  const caption = el('p', { className: 'stats-caption' });
  if (projections.rating_average !== null) {
    const star = el('span', { className: 'stats-star', ariaHidden: 'true' }, '★');
    caption.append('평균 ', star, ' ', el('strong', {}, projections.rating_average.toFixed(1)), ' · 별점 남긴 기록 ' + projections.rated_count + '회');
    if (unrated > 0) {
      caption.append(' · 별점 없는 기록 ' + unrated + '회');
    }
    section.append(caption, renderColumns(ratingColumns(projections), '별점별 기록 수', 'stats-ratings'));
    return section;
  }

  caption.append('별점 없는 기록 ' + unrated + '회');
  section.append(caption, el('p', { className: 'muted' }, '감상 기록에 별점을 남기면 분포가 여기에 나타납니다.'));
  return section;
}

function renderCountrySection(catalog, projections) {
  const mapLink = el('a', { href: 'map.html', className: 'text-link' }, '지도에서 보기');
  const section = makeSection('stats-country', '나라 비율', mapLink);
  const rows = rankBuckets(catalog.Country, projections.by_country, 'country_code');
  if (rows.length === 0) {
    section.append(el('p', { className: 'muted' }, '감상한 영화에 등록된 제작 국가가 없습니다.'));
    return section;
  }
  section.append(
    renderBarList(rows, '나라별 감상한 영화 수와 비율', true),
    el('p', { className: 'stats-note' }, '여러 나라가 함께 만든 영화는 나라마다 한 번씩 셉니다.')
  );
  return section;
}

function renderMonthSection(projections) {
  const section = makeSection('stats-month', '월별 감상 수', null);
  const columns = monthColumns(projections, new Date());
  let total = 0;
  for (const column of columns) {
    total += column.count;
  }
  const caption = el('p', { className: 'stats-caption' }, '최근 12개월 동안 ', el('strong', {}, total + '회'), ' 감상');
  section.append(caption, renderColumns(columns, '최근 12개월 월별 감상 수', 'stats-months'));
  return section;
}

function renderPeopleGroup(title, people, emptyText) {
  const group = el('div', { className: 'stats-people-group' });
  group.append(el('h3', {}, title));
  if (people.length === 0) {
    group.append(el('p', { className: 'muted' }, emptyText));
    return group;
  }

  const list = el('ol', { className: 'stats-rank-list' });
  let rank = 0;
  let position = 0;
  let previousCount = -1;
  for (const person of people) {
    position += 1;
    if (person.count !== previousCount) {
      rank = position;
      previousCount = person.count;
    }
    const number = el('span', { className: 'stats-rank-number', ariaHidden: 'true' }, String(rank));
    const spokenRank = el('span', { className: 'visually-hidden' }, rank + '위');
    const link = el('a', { href: 'movies.html?q=' + encodeURIComponent(person.name) }, person.name);
    const count = el('span', { className: 'stats-rank-count' }, person.count + '편');
    list.append(el('li', {}, number, spokenRank, link, count));
  }
  group.append(list);
  return group;
}

function renderPeopleSection(catalog, watchedIds) {
  const section = makeSection('stats-people', '가장 많이 본 감독·배우', null);
  const groups = el('div', { className: 'stats-people-groups' });
  groups.append(
    renderPeopleGroup('감독', topPeople(catalog, watchedIds, 'director'), '감상한 영화에 등록된 감독이 없습니다.'),
    renderPeopleGroup('배우', topPeople(catalog, watchedIds, 'actor'), '감상한 영화에 등록된 배우가 없습니다.')
  );
  section.append(groups, el('p', { className: 'stats-note' }, '감상한 영화 중 참여한 작품 수입니다. 이름을 누르면 참여한 영화를 검색합니다.'));
  return section;
}

function renderDecadeSection(catalog, watchedIds) {
  const section = makeSection('stats-decade', '개봉 연대별 감상', null);
  const result = decadeRows(catalog, watchedIds);
  if (result.rows.length === 0) {
    section.append(el('p', { className: 'muted' }, '개봉일이 등록된 영화가 없습니다.'));
    return section;
  }
  section.append(renderBarList(result.rows, '개봉 연대별 감상한 영화 수', false));
  let noteText = '감상한 영화를 개봉 연도의 10년 단위로 묶었습니다.';
  if (result.unknown > 0) {
    noteText += ' 개봉일이 등록되지 않은 영화 ' + result.unknown + '편은 빼고 셉니다.';
  }
  section.append(el('p', { className: 'stats-note' }, noteText));
  return section;
}

function renderRewatchSection(catalog, logs) {
  const section = makeSection('stats-rewatch', '가장 많이 다시 본 영화', null);
  const rows = rewatchedMovies(catalog, logs);
  if (rows.length === 0) {
    section.append(el('p', { className: 'muted' }, '아직 두 번 이상 본 영화가 없습니다.'));
    return section;
  }

  const list = el('ol', { className: 'stats-rewatch-list' });
  for (const row of rows) {
    const movie = row.movie;
    let posterUrl = 'assets/posters/placeholder.jpg';
    if (movie.poster_url !== null) {
      posterUrl = movie.poster_url;
    }
    const poster = el('img', { src: posterUrl, alt: '', loading: 'lazy' });
    const title = el('strong', {}, movie.title);
    const count = el('small', {}, row.count + '회 감상');
    const text = el('span', { className: 'stats-rewatch-text' }, title, count);
    const link = el('a', { href: 'movie.html?id=' + encodeURIComponent(movie.movie_id) }, poster, text);
    list.append(el('li', {}, link));
  }
  section.append(list);
  return section;
}

function renderEmpty() {
  const empty = el('section', { className: 'empty-state' });
  empty.append(
    el('h2', {}, '아직 감상 기록이 없습니다'),
    el('p', {}, '영화 상세 페이지에서 감상 기록을 남기면 장르·별점·나라별 통계가 여기에 나타납니다.'),
    el('a', { href: 'index.html', className: 'btn btn-link' }, '메인에서 예시 기록 넣기'),
    el('a', { href: 'movies.html', className: 'btn btn-link' }, '영화 검색')
  );
  return empty;
}

function renderStats(context) {
  const app = context.app;
  const catalog = context.catalog;
  const snapshot = context.snapshot;

  const heading = el('div', { className: 'page-heading' });
  heading.append(
    el('h1', {}, '감상 통계'),
    el('p', { className: 'muted' }, '감상 기록을 장르·별점·나라·시기별로 모아 보여줍니다.')
  );

  if (snapshot.logs.length === 0) {
    app.replaceChildren(heading, renderEmpty());
    return;
  }

  const projections = buildProjections(catalog, snapshot.logs);
  const watchedIds = new Set();
  for (const log of snapshot.logs) {
    watchedIds.add(log.movie_id);
  }

  const layout = el('div', { className: 'stats-layout' });
  layout.append(
    renderGenreSection(catalog, projections),
    renderRatingSection(projections),
    renderCountrySection(catalog, projections),
    renderMonthSection(projections),
    renderPeopleSection(catalog, watchedIds),
    renderDecadeSection(catalog, watchedIds),
    renderRewatchSection(catalog, snapshot.logs)
  );

  app.replaceChildren(heading, renderSummary(catalog, projections, snapshot.logs), layout);
}

boot({
  page: 'stats',
  title: '감상 통계',
  render: renderStats
});
