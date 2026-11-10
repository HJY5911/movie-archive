import { boot, el } from '../ui.js';
import { buildProjections } from '../selectors.js';

const metricOrder = ['unique_movie_count', 'runtime_total', 'genre_count'];

let filter = 'all';

function compareAchievements(a, b) {
  const groupOrder = metricOrder.indexOf(a.metric) - metricOrder.indexOf(b.metric);
  if (groupOrder !== 0) {
    return groupOrder;
  }
  const targetOrder = a.target - b.target;
  if (targetOrder !== 0) {
    return targetOrder;
  }
  return a.rule_id.localeCompare(b.rule_id);
}

function formatNumber(value) {
  return value.toLocaleString('ko-KR');
}

function metricUnit(metric) {
  if (metric === 'unique_movie_count') {
    return '편';
  }
  if (metric === 'runtime_total') {
    return '분';
  }
  return '개';
}

function amountText(metric, value) {
  return formatNumber(value) + metricUnit(metric);
}

function conditionText(item) {
  if (item.metric === 'unique_movie_count') {
    return '서로 다른 영화 ' + amountText(item.metric, item.target) + ' 감상';
  }
  if (item.metric === 'runtime_total') {
    let text = '영화 ' + amountText(item.metric, item.target);
    if (item.target % 60 === 0) {
      text += '(' + formatNumber(item.target / 60) + '시간)';
    }
    return text + ' 감상';
  }
  return '서로 다른 장르 ' + amountText(item.metric, item.target) + ' 감상';
}

function remainingAmount(item) {
  return item.target - item.current;
}

function findNextGoal(items) {
  let best = null;
  for (const item of items) {
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

function renderNotice() {
  const notice = el('section', { className: 'empty-state achievements-notice' });
  notice.append(
    el('h2', {}, '아직 감상 기록이 없습니다'),
    el('p', {}, '영화를 보고 감상 기록을 남기면 아래 업적의 진행률이 올라갑니다.'),
    el('a', { href: 'index.html', className: 'btn btn-link' }, '메인에서 예시 기록 넣기')
  );
  return notice;
}

function renderNextGoal(nextGoal) {
  const box = el('section', { className: 'achievements-next' });
  box.append(el('h3', {}, '다음 목표'));

  if (nextGoal === null) {
    box.append(el('p', { className: 'achievements-next-text' }, '모든 업적을 달성했습니다.'));
    return box;
  }

  const sentence = el('p', { className: 'achievements-next-text' });
  sentence.append(
    el('strong', {}, nextGoal.label),
    '까지 ' + amountText(nextGoal.metric, remainingAmount(nextGoal)) + ' 남았습니다.'
  );
  const condition = el('p', { className: 'achievements-next-condition' }, '달성 조건: ' + conditionText(nextGoal));
  const link = el('a', { href: 'movies.html', className: 'text-link' }, '영화 찾으러 가기');
  box.append(sentence, condition, link);
  return box;
}

function renderSummary(items, achievedCount, nextGoal) {
  const total = items.length;
  let percent = 0;
  if (total > 0) {
    percent = Math.round(achievedCount / total * 100);
  }

  const overview = el('div', { className: 'achievements-overview' });
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

  const summary = el('section', { className: 'achievements-summary' });
  summary.append(el('div', { className: 'section-heading' }, el('h2', {}, '달성 현황')), body);
  return summary;
}

function renderCard(item) {
  const unit = metricUnit(item.metric);
  const card = el('li', { className: 'achievements-card' });

  let stateText = '달성';
  let stateClass = 'achievements-state achievements-state-achieved';
  if (item.achieved) {
    card.classList.add('achievements-card-achieved');
  } else {
    stateText = amountText(item.metric, remainingAmount(item)) + ' 남음';
    stateClass = 'achievements-state';
  }

  const top = el('div', { className: 'achievements-card-top' });
  top.append(
    el('h3', {}, item.label),
    el('span', { className: stateClass }, stateText)
  );

  const condition = el('p', { className: 'achievements-condition' }, conditionText(item));

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

function matchesFilter(item) {
  if (filter === 'achieved') {
    return item.achieved;
  }
  if (filter === 'inprogress') {
    return !item.achieved;
  }
  return true;
}

function emptyFilterText() {
  if (filter === 'achieved') {
    return '아직 달성한 업적이 없습니다.';
  }
  if (filter === 'inprogress') {
    return '진행 중인 업적이 없습니다. 모든 업적을 달성했습니다.';
  }
  return '등록된 업적이 없습니다.';
}

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
  const list = el('ul', { className: 'achievements-grid' });
  for (const item of visible) {
    list.append(renderCard(item));
  }
  return list;
}

function makeFilterButton(name, text, count) {
  const button = el('button', {
    id: 'achievements-filter-' + name,
    type: 'button',
    className: 'btn btn-link'
  }, text + ' (' + count + ')');
  button.setAttribute('aria-pressed', String(filter === name));
  return button;
}

function renderAchievements(context) {
  const app = context.app;
  const catalog = context.catalog;
  const snapshot = context.snapshot;

  const heading = el('div', { className: 'page-heading' });
  heading.append(
    el('h1', {}, '업적'),
    el('p', { className: 'muted' }, '감상한 영화 수, 감상 시간, 장르 수에 따라 업적을 달성합니다. 달성한 업적과 다음 목표를 확인해 보세요.')
  );

  const projections = buildProjections(catalog, snapshot.logs);
  const items = projections.achievements.slice();
  items.sort(compareAchievements);

  if (items.length === 0) {
    const empty = el('div', { className: 'empty-state' }, el('p', {}, '등록된 업적이 없습니다.'));
    app.replaceChildren(heading, empty);
    return;
  }

  let achievedCount = 0;
  for (const item of items) {
    if (item.achieved) {
      achievedCount += 1;
    }
  }
  const nextGoal = findNextGoal(items);

  const allButton = makeFilterButton('all', '전체', items.length);
  const achievedButton = makeFilterButton('achieved', '달성', achievedCount);
  const progressButton = makeFilterButton('inprogress', '진행 중', items.length - achievedCount);
  const filterButtons = [allButton, achievedButton, progressButton];

  const listArea = el('div', { className: 'achievements-list-area' });
  listArea.append(renderCardList(items));

  function changeFilter(name) {
    filter = name;
    for (const button of filterButtons) {
      button.setAttribute('aria-pressed', String(button.id === 'achievements-filter-' + name));
    }
    listArea.replaceChildren(renderCardList(items));
  }

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

  const filterGroup = el('div', { className: 'achievements-filter', role: 'group', ariaLabel: '업적 보기 기준' });
  filterGroup.append(allButton, achievedButton, progressButton);

  const toolbar = el('div', { className: 'achievements-toolbar' });
  toolbar.append(filterGroup);

  const listSection = el('section', { className: 'page-section achievements-list-section' });
  listSection.append(
    el('div', { className: 'section-heading' }, el('h2', {}, '업적 목록')),
    toolbar,
    listArea
  );

  app.replaceChildren(heading);
  if (snapshot.logs.length === 0) {
    app.append(renderNotice());
  }
  app.append(renderSummary(items, achievedCount, nextGoal), listSection);
}

boot({
  page: 'achievements',
  title: '업적',
  render: renderAchievements
});
