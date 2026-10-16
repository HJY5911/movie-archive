/*
 * series.js — 시리즈 영화의 시청 순서를 안내하는 페이지
 *
 * 이 파일에서 하는 일:
 * 1. URL의 id 값(예: series.html?id=s01)으로 처음 보여줄 시리즈를 정함.
 * 2. 시리즈에 속한 영화를 개봉 순서(release_order)대로 늘어놓고, 각 영화를 봤는지 표시함.
 * 3. 아직 안 본 영화 중 순서가 가장 빠른 영화를 '다음에 볼 영화'로 추천함.
 * 4. 앞 편을 건너뛰고 뒤 편을 먼저 본 경우 앞 편을 먼저 보라고 안내함.
 * 5. 몇 편 중 몇 편을 봤는지 진행률 막대와 남은 상영 시간을 보여줌.
 *
 * 이 페이지는 기록을 읽기만 함. 감상 기록 추가·수정·삭제는 movie.html(movie.js)에서 함.
 * 시리즈별 영화 순서와 감상 여부 계산은 selectors.js의 getSeriesProgress()가 맡음.
 * 시리즈 이름·설명·영화 순서는 catalog.json의 Series, SeriesMovie 자료에서 읽음.
 * 공용 파일(ui.js, selectors.js, common.css, catalog.json)은 수정하지 않음.
 */

// boot(): 메뉴·영화 자료·저장소를 준비한 뒤 아래 renderSeries 함수를 호출함.
// el(): HTML 요소를 만드는 도우미. el('p', { className: 'muted' }, '글자')처럼 씀.
import { boot, el } from '../ui.js';
// getSeriesProgress(catalog, 기록 배열, 시리즈ID)는 시리즈 영화들을 개봉 순서대로 정렬해
// [{ movie_id, title, release_order, watched }] 형태의 배열로 돌려줌. watched는 본 적 있으면 true.
import { getSeriesProgress } from '../selectors.js';

// location.search는 주소의 ?부터 뒷부분임. URLSearchParams로 감싸면 값을 이름으로 꺼낼 수 있음.
const urlParams = new URLSearchParams(location.search);
// 처음 보여줄 시리즈 ID. 주소에 id가 없으면 null이고, 아래에서 첫 번째 시리즈로 바꿈.
// 시리즈 버튼을 누를 때마다 바뀌므로 let을 씀.
let selectedId = urlParams.get('id');

// 영화별로 몇 번 봤는지 센 객체를 돌려줌. 예: { m001: 2, m002: 1 }
// 같은 영화를 여러 번 보면 기록이 여러 개 생기므로 횟수를 셀 수 있음.
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

// 영화 ID를 받아 그 영화의 감독 이름 배열을 돌려줌.
// MovieCredit은 '영화-인물-역할' 연결표이므로, 역할이 director인 줄만 골라 인물 이름을 찾음.
function directorNames(catalog, movieId) {
  const names = [];
  for (const credit of catalog.MovieCredit) {
    // 다른 영화이거나 감독이 아니면(배우 등) 건너뜀. continue는 반복의 다음 차례로 바로 넘어감.
    if (credit.movie_id !== movieId || credit.role !== 'director') {
      continue;
    }
    // personById는 repository.js가 만들어 둔 '인물ID → 인물 정보' Map임.
    const person = catalog.lookup.personById.get(credit.person_id);
    if (person !== undefined) {
      names.push(person.name);
    }
  }
  return names;
}

// 분 단위 숫자를 '1시간 25분'처럼 읽기 쉬운 글자로 바꿈.
function formatRuntime(minutes) {
  // Math.floor는 소수점 아래를 버림. 85분이면 hours는 1, rest(나머지)는 25가 됨.
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

// 영화 제목 뒤에 붙일 조사(을/를)를 고름. '달빛 우체국을', '사랑의 노래를'처럼 받침에 맞춤.
// 한글 글자는 유니코드에서 0xAC00(가)부터 0xD7A3(힣)까지 일정한 규칙으로 놓여 있음.
// (글자 코드 - 0xAC00)을 28로 나눈 나머지가 0이면 받침이 없는 글자임.
function objectParticle(word) {
  const code = word.charCodeAt(word.length - 1);
  // 마지막 글자가 한글이 아니면(숫자·영어 등) 받침을 판단할 수 없어 '을(를)'로 둠.
  if (code < 0xAC00 || code > 0xD7A3) {
    return '을(를)';
  }
  if ((code - 0xAC00) % 28 === 0) {
    return '를';
  }
  return '을';
}

// getSeriesProgress() 결과에 영화 전체 정보(포스터, 개봉일, 상영 시간 등)를 붙여
// 화면 그리기에 쓰기 좋은 '단계(step)' 배열로 만듦. 각 단계 = 시청 순서의 한 칸.
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

// 아직 보지 않은 영화 중 순서가 가장 빠른 단계를 찾음 = 다음에 볼 영화.
// steps는 이미 개봉 순서대로 정렬되어 있으므로 처음 만나는 '안 본 영화'를 돌려주면 됨.
// 모두 봤으면 null을 돌려줌.
function findNextStep(steps) {
  for (const step of steps) {
    if (!step.watched) {
      return step;
    }
  }
  return null;
}

// '다음에 볼 영화' 안내 상자를 만듦. 이 페이지의 핵심 기능임.
// 세 가지 경우로 나뉨: (1) 모두 봄 (2) 하나도 안 봄 (3) 일부만 봄
function renderGuide(nextStep, steps, watchedCount) {
  // aria-live는 내용이 바뀌면 화면 읽기 프로그램이 읽어 주도록 하는 설정임.
  const guide = el('section', { className: 'series-guide', ariaLive: 'polite' });
  const guideTitle = el('h3', {}, '다음에 볼 영화');
  guide.append(guideTitle);

  // (1) 다음 영화가 없음 = 시리즈를 다 봄.
  if (nextStep === null) {
    guide.classList.add('done');
    guide.append(el('p', {}, '시리즈를 모두 감상했습니다. 처음부터 다시 보며 놓친 장면을 찾아보세요.'));
    return guide;
  }

  // 추천 영화 제목을 누르면 상세 페이지(movie.html?id=영화ID)로 이동해 바로 감상 기록을 남길 수 있음.
  const link = el('a', { href: `movie.html?id=${encodeURIComponent(nextStep.movie.movie_id)}` }, nextStep.movie.title);
  const sentence = el('p', { className: 'series-guide-next' });
  // (2) 하나도 안 봤으면 1편부터 시작하라고 안내함. (3) 일부 봤으면 다음 편을 안내함.
  if (watchedCount === 0) {
    sentence.append(`${nextStep.order}편 `, link, '부터 시작하세요.');
  } else {
    sentence.append(`${nextStep.order}편 `, link, objectParticle(nextStep.movie.title) + ' 볼 차례입니다.');
  }
  guide.append(sentence);

  // 건너뛰기 검사: 다음에 볼 영화보다 뒤 순서인데 이미 본 영화가 있으면 앞 편을 건너뛴 것임.
  // 예: 2편만 보고 1편을 안 봤으면 다음 영화는 1편이고, 2편(순서 2 > 1)은 봤으므로 경고를 띄움.
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

// 시청 순서 목록의 한 칸(li)을 만듦: 순서 번호 동그라미, 포스터, 제목, 개봉 연도·상영 시간·감독, 감상 상태.
function renderStep(catalog, step, nextStep, watchCounts) {
  const movie = step.movie;

  // 포스터가 등록되지 않은 영화(null)는 공용 대체 이미지를 씀. 지도 페이지와 같은 방식임.
  let posterUrl = 'assets/posters/placeholder.jpg';
  if (movie.poster_url !== null) {
    posterUrl = movie.poster_url;
  }

  // 정보 문구 조각을 배열에 모아 두었다가 ' · '로 이어 붙임. 없는 정보는 넣지 않음.
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

  // 본 영화는 watched, 다음 차례 영화는 next 클래스를 붙여 series.css에서 모양을 다르게 함.
  const item = el('li', { className: 'series-step' });
  if (step.watched) {
    item.classList.add('watched');
  }
  const isNext = nextStep !== null && nextStep.order === step.order;
  if (isNext) {
    item.classList.add('next');
  }

  // 동그라미 안의 번호. 제목에 'N편'이 이미 있어 화면 읽기 프로그램이 두 번 읽지 않도록 aria-hidden을 줌.
  const number = el('span', { className: 'series-step-number', ariaHidden: 'true' }, String(step.order));
  // loading: 'lazy'는 화면에 보일 때쯤 이미지를 불러오게 해 페이지를 가볍게 함.
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

/*
 * renderSeries(context): boot()가 자료를 준비한 뒤 부르는 화면 그리기 함수.
 * context에는 app(본문 자리), catalog(영화 자료), snapshot(내 감상 기록), refresh(다시 그리기)가 들어 있음.
 * 감상 기록이 바뀌어 다시 그릴 때도 이 함수가 처음부터 다시 실행됨.
 */
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

  // catalog.json에 시리즈가 하나도 없으면 안내 문구만 보여주고 끝냄.
  if (catalog.Series.length === 0) {
    const empty = el('div', { className: 'empty-state' }, el('p', {}, '등록된 시리즈가 없습니다.'));
    app.replaceChildren(heading, empty);
    return;
  }

  // 주소의 id가 없거나 잘못된 값이면 첫 번째 시리즈를 보여줌.
  if (!catalog.lookup.seriesById.has(selectedId)) {
    selectedId = catalog.Series[0].series_id;
  }

  const watchCounts = countLogsByMovie(snapshot.logs);

  // 시리즈 목록 버튼을 눌렀을 때 실행됨.
  // history.replaceState는 페이지를 새로 열지 않고 주소창만 바꿈. 새로고침하거나 주소를 공유해도 같은 시리즈가 열림.
  // 다시 그린 뒤 누른 버튼에 초점을 돌려줘 키보드 사용자가 위치를 잃지 않게 함(지도 페이지와 같은 방식).
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

  // 왼쪽 패널: 시리즈 목록. 각 버튼에 '본 편수 / 전체 편수'를 표시함.
  // 지금은 catalog.json에 시리즈가 1개뿐이지만, 시리즈가 추가되면 자동으로 버튼이 늘어남.
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
    // aria-pressed는 지금 선택된 버튼인지 알려 주는 속성. series.css가 이 값으로 굵은 테두리를 그림.
    button.setAttribute('aria-pressed', String(series.series_id === selectedId));
    button.addEventListener('click', function () {
      return selectSeries(series.series_id);
    });
    list.append(el('li', {}, button));
  }
  listPanel.append(list);

  // 오른쪽 패널: 선택한 시리즈의 자세한 시청 안내.
  const series = catalog.lookup.seriesById.get(selectedId);
  const steps = buildSteps(catalog, snapshot.logs, selectedId);
  const nextStep = findNextStep(steps);

  // 본 편수, 전체 상영 시간, 남은 상영 시간을 한 번의 반복으로 계산함.
  // 상영 시간이 등록되지 않은(null) 영화는 합계에서 빼고 그 사실을 문구로 알림.
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

  // 진행률 막대: 바깥 div가 틀이고, 안쪽 span의 너비(%)가 채워진 정도임.
  // role="progressbar"와 aria-value 속성으로 화면 읽기 프로그램에도 진행률을 알림.
  const percent = steps.length === 0 ? 0 : Math.round(watchedCount / steps.length * 100);
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

  // ol은 순서가 있는 목록 태그. 시청 '순서'를 나타내므로 ul 대신 ol을 씀.
  const order = el('ol', { className: 'series-steps', ariaLabel: series.name + ' 시청 순서' });
  for (const step of steps) {
    order.append(renderStep(catalog, step, nextStep, watchCounts));
  }

  // append는 여러 요소를 순서대로 붙임. 진행률 → 시간 → 다음 영화 안내 → 시청 순서 목록 순으로 보임.
  detail.append(progressLabel, progressBar, runtime, guide, el('h3', { className: 'series-steps-title' }, '시청 순서'), order);

  const layout = el('div', { className: 'series-layout' });
  layout.append(listPanel, detail);
  // 본문(#app)의 기존 내용을 지우고 새로 만든 제목과 두 패널로 바꿈.
  app.replaceChildren(heading, layout);
}

// page: 'series'는 메뉴에서 '시리즈'를 현재 페이지로 표시하는 데 쓰임(ui.js의 navigation 목록과 같은 이름).
// title은 브라우저 탭 제목, render는 화면을 그릴 함수임.
boot({
  page: 'series',
  title: '시리즈 시청 순서',
  render: renderSeries
});
