export function normalizeSearch(text) {
  if (typeof text !== 'string') throw new TypeError('검색어는 문자열이어야 합니다.');

  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

function lookup(catalog, name, table, id) {
  return catalog.lookup?.[name] ?? new Map(catalog[table].map(row => [row[id], row]));
}

export function searchMovies(catalog, query) {
  const key = normalizeSearch(query);
  const people = lookup(catalog, 'personById', 'Person', 'person_id');

  return catalog.Movie.filter(movie => {
    if (!key) return true;

    const candidates = [movie.title];

    for (const alias of catalog.MovieAlias) {
      if (alias.movie_id === movie.movie_id) candidates.push(alias.alias);
    }

    for (const credit of catalog.MovieCredit) {
      if (credit.movie_id === movie.movie_id) candidates.push(people.get(credit.person_id)?.name);
    }

    return candidates.some(value => typeof value === 'string' && normalizeSearch(value).includes(key));
  });
}

function compareLogs(a, b) {
  const dateOrder = b.watched_on.localeCompare(a.watched_on);

  if (dateOrder !== 0) {
    return dateOrder;
  }

  const createdOrder = b.created_at.localeCompare(a.created_at);
  if (createdOrder !== 0) {
    return createdOrder;
  }

  return a.log_id.localeCompare(b.log_id);
}

export function getHomeSummary(catalog, logs) {
  const movies = lookup(catalog, 'movieById', 'Movie', 'movie_id');

  const watched = new Set();

  let runtime_total = 0;

  for (const log of logs) {
    const movie = movies.get(log.movie_id);

    if (!movie) {
      throw new Error(`기록이 참조하는 영화가 없습니다: ${log.movie_id}`);
    }

    watched.add(log.movie_id);

    if (movie.runtime_min !== null) {
      runtime_total += movie.runtime_min;
    }
  }

  return {
    unique_movie_count: watched.size,
    watch_count: logs.length,
    runtime_total: runtime_total
  };
}

export function groupLogsByDay(logs) {
  const sortedLogs = logs.slice();

  sortedLogs.sort(compareLogs);

  const by_day = {};
  for (const log of sortedLogs) {
    const day = log.watched_on;

    if (by_day[day] === undefined || by_day[day] === null) {
      by_day[day] = [];
    }

    by_day[day].push(log);
  }

  return by_day;
}

function relationIndex(rows, valueKey) {
  const result = new Map();
  for (const row of rows) {
    if (!result.has(row.movie_id)) result.set(row.movie_id, new Set());
    result.get(row.movie_id).add(row[valueKey]);
  }
  return result;
}

export function buildProjections(catalog, logs) {
  const movies = lookup(catalog, 'movieById', 'Movie', 'movie_id');
  const movieGenres = relationIndex(catalog.MovieGenre, 'genre_id');
  const movieCountries = relationIndex(catalog.MovieCountry, 'country_code');

  const by_month = {};

  const by_rating = {};

  for (let i = 1; i <= 10; i++) {
    const rating = i / 2;
    const key = String(rating);

    by_rating[key] = { count: 0, ratio: 0 };
  }

  const by_genre = {};
  for (const genre of catalog.Genre) {
    by_genre[genre.genre_id] = { count: 0, ratio: 0 };
  }

  const by_country = {};
  for (const country of catalog.Country) {
    by_country[country.country_code] = { count: 0, ratio: 0 };
  }

  const country_movies = {};

  const watched = new Set();
  const genres = new Set();

  let rated_count = 0;
  let ratingTotal = 0;

  const sortedLogs = logs.slice();
  sortedLogs.sort(compareLogs);
  for (const log of sortedLogs) {
    const movie = movies.get(log.movie_id);
    if (!movie) throw new Error(`기록이 참조하는 영화가 없습니다: ${log.movie_id}`);
    watched.add(log.movie_id);

    const month = log.watched_on.slice(0, 7);
    if (by_month[month] === undefined || by_month[month] === null) {
      by_month[month] = 0;
    }
    by_month[month] += 1;

    if (log.rating !== null) {
      const bucket = by_rating[String(log.rating)];
      if (!bucket) throw new Error(`기록의 평점이 올바르지 않습니다: ${log.log_id}`);
      bucket.count += 1;
      rated_count += 1;
      ratingTotal += log.rating;
    }
  }

  const summary = getHomeSummary(catalog, sortedLogs);

  const by_day = groupLogsByDay(sortedLogs);

  for (const movie of catalog.Movie) {
    if (!watched.has(movie.movie_id)) continue;

    for (const genreId of movieGenres.get(movie.movie_id) ?? []) {
      genres.add(genreId);
      if (!by_genre[genreId]) throw new Error(`알 수 없는 장르입니다: ${genreId}`);
      by_genre[genreId].count += 1;
    }

    for (const code of movieCountries.get(movie.movie_id) ?? []) {
      if (!by_country[code]) throw new Error(`알 수 없는 국가입니다: ${code}`);
      by_country[code].count += 1;
      if (country_movies[code] === undefined || country_movies[code] === null) {
        country_movies[code] = [];
      }
      country_movies[code].push(movie.movie_id);
    }
  }

  const unique_movie_count = summary.unique_movie_count;
  const runtime_total = summary.runtime_total;

  const percent = (count, total) => total === 0 ? 0 : count / total * 100;

  for (const bucket of Object.values(by_rating)) bucket.ratio = percent(bucket.count, rated_count);
  for (const bucket of Object.values(by_genre)) bucket.ratio = percent(bucket.count, unique_movie_count);
  for (const bucket of Object.values(by_country)) bucket.ratio = percent(bucket.count, unique_movie_count);

  const metrics = { unique_movie_count, runtime_total, genre_count: genres.size };

  const achievements = catalog.AchievementRule.map(rule => {
    if (!Object.hasOwn(metrics, rule.metric)) throw new Error(`지원하지 않는 업적 지표입니다: ${rule.metric}`);
    const current = metrics[rule.metric];
    return {
      rule_id: rule.rule_id,
      metric: rule.metric,
      label: rule.label,
      target: rule.target,
      current,
      progress: Math.max(0, Math.min(100, current / rule.target * 100)),
      achieved: current >= rule.target
    };
  });

  return {
    unique_movie_count,
    watch_count: summary.watch_count,
    runtime_total,
    rated_count,
    rating_average: rated_count === 0 ? null : ratingTotal / rated_count,
    genre_count: genres.size,
    by_day,
    by_month,
    by_rating,
    by_genre,
    by_country,
    country_movies,
    achievements
  };
}

export function getSeriesProgress(catalog, logs, series_id) {
  const series = lookup(catalog, 'seriesById', 'Series', 'series_id');
  if (!series.has(series_id)) throw new Error('존재하지 않는 시리즈입니다.');
  const movies = lookup(catalog, 'movieById', 'Movie', 'movie_id');

  const watched = new Set(logs.map(log => log.movie_id));

  return catalog.SeriesMovie
    .filter(row => row.series_id === series_id)
    .sort((a, b) => a.release_order - b.release_order)
    .map(row => ({
      movie_id: row.movie_id,
      title: movies.get(row.movie_id).title,
      release_order: row.release_order,
      watched: watched.has(row.movie_id)
    }));
}
