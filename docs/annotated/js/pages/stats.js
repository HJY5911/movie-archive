/*
 * stats.js — 내 감상 기록을 여러 기준으로 모아 보여주는 통계 페이지
 *
 * 이 파일에서 하는 일:
 * 1. 감상 요약 카드 6개를 만듦: 감상한 영화 수, 감상 횟수, 총 감상 시간, 평균 별점, 본 장르 수, 본 나라 수.
 * 2. 장르 비율(중간 보고서에서 계획한 핵심 기능)을 가로 막대로 보여줌. 비율은 장르 개수의 합을 100%로 놓고 계산함.
 * 3. 별점 분포(0.5~5.0점)와 최근 12개월의 월별 감상 수를 세로 막대로 보여줌.
 * 4. 나라 비율, 개봉 연대별 감상 수를 가로 막대로 보여줌.
 * 5. 가장 많이 본 감독·배우 3명씩과 가장 많이 다시 본 영화 3편을 목록으로 보여줌.
 * 6. 감상 기록이 하나도 없으면 그래프 대신 안내 상자와 이동 링크만 보여줌.
 *
 * 이 페이지는 기록을 읽기만 함. 기록 추가·수정·삭제는 movie.html(movie.js)에서 함.
 * 장르·별점·나라·월별 개수는 selectors.js의 buildProjections()가 계산한 값을 그대로 씀.
 * 감독·배우, 개봉 연대, 다시 본 영화처럼 buildProjections()에 없는 값만 이 파일에서 catalog 자료로 직접 셈.
 * 공용 파일(ui.js, selectors.js, common.css, catalog.json)은 수정하지 않음.
 *
 * 화면의 막대 길이는 CSS의 width/height(%)로만 그림. 그림(canvas)이나 그래프 라이브러리는 쓰지 않음.
 * 그래서 모든 숫자가 글자로도 화면에 남아 있고, 화면 읽기 프로그램도 숫자를 읽을 수 있음.
 */

// boot(): 메뉴·영화 자료·저장소를 준비한 뒤 아래 renderStats 함수를 호출함.
// el(): HTML 요소를 만드는 도우미. el('p', { className: 'muted' }, '글자')처럼 씀.
import { boot, el } from '../ui.js';
// buildProjections(catalog, 기록 배열)는 감상 기록으로 여러 통계를 한 번에 계산해 객체로 돌려줌.
// 이 페이지는 그중 요약 숫자, by_genre(장르별), by_rating(별점별), by_country(나라별), by_month(월별)를 씀.
import { buildProjections } from '../selectors.js';

// 영화별로 몇 번 봤는지 센 객체를 돌려줌. 예: { m001: 3, m004: 2 }
// 같은 영화를 다시 보면 기록이 하나 더 생기므로, 기록 수가 곧 감상 횟수임. 시리즈 페이지의 함수와 같음.
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

// count가 total의 몇 %인지 돌려줌. total이 0이면 0으로 나누게 되므로 0을 돌려줌.
// 막대 길이(가장 큰 값 대비 %)와 비율 숫자(합계 대비 %) 계산에 함께 씀.
function percentOf(count, total) {
  if (total === 0) {
    return 0;
  }
  return count / total * 100;
}

// 아래 compare 함수들은 배열의 sort()에 넘기는 비교 함수임.
// 음수를 돌려주면 a가 앞, 양수를 돌려주면 b가 앞으로 감. b.count - a.count는 개수가 큰 쪽을 앞으로 보냄(내림차순).

// 장르·나라용: 개수가 같으면 catalog.json에 적힌 순서(order)대로 둠.
function compareByCount(a, b) {
  if (b.count !== a.count) {
    return b.count - a.count;
  }
  return a.order - b.order;
}

// 감독·배우용: 개수가 같으면 이름을 가나다순으로 둠.
// localeCompare(다른 글자, 'ko')는 한국어 사전 순서로 두 글자를 비교함.
function compareByName(a, b) {
  if (b.count !== a.count) {
    return b.count - a.count;
  }
  return a.name.localeCompare(b.name, 'ko');
}

// 다시 본 영화용: 감상 횟수가 같으면 영화 제목을 가나다순으로 둠.
function compareByTitle(a, b) {
  if (b.count !== a.count) {
    return b.count - a.count;
  }
  return a.movie.title.localeCompare(b.movie.title, 'ko');
}

// 숫자 오름차순 비교 함수. sort()를 그냥 쓰면 숫자도 글자처럼 비교하므로 직접 넘겨야 함.
function compareNumbers(a, b) {
  return a - b;
}

// 장르와 나라 막대에 쓸 줄(row) 배열을 만듦. 두 경우 모두 모양이 같아 함수 하나로 처리함.
// items: catalog.Genre 또는 catalog.Country 배열 (이름과 순서를 얻음)
// buckets: buildProjections()의 by_genre 또는 by_country 객체 (예: by_genre.g01.count = 드라마를 본 영화 수)
// idKey: items의 한 줄에서 buckets를 찾을 때 쓸 열 이름('genre_id' 또는 'country_code')
// item[idKey]처럼 대괄호를 쓰면 변수에 든 이름의 속성을 꺼낼 수 있음.
// 0편인 장르·나라는 막대를 그리지 않으므로 빼고, 남은 줄을 많은 순으로 정렬함.
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

// 별점 분포의 세로 막대 10개(0.5, 1.0, ... 5.0)에 쓸 자료를 만듦.
// by_rating의 열쇠는 '0.5', '1', '1.5'처럼 String(점수) 모양임.
// Object.keys(by_rating)로 꺼내면 '1', '2', ... 같은 정수 모양 열쇠가 먼저 나와 순서가 섞이므로,
// i를 1부터 10까지 늘리며 i / 2로 점수를 만들어 항상 0.5부터 5.0까지 차례대로 꺼냄.
// toFixed(1)은 소수 첫째 자리까지 글자로 바꿈. 1 → '1.0'이 되어 막대 아래 이름이 모두 같은 모양이 됨.
// spoken은 화면 읽기 프로그램이 읽을 문장임(화면에는 안 보임).
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

// 월별 감상 수의 세로 막대 12개에 쓸 자료를 만듦. 이번 달을 맨 오른쪽에 두고 11달 전부터 차례대로 채움.
// by_month에는 기록이 있는 달만 들어 있음(예: { '2026-11': 3 }). 없는 달은 0회로 채움.
function monthColumns(projections, today) {
  const columns = [];
  // back은 '몇 달 전인지'임. 11달 전부터 0달 전(이번 달)까지 거꾸로 세어 왼쪽이 오래된 달이 되게 함.
  for (let back = 11; back >= 0; back -= 1) {
    // new Date(년, 월 - back, 1)에서 월이 0보다 작아지면 Date가 알아서 작년으로 넘겨 줌.
    // 예: 2026년 1월(월 번호 0)에서 2를 빼면 -2 → 2025년 11월이 됨. 날짜는 아무 달에나 있는 1일로 둠.
    const date = new Date(today.getFullYear(), today.getMonth() - back, 1);
    const year = date.getFullYear();
    // getMonth()는 1월을 0으로 세므로 1을 더해 사람이 읽는 월로 바꿈.
    const month = date.getMonth() + 1;
    // by_month의 열쇠 모양('2026-03')에 맞추려고 padStart(2, '0')로 한 자리 월 앞에 0을 붙임.
    const key = year + '-' + String(month).padStart(2, '0');
    let count = 0;
    if (projections.by_month[key] !== undefined) {
      count = projections.by_month[key];
    }
    // 첫 막대와 1월 막대에만 연도를 붙여 어느 해의 달인지 알 수 있게 함. 나머지 막대는 빈 글자('')로 둠.
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

// 감상한 영화에 가장 많이 참여한 감독(role: 'director') 또는 배우(role: 'actor') 3명을 돌려줌.
// MovieCredit은 '영화-인물-역할' 연결표임. 한 사람이 감상한 '서로 다른' 영화 몇 편에 참여했는지 셈.
// 사람마다 Set(같은 값을 한 번만 담는 묶음)에 영화 ID를 넣으므로, 같은 영화가 두 번 들어와도 한 편으로 셈.
// 재관람 기록이 있어도 watchedIds에는 영화 ID가 한 번만 있으므로 감상 횟수가 아니라 영화 수가 됨.
function topPeople(catalog, watchedIds, role) {
  const movieSets = {};
  for (const credit of catalog.MovieCredit) {
    // 역할이 다르거나 아직 보지 않은 영화면 건너뜀. continue는 반복의 다음 차례로 바로 넘어감.
    if (credit.role !== role || !watchedIds.has(credit.movie_id)) {
      continue;
    }
    if (movieSets[credit.person_id] === undefined) {
      movieSets[credit.person_id] = new Set();
    }
    movieSets[credit.person_id].add(credit.movie_id);
  }

  // Object.keys()로 인물 ID 목록을 꺼내고, personById(인물ID → 인물 정보 Map)에서 이름을 찾음.
  // size는 Set에 든 값의 개수 = 참여한 감상 영화 수임.
  const people = [];
  for (const personId of Object.keys(movieSets)) {
    const person = catalog.lookup.personById.get(personId);
    people.push({ name: person.name, count: movieSets[personId].size });
  }
  people.sort(compareByName);
  // slice(0, 3)은 앞에서부터 3개만 잘라 새 배열로 돌려줌. 3명보다 적으면 있는 만큼만 돌려줌.
  return people.slice(0, 3);
}

// 개봉 연대별로 감상한 영화 수를 셈. 예: 1994년 개봉 → 1990년대.
// catalog에 있는 연대는 감상한 영화가 0편이어도 모두 보여줌(어느 연대를 아직 안 봤는지도 알 수 있게).
// 돌려주는 값: { rows: [{ name: '1990년대', count: 2 }, ...], unknown: 개봉일 미등록인 감상 영화 수 }
function decadeRows(catalog, watchedIds) {
  const decades = [];
  const counts = {};
  let unknown = 0;
  for (const movie of catalog.Movie) {
    // release_date가 null이거나 빈 글자면 연대를 알 수 없으므로 세지 않고, 감상한 영화일 때만 따로 셈.
    if (!movie.release_date) {
      if (watchedIds.has(movie.movie_id)) {
        unknown += 1;
      }
      continue;
    }
    // '1994-10-14'의 앞 4글자 '1994'를 숫자로 바꾼 뒤, 10으로 나눠 소수점을 버리고 다시 10을 곱함 → 1990.
    const year = Number(movie.release_date.slice(0, 4));
    const decade = Math.floor(year / 10) * 10;
    // 처음 나온 연대면 0편으로 시작하고 연대 목록에도 넣음.
    if (counts[decade] === undefined) {
      counts[decade] = 0;
      decades.push(decade);
    }
    // catalog.Movie에는 영화가 한 번씩만 있으므로 여기서 세는 값은 '서로 다른 영화 수'임.
    if (watchedIds.has(movie.movie_id)) {
      counts[decade] += 1;
    }
  }
  // 영화가 개봉 순서로 적혀 있지 않을 수 있으므로 연대를 오래된 순으로 정렬함.
  decades.sort(compareNumbers);

  const rows = [];
  for (const decade of decades) {
    rows.push({ name: decade + '년대', count: counts[decade] });
  }
  return { rows: rows, unknown: unknown };
}

// 두 번 이상 본 영화를 감상 횟수가 많은 순으로 최대 3편 돌려줌. 각 줄은 { movie: 영화 정보, count: 횟수 }임.
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

// 요약 카드의 값 칸(dd)을 만듦. 숫자는 strong으로 크게, 단위(편·회·개)는 small로 작게 씀.
function numberValue(number, unit) {
  return el('dd', { className: 'stats-card-value' }, el('strong', {}, String(number)), el('small', {}, unit));
}

// 총 감상 시간(분)을 '42시간 21분' 모양의 값 칸으로 만듦. 규칙은 series.js의 formatRuntime과 같음.
// 1시간이 안 되면 '58분', 딱 떨어지면 '2시간', 나머지는 '2시간 15분'.
// 숫자와 단위를 따로 감싸야 숫자만 크게 보이므로 글자 하나로 만들지 않고 조각을 차례대로 붙임.
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

// 평균 별점 값 칸. 별점을 남긴 기록이 없으면 buildProjections()가 평균을 null로 주므로 '별점 기록 없음'을 씀.
// 별(★)은 꾸밈용이라 aria-hidden으로 화면 읽기 프로그램이 읽지 않게 함. 카드 제목 '평균 별점'이 뜻을 알려 줌.
function ratingValue(average) {
  if (average === null) {
    return el('dd', { className: 'stats-card-value stats-card-none' }, '별점 기록 없음');
  }
  const star = el('span', { className: 'stats-star', ariaHidden: 'true' }, '★');
  return el('dd', { className: 'stats-card-value' }, star, ' ', el('strong', {}, average.toFixed(1)));
}

// 요약 카드 하나를 만듦. dl(설명 목록) 안에서 dt는 항목 이름, dd는 값과 보충 설명임.
// HTML 규칙상 dl 안에서 dt·dd 묶음을 div로 감쌀 수 있으므로, div 하나를 카드 상자로 씀.
// note가 빈 글자('')면 보충 설명 줄을 만들지 않음.
function summaryCard(label, value, note) {
  const card = el('div', { className: 'stats-card' });
  card.append(el('dt', {}, label), value);
  if (note !== '') {
    card.append(el('dd', { className: 'stats-card-note' }, note));
  }
  return card;
}

// 페이지 맨 위의 감상 요약 카드 6개를 만듦.
function renderSummary(catalog, projections, logs) {
  // 본 나라 수: by_country에서 1편 이상인 나라만 셈. (장르 수는 buildProjections()가 genre_count로 이미 셈)
  let countryCount = 0;
  for (const country of catalog.Country) {
    if (projections.by_country[country.country_code].count > 0) {
      countryCount += 1;
    }
  }

  // runtime_total은 상영 시간이 등록된(null이 아닌) 영화만 더한 값임.
  // 상영 시간이 없는 영화를 본 기록이 있으면 합계에서 빠졌다는 사실을 카드 설명에 덧붙임.
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

  // 평균이 몇 개의 별점으로 계산됐는지 알려 줌. 별점 없이 남긴 기록은 평균에 들어가지 않음.
  let ratingNote = '';
  if (projections.rated_count > 0) {
    ratingNote = '별점 ' + projections.rated_count + '회 기준';
  }

  // unique_movie_count는 서로 다른 영화 수, watch_count는 다시 본 것까지 센 기록 수임.
  const list = el('dl', { className: 'stats-summary' });
  list.append(
    summaryCard('감상한 영화', numberValue(projections.unique_movie_count, '편'), '등록된 ' + catalog.Movie.length + '편 중'),
    summaryCard('감상 횟수', numberValue(projections.watch_count, '회'), '재관람 포함'),
    summaryCard('총 감상 시간', runtimeValue(projections.runtime_total), runtimeNote),
    summaryCard('평균 별점', ratingValue(projections.rating_average), ratingNote),
    summaryCard('본 장르', numberValue(projections.genre_count, '개'), '전체 ' + catalog.Genre.length + '개 중'),
    summaryCard('본 나라', numberValue(countryCount, '개'), '전체 ' + catalog.Country.length + '개 중')
  );

  // 메인 페이지의 요약 영역처럼 section에 aria-label을 붙여 화면 읽기 프로그램에 '감상 요약' 영역임을 알림.
  const section = el('section', { className: 'stats-summary-section', ariaLabel: '감상 요약' });
  section.append(list);
  return section;
}

// 통계 구역(section) 하나의 틀을 만듦: 제목 h2 + (있으면) 오른쪽 링크.
// common.css의 section-heading 클래스를 그대로 써서 다른 페이지 구역 제목처럼 왼쪽 주황 막대가 붙음.
// aria-labelledby로 구역과 제목을 연결해, 화면 읽기 프로그램이 구역 이름을 제목 글자로 읽게 함.
// extra는 제목 줄 오른쪽에 붙일 요소(예: '지도에서 보기' 링크)이고, 없으면 null을 넘김.
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

// 가로 막대 목록을 만듦(장르·나라·개봉 연대에서 함께 씀). 한 줄 = 이름 | 막대 | 'N편 · N%'.
// 막대 길이는 가장 많은 줄을 100%로 놓은 상대 길이임. 그래야 1위 막대가 꽉 차고 나머지와 비교하기 쉬움.
// 비율(%)은 막대 길이와 다르게 '모든 줄의 합계'를 100%로 놓고 계산함. 그래서 비율을 더하면 100% 가까이 됨.
// (buildProjections()의 ratio는 '감상한 영화 수' 대비 값이라, 여러 장르에 속한 영화 때문에 합이 100%를 넘음. 그래서 쓰지 않음)
// 다만 각 비율을 Math.round로 따로 반올림하므로 합이 정확히 100%가 아닐 수 있음.
// 예: 합계 28편 중 1편짜리 나라가 10개면 3.57%가 각각 4%로 올라가, 전체 합이 104%처럼 몇 % 벗어남.
// showShare가 false면(개봉 연대) 비율 없이 'N편'만 씀.
function renderBarList(rows, label, showShare) {
  let total = 0;
  let maxCount = 0;
  for (const row of rows) {
    total += row.count;
    if (row.count > maxCount) {
      maxCount = row.count;
    }
  }

  // ul에 aria-label을 붙여 어떤 목록인지 알림. 각 줄의 글자(이름, 'N편 · N%')가 그대로 읽힘.
  const list = el('ul', { className: 'stats-bars', ariaLabel: label });
  for (const row of rows) {
    const name = el('span', { className: 'stats-bar-name' }, row.name);
    // 회색 바탕(track) 안에 주황 막대(fill)를 넣고, fill의 너비(%)로 길이를 나타냄.
    const fill = el('span', { className: 'stats-bar-fill' });
    fill.style.width = percentOf(row.count, maxCount) + '%';
    // 막대는 숫자를 그림으로 한 번 더 보여줄 뿐이므로 aria-hidden으로 화면 읽기에서 뺌.
    const track = el('span', { className: 'stats-bar-track', ariaHidden: 'true' }, fill);
    const value = el('span', { className: 'stats-bar-value' }, el('strong', {}, row.count + '편'));
    if (showShare) {
      value.append(' · ' + Math.round(percentOf(row.count, total)) + '%');
    }
    list.append(el('li', { className: 'stats-bar-row' }, name, track, value));
  }
  return list;
}

// 세로 막대 그래프를 만듦(별점 분포·월별 감상 수에서 함께 씀).
// 막대 하나(li) = 막대 위 개수 + 주황 막대 + 아래 이름(별점 또는 'N월', 필요하면 연도).
// 막대 높이는 가장 큰 값을 100%로 놓은 상대 높이임.
// 화면에 보이는 숫자·이름 조각은 aria-hidden으로 감추고, 대신 visually-hidden 문장('별점 4.5점 3회')을 넣음.
// visually-hidden은 Bootstrap 클래스로, 눈에는 안 보이지만 화면 읽기 프로그램은 읽음. 그래서 '3', '4.5'처럼 따로 읽히지 않음.
// extraClass는 그래프 종류를 구분하는 클래스임. 'stats-months'면 stats.css가 칸을 12개로 나눔.
function renderColumns(columns, label, extraClass) {
  let maxCount = 0;
  for (const column of columns) {
    if (column.count > maxCount) {
      maxCount = column.count;
    }
  }

  // ol(순서 있는 목록)을 씀. 별점과 달은 순서가 의미 있기 때문임.
  const list = el('ol', { className: 'stats-columns ' + extraClass, ariaLabel: label });
  for (const column of columns) {
    // 개수 글자를 막대 안에 넣고 CSS로 막대 바로 위에 띄움. 막대가 높아지면 글자도 함께 올라감.
    const count = el('span', { className: 'stats-column-count' }, String(column.count));
    const bar = el('span', { className: 'stats-column-bar' }, count);
    bar.style.height = percentOf(column.count, maxCount) + '%';
    const plot = el('span', { className: 'stats-column-plot', ariaHidden: 'true' }, bar);

    const name = el('span', { className: 'stats-column-label', ariaHidden: 'true' }, column.label);
    if (column.year !== '') {
      name.append(el('span', { className: 'stats-column-year' }, column.year));
    }
    const spoken = el('span', { className: 'visually-hidden' }, column.spoken);

    // 0개인 막대에는 stats-column-zero 클래스를 붙여 숫자 0을 보통 굵기의 회색 글자로 보여줌(기록이 있는 칸보다 덜 눈에 띄게).
    const item = el('li', { className: 'stats-column' }, plot, name, spoken);
    if (column.count === 0) {
      item.classList.add('stats-column-zero');
    }
    list.append(item);
  }
  return list;
}

// 장르 비율 구역. 감상한 영화가 속한 장르를 많은 순으로 보여줌.
function renderGenreSection(catalog, projections) {
  const section = makeSection('stats-genre', '장르 비율', null);
  const rows = rankBuckets(catalog.Genre, projections.by_genre, 'genre_id');
  if (rows.length === 0) {
    section.append(el('p', { className: 'muted' }, '감상한 영화에 등록된 장르가 없습니다.'));
    return section;
  }
  // 한 영화가 '드라마'와 '코미디'에 모두 속하면 두 장르에 한 번씩 세므로, 그 기준을 막대 아래에 적어 둠.
  section.append(
    renderBarList(rows, '장르별 감상한 영화 수와 비율', true),
    el('p', { className: 'stats-note' }, '한 영화가 여러 장르에 속하면 장르마다 한 번씩 셉니다.')
  );
  return section;
}

// 별점 분포 구역. 위에 평균·별점 기록 수를 한 줄로 쓰고, 아래에 0.5~5.0점 막대 10개를 그림.
// 별점 없는 기록 수 = 전체 기록 수(watch_count) - 별점 남긴 기록 수(rated_count).
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

  // 별점을 하나도 남기지 않았으면 모든 막대가 0이라 그래프가 의미 없으므로 안내 문구만 보여줌.
  caption.append('별점 없는 기록 ' + unrated + '회');
  section.append(caption, el('p', { className: 'muted' }, '감상 기록에 별점을 남기면 분포가 여기에 나타납니다.'));
  return section;
}

// 나라 비율 구역. 장르 비율과 같은 방식이며, 제목 오른쪽에 지도 페이지(map.html) 링크를 붙임.
// text-link는 common.css의 클래스로, 메인 페이지 구역 제목 옆 링크와 같은 모양(주황 글자 + ›)임.
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

// 월별 감상 수 구역. new Date()로 오늘 날짜를 얻어 이번 달까지의 최근 12개월을 보여줌.
// 12개월보다 오래된 기록은 그래프에 나오지 않으므로 '최근 12개월 동안'의 합계를 따로 적음.
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

// 감독 또는 배우 순위 목록 하나를 만듦: 순위 번호 | 이름 링크 | 'N편'.
// 이름을 누르면 영화 검색 페이지(movies.html?q=이름)로 이동함. 검색 페이지는 감독·배우 이름으로도 찾아 줌.
// encodeURIComponent는 이름 속 띄어쓰기나 한글을 주소에 넣을 수 있는 모양(%EB%B4%89...)으로 바꿈.
function renderPeopleGroup(title, people, emptyText) {
  const group = el('div', { className: 'stats-people-group' });
  group.append(el('h3', {}, title));
  if (people.length === 0) {
    group.append(el('p', { className: 'muted' }, emptyText));
    return group;
  }

  // 공동 순위: 앞 사람과 편수가 같으면 같은 순위 번호를 씀. 예: 3편, 3편, 2편 → 1, 1, 3.
  // position은 목록에서 몇 번째인지, rank는 화면에 보일 순위, previousCount는 바로 앞 사람의 편수임.
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
    // 순위 동그라미는 눈으로 보기 위한 모양이라 aria-hidden으로 감추고, 대신 '1위'처럼 읽을 글자를 visually-hidden으로 넣음.
    // 동률이면 같은 순위 번호를 쓰므로, ol 목록의 순서(1, 2, 3번째)만으로는 '줄리 델피'가 2위처럼 잘못 전달되기 때문임.
    // visually-hidden은 position: absolute라 flex 줄의 칸 배치(동그라미 | 이름 | 'N편')에는 영향을 주지 않음.
    const number = el('span', { className: 'stats-rank-number', ariaHidden: 'true' }, String(rank));
    const spokenRank = el('span', { className: 'visually-hidden' }, rank + '위');
    const link = el('a', { href: 'movies.html?q=' + encodeURIComponent(person.name) }, person.name);
    const count = el('span', { className: 'stats-rank-count' }, person.count + '편');
    list.append(el('li', {}, number, spokenRank, link, count));
  }
  group.append(list);
  return group;
}

// 가장 많이 본 감독·배우 구역. 넓은 화면에서는 stats.css가 이 구역(id: stats-people)을 두 칸에 걸쳐 놓고,
// 안쪽에서 감독 목록과 배우 목록을 나란히 둠.
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

// 개봉 연대별 감상 구역. 장르·나라와 같은 가로 막대를 쓰되, 연대 순서가 의미 있으므로 많은 순으로 정렬하지 않고
// 오래된 연대부터 보여주며, 비율 대신 'N편'만 씀(showShare = false).
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

// 가장 많이 다시 본 영화 구역. 포스터 + 제목 + 'N회 감상'을 한 링크로 묶어 상세 페이지로 이동하게 함.
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
    // 포스터가 등록되지 않은 영화(null)는 공용 대체 이미지를 씀. 지도·시리즈 페이지와 같은 방식임.
    let posterUrl = 'assets/posters/placeholder.jpg';
    if (movie.poster_url !== null) {
      posterUrl = movie.poster_url;
    }
    // 바로 옆에 제목 글자가 있어 링크 이름이 이미 정해지므로 포스터의 alt는 비워 제목을 두 번 읽지 않게 함.
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

// 감상 기록이 하나도 없을 때 보여줄 안내 상자. empty-state는 common.css의 회색 안내 상자 클래스임.
// 메인 페이지에는 예시 기록 6개를 넣는 버튼이 있고, 영화 검색 페이지에서는 영화를 골라 기록을 남길 수 있음.
// btn btn-link는 지도 페이지의 빈 상태 링크와 같은 글자 버튼 모양임.
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

/*
 * renderStats(context): boot()가 자료를 준비한 뒤 부르는 화면 그리기 함수.
 * context에는 app(본문 자리), catalog(영화 자료), snapshot(내 감상 기록) 등이 들어 있음.
 * 다른 탭에서 기록을 바꾸고 이 탭으로 돌아오면 boot()가 다시 불러 최신 기록으로 처음부터 다시 그림.
 */
function renderStats(context) {
  const app = context.app;
  const catalog = context.catalog;
  const snapshot = context.snapshot;

  const heading = el('div', { className: 'page-heading' });
  heading.append(
    el('h1', {}, '감상 통계'),
    el('p', { className: 'muted' }, '감상 기록을 장르·별점·나라·시기별로 모아 보여줍니다.')
  );

  // 기록이 없으면 0으로 가득한 그래프 대신 안내 상자만 보여주고 끝냄.
  if (snapshot.logs.length === 0) {
    app.replaceChildren(heading, renderEmpty());
    return;
  }

  // 통계 계산은 한 번만 하고, 결과(projections)를 여러 구역 함수에 나눠 줌.
  const projections = buildProjections(catalog, snapshot.logs);
  // 감상한 영화 ID 묶음. Set이므로 같은 영화를 여러 번 봐도 한 번만 들어감.
  // has(ID)로 '본 영화인지'를 빠르게 확인할 수 있어 감독·배우, 개봉 연대 계산에 씀.
  const watchedIds = new Set();
  for (const log of snapshot.logs) {
    watchedIds.add(log.movie_id);
  }

  // 구역 순서: 장르 → 별점 → 나라 → 월별 → 감독·배우 → 개봉 연대 → 다시 본 영화. 좁은 화면과 화면 읽기 프로그램은 이 순서를 따름.
  // 넓은 화면에서는 stats.css가 두 칸으로 나눠 [장르|나라], [별점|월별], [감독·배우], [연대|다시 본 영화]로 배치함.
  // 가로 막대 목록끼리, 세로 막대 그래프끼리 짝을 지어야 옆 칸과 높이가 비슷해져 한쪽 아래가 크게 비지 않음.
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

  // 본문(#app)의 기존 내용('불러오는 중' 문구 또는 이전 화면)을 지우고 제목·요약·통계 구역으로 바꿈.
  app.replaceChildren(heading, renderSummary(catalog, projections, snapshot.logs), layout);
}

// page: 'stats'는 메뉴에서 '통계'를 현재 페이지로 표시하는 데 쓰임(ui.js의 navigation 목록과 같은 이름).
// title은 브라우저 탭 제목, render는 화면을 그릴 함수임.
boot({
  page: 'stats',
  title: '감상 통계',
  render: renderStats
});
