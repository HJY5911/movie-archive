/*
 * calendar.js — 저장된 감상 기록을 날짜별로 보여주는 캘린더 페이지
 *
 * 이 파일에서 하는 일:
 * 1. 현재 보고 있는 연도·월과 선택한 날짜를 기억합니다.
 * 2. 날짜 버튼을 만들고, 기록이 있는 날에 감상 횟수를 표시합니다.
 * 3. 이전 달·다음 달·날짜 버튼을 누르면 화면을 다시 그립니다.
 * 4. 선택한 날짜의 영화 제목·별점·감상평을 보여줍니다.
 *
 * 이 페이지는 기록을 읽는 화면입니다. 날짜를 선택해도 저장소의 기록은 바뀌지 않습니다.
 * 기록 추가·수정·삭제는 movie.js가 담당하는 영화 상세 페이지에서 수행합니다.
 * 영화 제목은 movie.html로, 검색 링크는 movies.js가 담당하는 movies.html로 이동합니다.
 *
 * HTML은 페이지의 빈 틀, CSS는 배치와 모양, 이 JS는 날짜 계산과 클릭 동작을 담당합니다.
 * 화면을 그리는 공통 준비 작업은 ui.js의 boot()가, 날짜별 묶음은 selectors.js가 담당합니다.
 */

// import는 다른 파일에서 export한 함수를 가져오는 문법입니다.
// '../'는 현재 js/pages 폴더에서 한 단계 위인 js 폴더를 뜻합니다.
// boot(): 메뉴·영화 자료·저장소를 준비한 뒤 아래 renderCalendar 함수를 호출합니다.
// el(): HTML 요소를 만드는 프로젝트 도우미입니다. 내부에서 document.createElement 등을 사용합니다.
import { boot, el } from '../ui.js';
// 캘린더에는 날짜별 기록만 필요하므로 전체 통계 대신 이 작은 함수를 사용합니다.
// groupLogsByDay(기록 배열)는 { '2026-10-11': [기록1, 기록2], ... } 형태의 객체를 반환합니다.
import { groupLogsByDay } from '../selectors.js';

// new Date()는 현재 시각을 담은 날짜 객체를 만듭니다.
// getFullYear(), getMonth(), getDate()는 브라우저 환경의 현지 날짜를 기준으로 값을 읽습니다.
const now = new Date();
// let은 나중에 값을 다시 대입할 수 있는 변수입니다. 월 이동 버튼을 누르면 아래 두 값이 바뀝니다.
let year = now.getFullYear();
// getMonth()의 결과는 0~11입니다. 1월은 0, 10월은 9, 12월은 11이므로 화면에는 1을 더해 표시합니다.
let month = now.getMonth();

/*
 * dateKey(y, m, day): 연도·월·일을 저장된 watched_on과 같은 YYYY-MM-DD 문자열로 만듭니다.
 * y: 연도, m: 0부터 시작하는 월, day: 1부터 시작하는 날짜입니다.
 * 예: dateKey(2026, 9, 3) → '2026-10-03'
 * 날짜를 비교하거나 날짜별 객체에서 기록을 찾을 때 모두 같은 문자열 형식을 사용해야 합니다.
 * 이 함수는 형식만 만들며, 날짜가 실제로 존재하는지 검사하는 함수는 아닙니다.
 */
function dateKey(y, m, day) {
  // String()은 숫자를 문자열로 바꾸고, padStart(2, '0')는 길이가 두 자리가 되도록 앞에 0을 붙입니다.
  const monthText = String(m + 1).padStart(2, '0');
  // 날짜 숫자도 1 → '01'처럼 두 자리로 만듭니다. 위의 monthText와 별개의 문자열입니다.
  const dayText = String(day).padStart(2, '0');
  // 문자열 사이의 +는 이어 붙이기입니다. return은 만들어진 문자열을 호출한 곳으로 돌려줍니다.
  return y + '-' + monthText + '-' + dayText;
}

// selected에는 사용자가 고른 날짜를 저장합니다. 처음 페이지를 열면 오늘을 선택합니다.
// 이 변수들은 renderCalendar 밖에 있으므로, 화면을 다시 그릴 때마다 오늘 날짜로 초기화되지 않습니다.
// 브라우저에서 페이지 자체를 새로고침하면 모듈이 다시 실행되므로 오늘부터 시작합니다.
let selected = dateKey(year, month, now.getDate());

/*
 * renderCalendar(context): 현재 상태와 기록에 맞게 캘린더 본문을 만듭니다.
 * context는 ui.js의 boot()가 전달하는 객체입니다. 필요한 항목을 아래에서 하나씩 꺼냅니다.
 * 별도의 반환값은 없으며 마지막에 app.replaceChildren()으로 화면을 바꿉니다.
 * 최초 실행 때와 refresh()를 호출했을 때 이 함수가 다시 실행됩니다.
 */
function renderCalendar(context) {
  // app: HTML의 <main id="app"> 요소. 완성한 본문을 넣을 자리입니다.
  const app = context.app;
  // catalog: 영화 기본 자료와 ID별 조회용 Map. 감상 기록의 movie_id로 영화 제목을 찾을 때 씁니다.
  const catalog = context.catalog;
  // snapshot: 저장소에서 방금 읽은 현재 프로필의 자료. snapshot.logs가 감상 기록 배열입니다.
  const snapshot = context.snapshot;
  // refresh: 최신 기록을 다시 읽고 renderCalendar를 재실행하는 함수입니다.
  // 함수 뒤에 ()를 붙이지 않았으므로 여기서는 실행하지 않고 함수 자체를 변수로 받아 둡니다.
  const refresh = context.refresh;

  // 날짜별 기록을 한 번만 묶어 두고, 아래의 모든 날짜 버튼과 기록 목록에서 함께 사용합니다.
  // 이 계산은 DB에 새 자료를 저장하지 않으며, snapshot.logs의 원래 배열을 변경하지 않습니다.
  const logsByDay = groupLogsByDay(snapshot.logs);

  // el(태그 이름, 속성 객체, 글자 또는 자식 요소)로 요소를 만들 수 있습니다.
  // 한 번에 여러 태그를 중첩하기보다 요소를 먼저 만들고 append로 붙여 순서를 드러냅니다.
  // el의 두 번째 인수 {}는 따로 지정할 속성이 없다는 뜻입니다.
  // heading은 제목과 소개 문장을 함께 담을 바깥 div입니다. className은 CSS 연결 이름입니다.
  const heading = el('div', { className: 'page-heading' });
  // h1 한 개를 만들고 그 안에 '감상 캘린더'라는 글자를 넣습니다. 아직 heading에는 붙이지 않습니다.
  const pageTitle = el('h1', {}, '감상 캘린더');
  // p는 페이지 사용 방법을 보여줄 문단이며 muted는 이 문단을 구분하기 위한 클래스입니다.
  const description = el('p', { className: 'muted' }, '날짜를 선택하면 그날의 감상 기록을 볼 수 있습니다.');
  // append(요소1, 요소2)는 부모의 맨 뒤에 자식을 적은 순서대로 추가합니다.
  // 결과: heading(div) 안에 pageTitle(h1), description(p)이 그 순서로 들어갑니다.
  heading.append(pageTitle, description);

  /*
   * refreshCalendar(focusId): 클릭 결과를 그린 뒤 같은 역할의 버튼으로 초점을 옮깁니다.
   * focusId는 새 화면에서 초점을 받을 요소의 id 문자열입니다.
   * refresh()는 본문 요소를 새로 만들기 때문에, 이전 버튼 객체에 focus()하면 안 됩니다.
   * 이 처리는 키보드로 버튼을 누른 뒤에도 계속 같은 위치에서 조작할 수 있도록 합니다.
   */
  async function refreshCalendar(focusId) {
    // async 함수는 Promise를 반환하며 await를 사용할 수 있습니다.
    // await는 이 함수 안에서 다음 줄로 진행하기 전에 비동기 작업의 완료를 기다립니다.
    // 브라우저 전체를 정지시키는 것은 아닙니다.
    try {
      // 저장소 읽기와 본문 교체가 모두 끝날 때까지 기다린 뒤 아래의 새 버튼 찾기로 진행합니다.
      await refresh();
    } catch (error) {
      // ui.js의 refresh가 이미 오류 안내를 표시한 뒤 오류를 다시 전달합니다.
      // 여기서 받아 종료하여 클릭 이벤트에서 처리되지 않은 Promise 오류가 남지 않게 합니다.
      // 같은 오류 알림을 중복 표시하지 않으며, 갱신이 실패했으므로 초점 복원도 하지 않습니다.
      return;
    }

    // getElementById는 id가 같은 요소를 찾습니다. 없으면 null을 반환합니다.
    // 반드시 갱신이 끝난 뒤 찾아야 새로 생성된 버튼을 얻을 수 있습니다.
    const target = document.getElementById(focusId);
    // 새 화면에 그 ID가 실제로 있는 경우에만 focus()를 실행합니다. null에 focus()를 호출하면 오류입니다.
    if (target !== null) {
      // focus()는 이 요소로 키보드 초점을 옮깁니다. 버튼을 클릭하거나 기록을 저장하는 명령은 아닙니다.
      target.focus();
    }
  }

  /*
   * changeMonth(delta, focusId): 현재 표시 월을 이동하고 1일을 선택합니다.
   * delta가 -1이면 이전 달, 1이면 다음 달입니다.
   * focusId는 월을 바꾼 뒤에도 같은 이동 버튼을 계속 사용할 수 있도록 전달합니다.
   */
  function changeMonth(delta, focusId) {
    // new Date(연도, 월, 일)는 지정한 날짜 객체를 만듭니다. 월은 여기서도 0부터 시작합니다.
    // 월이 범위를 벗어나면 연도를 자동 조정합니다. 12월 다음 달은 다음 해 1월이 됩니다.
    // 일을 1로 지정하므로 31일이 없는 달로 이동할 때 날짜가 다음 달로 넘어가는 문제를 피합니다.
    const moved = new Date(year, month + delta, 1);
    // 이동 결과의 연도를 저장합니다. 12월→1월 또는 1월→12월이면 연도도 바뀔 수 있습니다.
    year = moved.getFullYear();
    // 이동 결과의 월 번호(0~11)를 저장합니다. 화면을 다시 그릴 때 이 값을 읽습니다.
    month = moved.getMonth();
    // 새로 열린 달에서는 1일을 선택합니다. 이전 달에 선택했던 31일 등을 그대로 유지하지 않습니다.
    selected = dateKey(year, month, 1);
    // 내부에서 오류를 처리하는 refreshCalendar의 Promise를 그대로 반환합니다.
    return refreshCalendar(focusId);
  }

  // 각 버튼에 등록할 동작을 이름 있는 함수로 적습니다.
  function showPreviousMonth() {
    // -1은 한 달 전으로 이동하라는 뜻이며, 갱신 뒤 이전 달 버튼에 초점을 돌려놓습니다.
    return changeMonth(-1, 'calendar-previous');
  }

  // 다음 달 버튼의 클릭 처리를 담당하는 별도 함수입니다. 정의만 할 때는 실행되지 않습니다.
  function showNextMonth() {
    // 1은 한 달 후로 이동하라는 뜻이며, 갱신 뒤 다음 달 버튼에 초점을 돌려놓습니다.
    return changeMonth(1, 'calendar-next');
  }

  // type='button'은 폼 제출용이 아닌 일반 버튼입니다.
  // id는 갱신 후 초점 복원에, className은 CSS가 이 요소를 선택할 때 사용합니다.
  // ariaLabel은 화면 읽기 프로그램 등에 전달할 버튼의 이름입니다.
  // previous는 '이전 달' 글자가 들어간 button 요소를 가리킵니다. 속성 객체는 다음 네 줄입니다.
  const previous = el('button', {
    // 갱신 뒤 같은 역할의 버튼을 찾기 위한 고유 ID입니다.
    id: 'calendar-previous',
    // 이 버튼은 폼을 제출하지 않고 아래에 등록한 월 이동만 실행합니다.
    type: 'button',
    // button과 secondary라는 클래스 두 개를 붙입니다. 클릭 동작은 클래스가 아니라 이벤트가 정합니다.
    className: 'button secondary',
    // 버튼의 목적을 보조 기술에 전달합니다.
    ariaLabel: '이전 달'
  }, '이전 달');
  // 다음 달로 이동할 button 요소를 별도로 만듭니다. previous와는 다른 DOM 객체입니다.
  const next = el('button', {
    // 다음 달 버튼에 초점을 복원할 때 사용할 ID입니다.
    id: 'calendar-next',
    // 검색이나 기록 폼을 제출하지 않는 일반 버튼입니다.
    type: 'button',
    // 이전 달 버튼과 같은 CSS 클래스들을 적용합니다.
    className: 'button secondary',
    // 표시 글자와 함께 다음 달 이동 버튼임을 알려줍니다.
    ariaLabel: '다음 달'
  }, '다음 달');
  // addEventListener는 이벤트 발생 시 실행할 함수를 등록합니다. 지금 월을 이동하는 것은 아닙니다.
  // 함수 이름 뒤에 ()를 붙이지 않아야, 함수를 즉시 실행하지 않고 등록할 수 있습니다.
  previous.addEventListener('click', showPreviousMonth);
  // next 버튼에는 다음 달용 함수를 연결합니다. 클릭할 때마다 showNextMonth가 호출됩니다.
  next.addEventListener('click', showNextMonth);

  // 백틱(`...`)은 템플릿 문자열입니다. ${표현식} 자리에 계산한 결과가 들어갑니다.
  // 내부 월은 0~11이므로 month+1을 표시합니다. ariaLive는 제목 변경을 알리는 보조 정보입니다.
  // h2 요소 하나를 만들어 '2026년 10월'처럼 현재 연월을 넣고 monthTitle에 보관합니다.
  const monthTitle = el('h2', { ariaLive: 'polite' }, `${year}년 ${month + 1}월`);
  // toolbar는 이전 버튼·연월 제목·다음 버튼을 한 줄로 묶을 div입니다. 실제 배치는 CSS가 담당합니다.
  const toolbar = el('div', { className: 'calendar-toolbar' });
  // 위에서 만든 세 요소를 순서대로 붙입니다. 결과: toolbar(div) → [previous(button), monthTitle(h2), next(button)].
  toolbar.append(previous, monthTitle, next);
  // 달력 전체를 담을 section을 만듭니다. 이 안에는 위쪽 도구 모음과 아래쪽 날짜 칸이 들어갑니다.
  const calendarPanel = el('section', { className: 'calendar-panel' });
  // 완성한 toolbar를 calendarPanel의 첫 자식으로 붙입니다. 날짜 칸 grid는 아래에서 만들어 뒤에 붙입니다.
  calendarPanel.append(toolbar);

  // 실제 7열 배치는 CSS의 .calendar-grid 규칙이 정합니다. JS는 요일과 날짜를 순서대로 넣습니다.
  // grid는 요일 이름·앞쪽 빈칸·날짜 버튼을 담을 부모 div입니다.
  const grid = el('div', {
    // 이 클래스와 공통 CSS의 7열 Grid 규칙을 연결합니다.
    className: 'calendar-grid',
    // 어느 연월의 달력인지 설명하는 접근성 이름입니다.
    ariaLabel: `${year}년 ${month + 1}월 감상 캘린더`
  });
  // 일요일부터 토요일까지 표시할 글자 배열입니다. 배열 순서가 달력의 열 순서가 됩니다.
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  // for...of는 배열의 항목을 하나씩 꺼내 반복합니다. weekday에는 '일', '월', ...이 차례로 들어갑니다.
  for (const weekday of weekdays) {
    // 이번 반복의 요일 글자 하나를 담은 div를 만듭니다. 예: <div class="calendar-weekday">일</div>.
    const weekdayLabel = el('div', { className: 'calendar-weekday' }, weekday);
    // 요일 div를 grid의 맨 뒤에 추가합니다. 일곱 번 반복하면 첫 행에 요일 이름 일곱 개가 들어갑니다.
    grid.append(weekdayLabel);
  }

  // getDay()는 일요일 0~토요일 6의 요일 번호입니다. getDate()(몇 일인지)와 구분해야 합니다.
  const firstWeekday = new Date(year, month, 1).getDay();
  // 다음 달의 0일은 이번 달의 마지막 날입니다. 그 일자를 읽으면 이번 달의 날짜 수가 됩니다.
  // Date가 윤년을 계산하므로 2월 28일/29일을 따로 적을 필요가 없습니다.
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // 1일 앞에 빈칸을 넣어 요일을 맞춥니다. 예: 1일이 목요일(4)이면 빈칸을 네 개 만듭니다.
  // let i=0에서 시작해 i<firstWeekday인 동안 반복하고, i++로 매번 1을 더합니다.
  for (let i = 0; i < firstWeekday; i++) {
    // 빈칸은 날짜나 버튼이 아니므로 ariaHidden='true'로 보조 기술이 읽지 않게 합니다.
    const spacer = el('div', { className: 'calendar-spacer', ariaHidden: 'true' });
    // 빈 div 하나도 Grid의 한 칸을 차지하므로, 뒤에 오는 1일 버튼을 올바른 요일 열로 밀어 줍니다.
    grid.append(spacer);
  }

  // 이번 달의 1일부터 마지막 날까지 버튼을 하나씩 만듭니다.
  for (let day = 1; day <= daysInMonth; day++) {
    // 이번 날짜를 '2026-10-03' 같은 키로 만들어 저장된 watched_on과 같은 형식으로 비교합니다.
    const key = dateKey(year, month, day);
    // 대괄호 [key]는 key에 담긴 날짜 문자열을 객체의 속성 이름으로 사용한다는 뜻입니다.
    let dayLogs = logsByDay[key];
    // 기록이 없는 날짜는 객체에 항목 자체가 없으므로 undefined입니다. 빈 배열로 바꿔 다룹니다.
    // ||는 '또는', ===는 형변환 없이 같은 값인지 비교하는 연산자입니다.
    if (dayLogs === undefined || dayLogs === null) {
      // 빈 배열로 통일해 두면 기록 없는 날에도 dayLogs.length를 안전하게 사용할 수 있습니다.
      dayLogs = [];
    }

    // 이번 날짜의 클릭 가능한 button 요소를 만듭니다. 표시할 숫자와 횟수는 뒤에서 자식으로 붙입니다.
    const button = el('button', {
      // 날짜별로 다른 ID를 사용합니다. 예: calendar-day-2026-10-03.
      id: 'calendar-day-' + key,
      // 날짜 선택은 폼 제출 동작이 아니므로 일반 button으로 지정합니다.
      type: 'button',
      // 날짜 칸의 크기와 선택 강조에 사용할 CSS 클래스입니다.
      className: 'calendar-day',
      // 버튼의 날짜와 기록 수를 한 문장으로 알려줍니다. 화면에는 아래 숫자와 횟수를 따로 표시합니다.
      ariaLabel: `${year}년 ${month + 1}월 ${day}일, 감상 ${dayLogs.length}회`
    });
    // classList.add는 기존 클래스를 지우지 않고 클래스 이름 하나를 추가합니다.
    // selected는 선택한 날짜를 구분하는 클래스입니다. 현재 CSS의 강조는 aria-pressed="true"를 기준으로 합니다.
    // aria-pressed는 선택 여부를 화면 읽기 프로그램 같은 보조 기술에도 전달합니다.
    if (selected === key) {
      // 선택한 날짜에 selected 클래스를 추가합니다. 기본 calendar-day 클래스도 유지됩니다.
      button.classList.add('selected');
      // 선택 상태를 CSS와 보조 기술에 모두 전달합니다. 속성 값은 문자열 'true'입니다.
      button.setAttribute('aria-pressed', 'true');
    } else {
      // 선택하지 않은 나머지 날짜도 상태를 명시하여 '선택 안 됨'으로 표시합니다.
      button.setAttribute('aria-pressed', 'false');
    }
    // 한 건 이상의 기록이 있는 날짜만 별도의 표시용 클래스를 갖게 합니다.
    if (dayLogs.length > 0) {
      // has-records는 기록이 있는 날을 구분하는 이름입니다. 기록 내용을 바꾸는 명령은 아닙니다.
      button.classList.add('has-records');
    }

    // String(day)로 날짜 숫자를 글자로 바꿔 버튼 안에 표시합니다.
    const dayNumber = el('span', {}, String(day));
    // 버튼의 첫 자식으로 날짜 숫자를 넣습니다. 예: <button ...><span>3</span></button>.
    button.append(dayNumber);
    // length는 배열의 항목 수입니다. 같은 영화를 두 번 본 경우에도 감상 기록 두 건으로 셉니다.
    if (dayLogs.length > 0) {
      // small 요소에 '2회'처럼 이 날짜의 기록 수를 표시합니다. 같은 영화의 재감상도 각각 셉니다.
      const logCount = el('small', {}, `${dayLogs.length}회`);
      // 날짜 숫자 뒤에 횟수를 추가합니다. span과 small의 배치는 CSS가 정합니다.
      button.append(logCount);
    }

    // 이 함수는 클릭한 날짜만 바꿉니다. watched_on 등 실제 저장된 감상 기록은 수정하지 않습니다.
    // 반복마다 만들어진 key와 button을 함수가 기억하므로 각 버튼이 자기 날짜를 선택합니다(클로저).
    function selectDay() {
      // 선택 상태 변수만 이 날짜의 키로 바꿉니다. DB의 watched_on은 변경하지 않습니다.
      selected = key;
      // 새 선택 상태로 화면을 그린 뒤 같은 날짜 버튼의 ID를 찾아 초점을 돌려놓습니다.
      return refreshCalendar(button.id);
    }
    // 현재 날짜 버튼에 위 함수를 등록합니다. selectDay()처럼 지금 실행하는 것이 아닙니다.
    button.addEventListener('click', selectDay);
    // 숫자·횟수·클릭 동작이 준비된 날짜 버튼을 grid의 마지막 칸에 추가합니다.
    grid.append(button);
  }
  // 요일·빈칸·날짜가 모두 준비된 grid를 도구 모음 아래에 붙입니다. calendarPanel은 toolbar와 grid를 갖습니다.
  calendarPanel.append(grid);

  // 선택한 날짜의 기록 목록을 담을 별도 영역입니다. 빈칸·요일·날짜 버튼과 분리해서 만듭니다.
  const dayPanel = el('section', { className: 'day-records' });
  // 선택한 날짜 문자열을 기록 목록의 h2 제목으로 만듭니다.
  const dayTitle = el('h2', {}, selected);
  // dayPanel의 첫 자식으로 날짜 제목을 넣고, 뒤에는 이 날짜의 기록 article들을 붙일 예정입니다.
  dayPanel.append(dayTitle);
  // 날짜별 객체에서 선택한 날짜의 배열을 꺼냅니다. 날짜 버튼의 모든 기록과는 별개의 조회입니다.
  let selectedLogs = logsByDay[selected];
  // 해당 날짜의 항목이 없으면 반복문을 안전하게 돌릴 수 있도록 빈 배열을 사용합니다.
  if (selectedLogs === undefined || selectedLogs === null) {
    // 원본 logsByDay를 수정하지 않고 이 지역 변수에 빈 배열을 넣습니다.
    selectedLogs = [];
  }

  // 기록이 한 건도 없는 날에는 안내 문장과 영화 검색으로 이동할 링크를 보여줍니다.
  if (selectedLogs.length === 0) {
    // p 요소에 기록이 없다는 문장을 넣습니다. 클래스는 공통 안내 배치에 사용합니다.
    const emptyMessage = el('p', { className: 'empty-state compact' }, '이날 남긴 감상 기록이 없습니다.');
    // movies.js의 검색 화면으로 가는 링크입니다. 여기서 기록을 만들지는 않으며 영화 상세에서 작성합니다.
    const searchLink = el('a', { href: 'movies.html', className: 'text-link' }, '영화 검색 페이지로 이동');
    // 선택 날짜 제목 아래에 빈 기록 안내와 검색 링크를 순서대로 추가합니다.
    dayPanel.append(emptyMessage, searchLink);
  }

  // 기록이 0건이면 반복문을 한 번도 실행하지 않습니다.
  // 날짜별 배열에는 groupLogsByDay가 정한 최신 등록 시각 순서로 기록이 들어 있습니다.
  for (const row of selectedLogs) {
    // row는 감상 기록 한 건입니다. movie_id로 기본 영화 객체를 Map에서 찾습니다.
    const movie = catalog.lookup.movieById.get(row.movie_id);
    // 한 번의 감상 기록을 묶을 article입니다. 같은 영화를 여러 번 봤으면 각각 별도의 article이 됩니다.
    const record = el('article', { className: 'log-card' });
    // 영화 정보가 있으면 링크, 없으면 안내 span을 넣을 변수입니다. 아래 조건문에서 값을 결정합니다.
    let movieTitle;
    // catalog.json에서 영화를 지워도 예전에 브라우저에 저장한 기록은 남아 있을 수 있습니다.
    // Map의 get()은 ID를 찾지 못하면 undefined를 반환하므로, title에 접근하기 전에 확인합니다.
    if (movie === undefined) {
      // 기본 정보가 없는 영화는 잘못된 상세 링크 대신 안내 글자를 보여줍니다.
      // 기록을 삭제하지 않으며 아래의 별점과 감상평은 계속 표시합니다.
      movieTitle = el('span', { className: 'item-title' }, `영화 정보 없음 (ID: ${row.movie_id})`);
    } else {
      // encodeURIComponent는 영화 ID의 특수문자가 URL 구분자로 잘못 해석되지 않도록 합니다.
      // 링크의 이동 주소 계약은 movie.html?id=영화ID이며, 상세 페이지에서 이 ID를 읽어야 합니다.
      movieTitle = el('a', {
        // 이 감상 기록이 가리키는 영화 ID를 상세 페이지에 전달합니다.
        href: `movie.html?id=${encodeURIComponent(row.movie_id)}`,
        // 영화 제목 부분을 CSS에서 선택할 이름이며 링크 동작은 href가 정합니다.
        className: 'item-title'
      }, movie.title);
    }

    // null은 별점을 입력하지 않았다는 의미입니다. 실제 숫자 0과는 다른 값입니다.
    let ratingText = '별점 미입력';
    if (row.rating !== null) {
      // toFixed(1)은 소수점 한 자리까지 표시할 문자열을 만듭니다. 저장된 별점 자체를 바꾸지 않습니다.
      ratingText = '★ ' + row.rating.toFixed(1);
    }
    // 결정한 별점 문구를 p 요소에 넣습니다. rating 클래스는 화면 표시용 이름입니다.
    const rating = el('p', { className: 'rating' }, ratingText);

    // 감상평이 비어 있을 때 사용할 기본 안내를 먼저 준비합니다.
    let reviewText = '감상평 없음';
    // null이나 빈 문자열('')은 거짓으로 취급되므로 기본 문구를 유지합니다.
    // 값이 있는 경우에는 실제 감상평으로 바꿉니다. el은 이 글자를 HTML로 해석하지 않고 넣습니다.
    if (row.review_text) {
      // 작성된 감상평이 있으면 기본 안내 대신 그 문자열을 사용합니다.
      reviewText = row.review_text;
    }
    // 감상평 문자열을 문단에 넣습니다. 태그를 실행하는 innerHTML을 사용하지 않습니다.
    const review = el('p', { className: 'review-text' }, reviewText);
    // article 안을 영화 제목 → 별점 → 감상평 순서로 구성합니다.
    record.append(movieTitle, rating, review);
    // 완성한 감상 기록 한 개를 날짜별 기록 section의 마지막에 추가합니다.
    dayPanel.append(record);
  }

  // CSS가 달력과 기록 영역의 위치를 정할 수 있도록 같은 컨테이너 안에 순서대로 넣습니다.
  const layout = el('div', { className: 'calendar-layout' });
  // layout의 첫 자식은 달력 section, 둘째 자식은 선택 날짜의 기록 section입니다.
  layout.append(calendarPanel, dayPanel);
  // replaceChildren은 app 자체는 유지하고 기존 본문 자식만 새 요소들로 교체합니다.
  // 로딩 표시 또는 이전 달력이 사라지고 새 화면이 나타납니다. DB의 기록은 삭제하지 않습니다.
  app.replaceChildren(heading, layout);
}

// 준비 함수에 화면을 그릴 함수의 이름을 전달합니다. renderCalendar()로 즉시 호출하지 않습니다.
// boot가 데이터 준비를 마치면 renderCalendar(context)를 호출하여 처음 화면을 만듭니다.
// page는 현재 메뉴 표시용, title은 브라우저 탭 제목입니다.
boot({
  // 공통 메뉴에서 캘린더 항목을 '현재'로 표시할 때 사용할 구분값입니다.
  page: 'calendar',
  // 브라우저 탭에 표시할 제목입니다. 화면 h1은 renderCalendar에서 별도로 만듭니다.
  title: '감상 캘린더',
  // 자료 준비 후 실행할 함수 자체를 넘깁니다. boot가 context를 전달해 호출합니다.
  render: renderCalendar
});
