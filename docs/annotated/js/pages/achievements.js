/*
 * achievements.js — 감상 기록으로 달성한 업적과 다음 목표를 보여주는 페이지
 *
 * 이 파일에서 하는 일:
 * 1. selectors.js의 buildProjections()가 계산한 업적 결과(achievements)를 받아옴.
 * 2. 업적을 지표 묶음(영화 수 → 감상 시간 → 장르 수) 순서로, 같은 묶음 안에서는 목표가 작은 순서로 정렬함.
 * 3. 'N개 중 M개 달성' 문구와 전체 달성률 막대를 보여줌.
 * 4. 아직 달성하지 못한 업적 중 가장 가까운 하나를 '다음 목표'로 골라 남은 양을 알려 줌.
 * 5. 전체/달성/진행 중 탭으로 업적 카드 목록을 걸러 보여줌. 탭을 눌러도 페이지를 새로 읽지 않고 카드 목록만 다시 그림.
 * 6. 감상 기록이 하나도 없으면 안내 상자를 띄우고, 업적 카드는 모두 0에서 시작하는 모습으로 보여줌.
 *
 * 이 페이지는 기록을 읽기만 함. 감상 기록 추가·수정·삭제는 movie.html(movie.js)에서 함.
 * 업적 규칙(이름·지표·목표)은 catalog.json의 AchievementRule 자료에 있음. 규칙을 추가하면 이 페이지에 자동으로 카드가 늘어남.
 * 지표(metric)는 repository.js가 검사하는 세 가지(unique_movie_count, runtime_total, genre_count)만 쓸 수 있음.
 * 공용 파일(ui.js, selectors.js, common.css)은 수정하지 않음.
 */

// boot(): 메뉴·영화 자료·저장소를 준비한 뒤 아래 renderAchievements 함수를 호출함.
// el(): HTML 요소를 만드는 도우미. el('p', { className: 'muted' }, '글자')처럼 씀.
import { boot, el } from '../ui.js';
// buildProjections(catalog, 기록 배열)는 감상 기록으로 여러 통계를 한 번에 계산해 객체로 돌려줌.
// 이 페이지는 그중 achievements 배열만 씀. 배열의 각 칸은 아래 모양의 객체임.
// { rule_id, metric, label, target(목표), current(현재 값), progress(0~100 진행률), achieved(달성 여부) }
import { buildProjections } from '../selectors.js';

// 지표 묶음을 보여줄 순서임. 서로 다른 영화 수 → 총 감상 시간(분) → 서로 다른 장르 수 순으로 카드를 늘어놓음.
// 업적 ID를 직접 적지 않고 지표 이름으로 정렬하므로, catalog.json에 규칙이 추가되어도 알맞은 자리에 들어감.
const metricOrder = ['unique_movie_count', 'runtime_total', 'genre_count'];

// 지금 선택한 보기 탭임. 'all'(전체), 'achieved'(달성), 'inprogress'(진행 중) 중 하나임.
// renderAchievements 밖(모듈 범위)에 두었으므로 화면을 다시 그려도(refresh) 선택이 유지됨.
// 페이지를 새로고침하면 모듈이 다시 실행되어 처음 값인 'all'로 돌아감.
let filter = 'all';

// sort()에 넘기는 비교 함수임. 음수를 돌려주면 a가 앞, 양수면 b가 앞에 옴.
// 1순위: 지표 묶음 순서(metricOrder 배열 안의 위치), 2순위: 목표값이 작은 순서, 3순위: 업적 ID 순서.
// 예: 입문자(1편) → 세 편의 기억(3편) → 영화광(10편) → 영화와 함께한 세 시간(180분) → …
function compareAchievements(a, b) {
  // indexOf는 배열에서 값의 위치(0부터)를 돌려줌. 위치끼리 빼면 묶음 순서를 비교할 수 있음.
  const groupOrder = metricOrder.indexOf(a.metric) - metricOrder.indexOf(b.metric);
  if (groupOrder !== 0) {
    return groupOrder;
  }
  const targetOrder = a.target - b.target;
  if (targetOrder !== 0) {
    return targetOrder;
  }
  // 지표와 목표가 모두 같을 때도 순서가 매번 같도록 업적 ID를 글자 순으로 비교함.
  return a.rule_id.localeCompare(b.rule_id);
}

// 숫자에 천 단위 쉼표를 넣음. 예: 1440 → '1,440'. 'ko-KR'은 한국어 표기 방식을 쓰라는 뜻임.
function formatNumber(value) {
  return value.toLocaleString('ko-KR');
}

// 지표마다 숫자 뒤에 붙일 단위를 돌려줌. 영화 수는 '편', 감상 시간은 '분', 장르 수는 '개'임.
function metricUnit(metric) {
  if (metric === 'unique_movie_count') {
    return '편';
  }
  if (metric === 'runtime_total') {
    return '분';
  }
  return '개';
}

// 숫자와 단위를 붙인 글자를 만듦. 예: amountText('runtime_total', 1440) → '1,440분'
function amountText(metric, value) {
  return formatNumber(value) + metricUnit(metric);
}

// 카드와 다음 목표 상자에 쓰는 달성 조건 문장을 지표별로 만듦.
// 예: '서로 다른 영화 10편 감상', '영화 1,440분(24시간) 감상', '서로 다른 장르 6개 감상'
function conditionText(item) {
  if (item.metric === 'unique_movie_count') {
    return '서로 다른 영화 ' + amountText(item.metric, item.target) + ' 감상';
  }
  if (item.metric === 'runtime_total') {
    let text = '영화 ' + amountText(item.metric, item.target);
    // 목표 분이 60으로 나누어떨어지면 시간 단위도 괄호로 덧붙여 얼마나 긴지 감이 오게 함. 예: 180분 → (3시간)
    if (item.target % 60 === 0) {
      text += '(' + formatNumber(item.target / 60) + '시간)';
    }
    return text + ' 감상';
  }
  // 남은 경우는 genre_count뿐임. repository.js가 세 지표 말고는 catalog.json을 불러올 때 오류로 막음.
  return '서로 다른 장르 ' + amountText(item.metric, item.target) + ' 감상';
}

// 목표까지 남은 양 = 목표 - 현재 값.
// 다음 목표 고르기·다음 목표 문장·진행 중 카드의 꼬리표처럼 달성하지 못한 업적에만 쓰므로 항상 0보다 큼.
function remainingAmount(item) {
  return item.target - item.current;
}

// '다음 목표'로 보여줄 업적을 고름. 아직 달성하지 못한 업적 중 진행률(progress)이 가장 높은 것을 고름.
// 진행률이 같으면 남은 양이 더 적은 업적을 고름. 예: 기록이 없을 때 모두 0%이므로 1편만 남은 '입문자'가 뽑힘.
// 모두 달성했으면 null을 돌려줌.
function findNextGoal(items) {
  let best = null;
  for (const item of items) {
    // 이미 달성한 업적은 다음 목표가 될 수 없으므로 건너뜀. continue는 반복의 다음 차례로 바로 넘어감.
    if (item.achieved) {
      continue;
    }
    if (best === null) {
      best = item;
    } else if (item.progress > best.progress) {
      best = item;
    } else if (item.progress === best.progress && remainingAmount(item) < remainingAmount(best)) {
      best = item;
    }
  }
  return best;
}

// 진행률 막대를 만듦. 바깥 div가 회색 틀이고, 안쪽 span의 너비(%)가 채워진 정도임(시리즈 페이지와 같은 방식).
// role="progressbar"와 aria-value 속성으로 화면 읽기 프로그램에도 진행 정도를 알림.
// aria-valuenow는 aria-valuemax를 넘으면 안 되므로 호출하는 쪽에서 목표값으로 잘라서 넘김.
// 대신 aria-valuetext에 '12 / 10편'처럼 실제 값을 담아, 화면 읽기 프로그램이 실제 숫자를 읽게 함.
function makeProgressBar(className, now, max, labelText, valueText, percent) {
  const bar = el('div', { className: className, role: 'progressbar' });
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', String(max));
  bar.setAttribute('aria-valuenow', String(now));
  bar.setAttribute('aria-valuetext', valueText);
  bar.setAttribute('aria-label', labelText);
  const fill = el('span');
  fill.style.width = percent + '%';
  bar.append(fill);
  return bar;
}

// 감상 기록이 하나도 없을 때 페이지 위쪽에 띄우는 안내 상자임.
// 메인 페이지(index.html)에는 기록이 없을 때 예시 감상 기록을 넣는 버튼이 있으므로 그쪽으로 안내함.
// empty-state, btn, btn-link는 common.css에 있는 공통 모양을 그대로 씀.
function renderNotice() {
  const notice = el('section', { className: 'empty-state achievements-notice' });
  notice.append(
    el('h2', {}, '아직 감상 기록이 없습니다'),
    el('p', {}, '영화를 보고 감상 기록을 남기면 아래 업적의 진행률이 올라갑니다.'),
    el('a', { href: 'index.html', className: 'btn btn-link' }, '메인에서 예시 기록 넣기')
  );
  return notice;
}

// '다음 목표' 안내 상자를 만듦. 두 가지 경우로 나뉨: (1) 모두 달성함 (2) 아직 남은 업적이 있음
function renderNextGoal(nextGoal) {
  const box = el('section', { className: 'achievements-next' });
  box.append(el('h3', {}, '다음 목표'));

  // (1) 남은 업적이 없으면 축하 문장만 보여주고 끝냄.
  if (nextGoal === null) {
    box.append(el('p', { className: 'achievements-next-text' }, '모든 업적을 달성했습니다.'));
    return box;
  }

  // (2) '영화광까지 5편 남았습니다.'처럼 업적 이름을 굵게 쓰고 남은 양을 알려 줌.
  const sentence = el('p', { className: 'achievements-next-text' });
  sentence.append(
    el('strong', {}, nextGoal.label),
    '까지 ' + amountText(nextGoal.metric, remainingAmount(nextGoal)) + ' 남았습니다.'
  );
  const condition = el('p', { className: 'achievements-next-condition' }, '달성 조건: ' + conditionText(nextGoal));
  // 영화 검색 페이지로 가서 볼 영화를 고를 수 있게 링크를 둠. text-link는 common.css의 주황 글자 링크 모양임.
  const link = el('a', { href: 'movies.html', className: 'text-link' }, '영화 찾으러 가기');
  box.append(sentence, condition, link);
  return box;
}

// '달성 현황' 영역을 만듦: 왼쪽은 'N개 중 M개 달성' + 전체 달성률 막대, 오른쪽은 다음 목표 상자임.
function renderSummary(items, achievedCount, nextGoal) {
  const total = items.length;
  // 업적이 0개일 때 0으로 나누지 않도록 total이 있을 때만 계산함. Math.round는 반올림함.
  let percent = 0;
  if (total > 0) {
    percent = Math.round(achievedCount / total * 100);
  }

  const overview = el('div', { className: 'achievements-overview' });
  // 달성한 개수만 strong으로 감싸 achievements.css에서 크게 보이게 함. 개수는 모두 자료에서 계산한 값임.
  const count = el('p', { className: 'achievements-overview-count' });
  count.append(total + '개 중 ', el('strong', {}, achievedCount + '개'), ' 달성');
  const bar = makeProgressBar(
    'achievements-bar achievements-overview-bar',
    achievedCount,
    total,
    '전체 업적 달성률',
    total + '개 중 ' + achievedCount + '개 달성',
    percent
  );
  const rate = el('p', { className: 'achievements-overview-rate' }, '달성률 ' + percent + '%');
  overview.append(count, bar, rate);

  const body = el('div', { className: 'achievements-summary-body' });
  body.append(overview, renderNextGoal(nextGoal));

  // section-heading은 common.css의 구역 제목 모양임. h2 왼쪽에 주황 세로 막대가 붙음.
  const summary = el('section', { className: 'achievements-summary' });
  summary.append(el('div', { className: 'section-heading' }, el('h2', {}, '달성 현황')), body);
  return summary;
}

// 업적 카드 한 장(li)을 만듦: 업적 이름, 상태 꼬리표, 달성 조건, 진행률 막대, '현재 / 목표' 숫자.
function renderCard(item) {
  const unit = metricUnit(item.metric);
  const card = el('li', { className: 'achievements-card' });

  // 상태 꼬리표의 글자와 클래스를 정함. 처음에는 '달성' 모양으로 두고, 달성하지 못했으면 '진행 중' 모양으로 바꿈.
  // 달성했으면 카드에 achievements-card-achieved, 꼬리표에 achievements-state-achieved 클래스를 붙여 achievements.css에서 주황으로 강조함.
  let stateText = '달성';
  let stateClass = 'achievements-state achievements-state-achieved';
  if (item.achieved) {
    card.classList.add('achievements-card-achieved');
  } else {
    // 달성하지 못한 업적만 남은 양을 계산함. 회색 꼬리표에 '5편 남음'처럼 씀.
    stateText = amountText(item.metric, remainingAmount(item)) + ' 남음';
    stateClass = 'achievements-state';
  }

  const top = el('div', { className: 'achievements-card-top' });
  top.append(
    el('h3', {}, item.label),
    el('span', { className: stateClass }, stateText)
  );

  const condition = el('p', { className: 'achievements-condition' }, conditionText(item));

  // 현재 값은 목표를 넘을 수 있음(예: 18편 / 10편). 글자에는 실제 값을 그대로 보여줌.
  // 막대의 aria-valuenow만 목표값을 넘지 않게 잘라서 넘김. 막대 너비는 selectors.js가 0~100으로 잘라 둔 progress를 씀.
  const valueText = formatNumber(item.current) + ' / ' + formatNumber(item.target) + unit;
  let barNow = item.current;
  if (barNow > item.target) {
    barNow = item.target;
  }
  const bar = makeProgressBar('achievements-bar', barNow, item.target, item.label + ' 진행률', valueText, item.progress);

  const count = el('p', { className: 'achievements-count' });
  count.append(el('strong', {}, formatNumber(item.current)), ' / ' + formatNumber(item.target) + unit);

  card.append(top, condition, bar, count);
  return card;
}

// 지금 선택한 탭(filter)에 이 업적이 보여야 하는지 판단함. 전체 탭이면 모두 보임.
function matchesFilter(item) {
  if (filter === 'achieved') {
    return item.achieved;
  }
  if (filter === 'inprogress') {
    return !item.achieved;
  }
  return true;
}

// 선택한 탭에 보여줄 카드가 하나도 없을 때의 안내 문장임.
function emptyFilterText() {
  if (filter === 'achieved') {
    return '아직 달성한 업적이 없습니다.';
  }
  if (filter === 'inprogress') {
    return '진행 중인 업적이 없습니다. 모든 업적을 달성했습니다.';
  }
  return '등록된 업적이 없습니다.';
}

// 선택한 탭에 맞는 카드만 모아 목록(ul)을 만들어 돌려줌. 보여줄 카드가 없으면 안내 문단(p)을 돌려줌.
// 탭을 바꿀 때마다 이 함수로 목록 부분만 새로 만듦.
function renderCardList(items) {
  const visible = [];
  for (const item of items) {
    if (matchesFilter(item)) {
      visible.push(item);
    }
  }
  if (visible.length === 0) {
    return el('p', { className: 'empty-state compact achievements-empty' }, emptyFilterText());
  }
  // ul 안에 li 카드를 넣음. 카드 배치(격자)는 achievements.css의 .achievements-grid가 정함.
  const list = el('ul', { className: 'achievements-grid' });
  for (const item of visible) {
    list.append(renderCard(item));
  }
  return list;
}

// 보기 탭 버튼 하나를 만듦. 글자는 '달성 (5)'처럼 탭 이름 뒤에 개수를 붙임.
// btn btn-link에 aria-pressed를 주면 common.css의 글자 탭 모양(선택 시 굵은 글자 + 주황 밑줄)이 적용됨. 지도 페이지의 표시 기준 버튼과 같은 모양임.
function makeFilterButton(name, text, count) {
  const button = el('button', {
    id: 'achievements-filter-' + name,
    type: 'button',
    className: 'btn btn-link'
  }, text + ' (' + count + ')');
  // aria-pressed는 지금 선택된 탭인지 알려 주는 속성임. String()으로 true/false를 글자로 바꿔 넣음.
  button.setAttribute('aria-pressed', String(filter === name));
  return button;
}

/*
 * renderAchievements(context): boot()가 자료를 준비한 뒤 부르는 화면 그리기 함수.
 * context에는 app(본문 자리), catalog(영화 자료), snapshot(내 감상 기록) 등이 들어 있음.
 * 다른 탭에서 기록을 바꾸고 돌아오면 boot()가 이 함수를 다시 불러 화면을 처음부터 새로 그림.
 */
function renderAchievements(context) {
  const app = context.app;
  const catalog = context.catalog;
  const snapshot = context.snapshot;

  const heading = el('div', { className: 'page-heading' });
  heading.append(
    el('h1', {}, '업적'),
    el('p', { className: 'muted' }, '감상한 영화 수, 감상 시간, 장르 수에 따라 업적을 달성합니다. 달성한 업적과 다음 목표를 확인해 보세요.')
  );

  // 업적 계산은 selectors.js에 맡기고 이 파일은 정렬과 화면 그리기만 함.
  // slice()로 복사본을 만든 뒤 정렬해 buildProjections가 돌려준 원래 배열은 건드리지 않음.
  const projections = buildProjections(catalog, snapshot.logs);
  const items = projections.achievements.slice();
  items.sort(compareAchievements);

  // catalog.json에 업적 규칙이 하나도 없으면 안내 문구만 보여주고 끝냄.
  if (items.length === 0) {
    const empty = el('div', { className: 'empty-state' }, el('p', {}, '등록된 업적이 없습니다.'));
    app.replaceChildren(heading, empty);
    return;
  }

  // 달성한 업적 수를 셈. 탭 개수와 'N개 중 M개 달성' 문구에 함께 씀.
  let achievedCount = 0;
  for (const item of items) {
    if (item.achieved) {
      achievedCount += 1;
    }
  }
  const nextGoal = findNextGoal(items);

  // 보기 탭 세 개: 전체 (7) / 달성 (N) / 진행 중 (7 - N)
  const allButton = makeFilterButton('all', '전체', items.length);
  const achievedButton = makeFilterButton('achieved', '달성', achievedCount);
  const progressButton = makeFilterButton('inprogress', '진행 중', items.length - achievedCount);
  const filterButtons = [allButton, achievedButton, progressButton];

  // 카드 목록을 담는 자리임. 탭을 바꾸면 이 안의 내용만 바꿔 끼움.
  const listArea = el('div', { className: 'achievements-list-area' });
  listArea.append(renderCardList(items));

  // 탭을 눌렀을 때 실행됨. 선택을 filter에 기억하고, 세 버튼의 aria-pressed를 고친 뒤 카드 목록만 다시 그림.
  // 페이지 전체를 다시 그리지 않으므로 누른 버튼에 키보드 초점이 그대로 남음.
  function changeFilter(name) {
    filter = name;
    for (const button of filterButtons) {
      button.setAttribute('aria-pressed', String(button.id === 'achievements-filter-' + name));
    }
    listArea.replaceChildren(renderCardList(items));
  }

  // 버튼마다 이름 붙은 처리 함수를 따로 둠. 각 함수는 자기 탭 이름으로 changeFilter를 부름.
  function showAll() {
    changeFilter('all');
  }

  function showAchieved() {
    changeFilter('achieved');
  }

  function showInProgress() {
    changeFilter('inprogress');
  }

  allButton.addEventListener('click', showAll);
  achievedButton.addEventListener('click', showAchieved);
  progressButton.addEventListener('click', showInProgress);

  // role="group"과 aria-label로 세 버튼이 '업적 보기 기준'을 고르는 한 묶음임을 알림.
  const filterGroup = el('div', { className: 'achievements-filter', role: 'group', ariaLabel: '업적 보기 기준' });
  filterGroup.append(allButton, achievedButton, progressButton);

  const toolbar = el('div', { className: 'achievements-toolbar' });
  toolbar.append(filterGroup);

  // page-section은 common.css의 구역 간격(위쪽 48px)임.
  const listSection = el('section', { className: 'page-section achievements-list-section' });
  listSection.append(
    el('div', { className: 'section-heading' }, el('h2', {}, '업적 목록')),
    toolbar,
    listArea
  );

  // 본문(#app)의 기존 내용을 지우고 제목부터 다시 채움.
  // 기록이 없을 때만 제목 아래에 안내 상자를 넣고, 그 아래에 달성 현황과 업적 목록을 붙임.
  app.replaceChildren(heading);
  if (snapshot.logs.length === 0) {
    app.append(renderNotice());
  }
  app.append(renderSummary(items, achievedCount, nextGoal), listSection);
}

// page: 'achievements'는 메뉴에서 '업적'을 현재 페이지로 표시하는 데 쓰임(ui.js의 navigation 목록과 같은 이름).
// title은 브라우저 탭 제목, render는 화면을 그릴 함수임.
boot({
  page: 'achievements',
  title: '업적',
  render: renderAchievements
});
