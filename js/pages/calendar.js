import { boot, el } from '../ui.js';
import { groupLogsByDay } from '../selectors.js';

const now = new Date();
let year = now.getFullYear();
let month = now.getMonth();

function dateKey(y, m, day) {
  const monthText = String(m + 1).padStart(2, '0');
  const dayText = String(day).padStart(2, '0');
  return y + '-' + monthText + '-' + dayText;
}

let selected = dateKey(year, month, now.getDate());

function renderCalendar(context) {
  const app = context.app;
  const catalog = context.catalog;
  const snapshot = context.snapshot;
  const refresh = context.refresh;

  const logsByDay = groupLogsByDay(snapshot.logs);

  const heading = el('div', { className: 'page-heading' });
  const pageTitle = el('h1', {}, '감상 캘린더');
  const description = el('p', { className: 'muted' }, '날짜를 선택하면 그날의 감상 기록을 볼 수 있습니다.');
  heading.append(pageTitle, description);

  async function refreshCalendar(focusId) {
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

  function changeMonth(delta, focusId) {
    const moved = new Date(year, month + delta, 1);
    year = moved.getFullYear();
    month = moved.getMonth();
    selected = dateKey(year, month, 1);
    return refreshCalendar(focusId);
  }

  function showPreviousMonth() {
    return changeMonth(-1, 'calendar-previous');
  }

  function showNextMonth() {
    return changeMonth(1, 'calendar-next');
  }

  const previous = el('button', {
    id: 'calendar-previous',
    type: 'button',
    className: 'button secondary',
    ariaLabel: '이전 달'
  }, '이전 달');
  const next = el('button', {
    id: 'calendar-next',
    type: 'button',
    className: 'button secondary',
    ariaLabel: '다음 달'
  }, '다음 달');
  previous.addEventListener('click', showPreviousMonth);
  next.addEventListener('click', showNextMonth);

  const monthTitle = el('h2', { ariaLive: 'polite' }, `${year}년 ${month + 1}월`);
  const toolbar = el('div', { className: 'calendar-toolbar' });
  toolbar.append(previous, monthTitle, next);
  const calendarPanel = el('section', { className: 'calendar-panel' });
  calendarPanel.append(toolbar);

  const grid = el('div', {
    className: 'calendar-grid',
    ariaLabel: `${year}년 ${month + 1}월 감상 캘린더`
  });
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  for (const weekday of weekdays) {
    const weekdayLabel = el('div', { className: 'calendar-weekday' }, weekday);
    grid.append(weekdayLabel);
  }

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < firstWeekday; i++) {
    const spacer = el('div', { className: 'calendar-spacer', ariaHidden: 'true' });
    grid.append(spacer);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const key = dateKey(year, month, day);
    let dayLogs = logsByDay[key];
    if (dayLogs === undefined || dayLogs === null) {
      dayLogs = [];
    }

    const button = el('button', {
      id: 'calendar-day-' + key,
      type: 'button',
      className: 'calendar-day',
      ariaLabel: `${year}년 ${month + 1}월 ${day}일, 감상 ${dayLogs.length}회`
    });
    if (selected === key) {
      button.classList.add('selected');
      button.setAttribute('aria-pressed', 'true');
    } else {
      button.setAttribute('aria-pressed', 'false');
    }
    if (dayLogs.length > 0) {
      button.classList.add('has-records');
    }

    const dayNumber = el('span', {}, String(day));
    button.append(dayNumber);
    if (dayLogs.length > 0) {
      const logCount = el('small', {}, `${dayLogs.length}회`);
      button.append(logCount);
    }

    function selectDay() {
      selected = key;
      return refreshCalendar(button.id);
    }
    button.addEventListener('click', selectDay);
    grid.append(button);
  }
  calendarPanel.append(grid);

  const dayPanel = el('section', { className: 'day-records' });
  const dayTitle = el('h2', {}, selected);
  dayPanel.append(dayTitle);
  let selectedLogs = logsByDay[selected];
  if (selectedLogs === undefined || selectedLogs === null) {
    selectedLogs = [];
  }

  if (selectedLogs.length === 0) {
    const emptyMessage = el('p', { className: 'empty-state compact' }, '이날 남긴 감상 기록이 없습니다.');
    const searchLink = el('a', { href: 'movies.html', className: 'text-link' }, '영화 검색 페이지로 이동');
    dayPanel.append(emptyMessage, searchLink);
  }

  for (const row of selectedLogs) {
    const movie = catalog.lookup.movieById.get(row.movie_id);
    const record = el('article', { className: 'log-card' });
    let movieTitle;
    if (movie === undefined) {
      movieTitle = el('span', { className: 'item-title' }, `영화 정보 없음 (ID: ${row.movie_id})`);
    } else {
      movieTitle = el('a', {
        href: `movie.html?id=${encodeURIComponent(row.movie_id)}`,
        className: 'item-title'
      }, movie.title);
    }

    let ratingText = '별점 미입력';
    if (row.rating !== null) {
      ratingText = '★ ' + row.rating.toFixed(1);
    }
    const rating = el('p', { className: 'rating' }, ratingText);

    let reviewText = '감상평 없음';
    if (row.review_text) {
      reviewText = row.review_text;
    }
    const review = el('p', { className: 'review-text' }, reviewText);
    record.append(movieTitle, rating, review);
    dayPanel.append(record);
  }

  const layout = el('div', { className: 'calendar-layout' });
  layout.append(calendarPanel, dayPanel);
  app.replaceChildren(heading, layout);
}

boot({
  page: 'calendar',
  title: '감상 캘린더',
  render: renderCalendar
});
