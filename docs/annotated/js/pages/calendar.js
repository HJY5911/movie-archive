/*
 * calendar.js — 저장된 감상 기록을 날짜별로 보여주는 캘린더 페이지
 *
 * 이 파일에서 하는 일:
 * 1. 현재 보고 있는 연도·월과 선택한 날짜를 기억함.
 * 2. 날짜 버튼을 만들고, 기록이 있는 날에 감상 횟수를 표시함.
 * 3. 이전 달·다음 달·날짜 버튼을 누르면 화면을 다시 그림.
 * 4. 선택한 날짜의 영화 제목·별점·감상평을 보여줌.
 *
 * 이 페이지는 기록을 읽는 화면임. 날짜를 선택해도 저장소의 기록은 바뀌지 않음.
 * 기록 추가·수정·삭제는 movie.js가 담당하는 영화 상세 페이지에서 수행함.
 * 영화 제목은 movie.html로, 검색 링크는 movies.js가 담당하는 movies.html로 이동함.
 *
 * HTML은 페이지의 빈 틀, CSS는 배치와 모양, 이 JS는 날짜 계산과 클릭 동작을 담당함.
 * 화면을 그리는 공통 준비 작업은 ui.js의 boot()가, 날짜별 묶음은 selectors.js가 담당함.
 */

// import는 다른 파일에서 export한 함수를 가져오는 문법임.
// '../'는 현재 js/pages 폴더에서 한 단계 위인 js 폴더를 뜻함.
// boot(): 메뉴·영화 자료·저장소를 준비한 뒤 아래 renderCalendar 함수를 호출함.
// el(): HTML 요소를 만드는 프로젝트 도우미임. 내부에서 document.createElement 등을 사용함.
import { boot, el } from '../ui.js';
// 캘린더에는 날짜별 기록만 필요하므로 전체 통계 대신 이 작은 함수를 사용함.
// groupLogsByDay(기록 배열)는 { '2026-10-11': [기록1, 기록2], ... } 형태의 객체를 반환함.
import { groupLogsByDay } from '../selectors.js';

// new Date()는 현재 시각을 담은 날짜 객체를 만듦.
// getFullYear(), getMonth(), getDate()는 브라우저 환경의 현지 날짜를 기준으로 값을 읽음.
const now = new Date();
// let은 나중에 값을 다시 대입할 수 있는 변수임. 월 이동 버튼을 누르면 아래 두 값이 바뀜.
let year = now.getFullYear();
// getMonth()의 결과는 0~11임. 1월은 0, 10월은 9, 12월은 11이므로 화면에는 1을 더해 표시함.
let month = now.getMonth();

/*
 * dateKey(y, m, day): 연도·월·일을 저장된 watched_on과 같은 YYYY-MM-DD 문자열로 만듦.
 * y: 연도, m: 0부터 시작하는 월, day: 1부터 시작하는 날짜임.
 * 예: dateKey(2026, 9, 3) → '2026-10-03'
 * 날짜를 비교하거나 날짜별 객체에서 기록을 찾을 때 모두 같은 문자열 형식을 사용해야 함.
 * 이 함수는 형식만 만들며, 날짜가 실제로 존재하는지 검사하는 함수는 아님.
 */
function dateKey(y, m, day) {
  // String()은 숫자를 문자열로 바꾸고, padStart(2, '0')는 길이가 두 자리가 되도록 앞에 0을 붙임.
  const monthText = String(m + 1).padStart(2, '0');
  // 날짜 숫자도 1 → '01'처럼 두 자리로 만듦. 위의 monthText와 별개의 문자열임.
  const dayText = String(day).padStart(2, '0');
  // 문자열 사이의 +는 이어 붙이기임. return은 만들어진 문자열을 호출한 곳으로 돌려줌.
  return y + '-' + monthText + '-' + dayText;
}

// selected에는 사용자가 고른 날짜를 저장함. 처음 페이지를 열면 오늘을 선택함.
// 이 변수들은 renderCalendar 밖에 있으므로, 화면을 다시 그릴 때마다 오늘 날짜로 초기화되지 않음.
// 브라우저에서 페이지 자체를 새로고침하면 모듈이 다시 실행되므로 오늘부터 시작함.
let selected = dateKey(year, month, now.getDate());

/*
 * renderCalendar(context): 현재 상태와 기록에 맞게 캘린더 본문을 만듦.
 * context는 ui.js의 boot()가 전달하는 객체임. 필요한 항목을 아래에서 하나씩 꺼냄.
 * 별도의 반환값은 없으며 마지막에 app.replaceChildren()으로 화면을 바꿈.
 * 최초 실행 때와 refresh()를 호출했을 때 이 함수가 다시 실행됨.
 */
function renderCalendar(context) {
  // app: HTML의 <main id="app"> 요소. 완성한 본문을 넣을 자리임.
  const app = context.app;
  // catalog: 영화 기본 자료와 ID별 조회용 Map. 감상 기록의 movie_id로 영화 제목을 찾을 때 씀.
  const catalog = context.catalog;
  // snapshot: 저장소에서 방금 읽은 현재 프로필의 자료. snapshot.logs가 감상 기록 배열임.
  const snapshot = context.snapshot;
  // refresh: 최신 기록을 다시 읽고 renderCalendar를 재실행하는 함수임.
  // 함수 뒤에 ()를 붙이지 않았으므로 여기서는 실행하지 않고 함수 자체를 변수로 받아 둠.
  const refresh = context.refresh;

  // 날짜별 기록을 한 번만 묶어 두고, 아래의 모든 날짜 버튼과 기록 목록에서 함께 사용함.
  // 이 계산은 DB에 새 자료를 저장하지 않으며, snapshot.logs의 원래 배열을 변경하지 않음.
  const logsByDay = groupLogsByDay(snapshot.logs);

  // el(태그 이름, 속성 객체, 글자 또는 자식 요소)로 요소를 만들 수 있음.
  // 한 번에 여러 태그를 중첩하기보다 요소를 먼저 만들고 append로 붙여 순서를 드러냄.
  // el의 두 번째 인수 {}는 따로 지정할 속성이 없다는 뜻임.
  // heading은 제목과 소개 문장을 함께 담을 바깥 div임. className은 CSS 연결 이름임.
  const heading = el('div', { className: 'page-heading' });
  // h1 한 개를 만들고 그 안에 '감상 캘린더'라는 글자를 넣음. 아직 heading에는 붙이지 않음.
  const pageTitle = el('h1', {}, '감상 캘린더');
  // p는 페이지 사용 방법을 보여줄 문단이며 muted는 이 문단을 구분하기 위한 클래스임.
  const description = el('p', { className: 'muted' }, '날짜를 선택하면 그날의 감상 기록을 볼 수 있습니다.');
  // append(요소1, 요소2)는 부모의 맨 뒤에 자식을 적은 순서대로 추가함.
  // 결과: heading(div) 안에 pageTitle(h1), description(p)이 그 순서로 들어감.
  heading.append(pageTitle, description);

  /*
   * refreshCalendar(focusId): 클릭 결과를 그린 뒤 같은 역할의 버튼으로 초점을 옮김.
   * focusId는 새 화면에서 초점을 받을 요소의 id 문자열임.
   * refresh()는 본문 요소를 새로 만들기 때문에, 이전 버튼 객체에 focus()하면 안 됨.
   * 이 처리는 키보드로 버튼을 누른 뒤에도 계속 같은 위치에서 조작할 수 있도록 함.
   */
  async function refreshCalendar(focusId) {
    // async 함수는 Promise를 반환하며 await를 사용할 수 있음.
    // await는 이 함수 안에서 다음 줄로 진행하기 전에 비동기 작업의 완료를 기다림.
    // 브라우저 전체를 정지시키는 것은 아님.
    try {
      // 저장소 읽기와 본문 교체가 모두 끝날 때까지 기다린 뒤 아래의 새 버튼 찾기로 진행함.
      await refresh();
    } catch (error) {
      // ui.js의 refresh가 이미 오류 안내를 표시한 뒤 오류를 다시 전달함.
      // 여기서 받아 종료하여 클릭 이벤트에서 처리되지 않은 Promise 오류가 남지 않게 함.
      // 같은 오류 알림을 중복 표시하지 않으며, 갱신이 실패했으므로 초점 복원도 하지 않음.
      return;
    }

    // getElementById는 id가 같은 요소를 찾음. 없으면 null을 반환함.
    // 반드시 갱신이 끝난 뒤 찾아야 새로 생성된 버튼을 얻을 수 있음.
    const target = document.getElementById(focusId);
    // 새 화면에 그 ID가 실제로 있는 경우에만 focus()를 실행함. null에 focus()를 호출하면 오류임.
    if (target !== null) {
      // focus()는 이 요소로 키보드 초점을 옮김. 버튼을 클릭하거나 기록을 저장하는 명령은 아님.
      target.focus();
    }
  }

  /*
   * changeMonth(delta, focusId): 현재 표시 월을 이동하고 1일을 선택함.
   * delta가 -1이면 이전 달, 1이면 다음 달임.
   * focusId는 월을 바꾼 뒤에도 같은 이동 버튼을 계속 사용할 수 있도록 전달함.
   */
  function changeMonth(delta, focusId) {
    // new Date(연도, 월, 일)는 지정한 날짜 객체를 만듦. 월은 여기서도 0부터 시작함.
    // 월이 범위를 벗어나면 연도를 자동 조정함. 12월 다음 달은 다음 해 1월이 됨.
    // 일을 1로 지정하므로 31일이 없는 달로 이동할 때 날짜가 다음 달로 넘어가는 문제를 피함.
    const moved = new Date(year, month + delta, 1);
    // 이동 결과의 연도를 저장함. 12월→1월 또는 1월→12월이면 연도도 바뀔 수 있음.
    year = moved.getFullYear();
    // 이동 결과의 월 번호(0~11)를 저장함. 화면을 다시 그릴 때 이 값을 읽음.
    month = moved.getMonth();
    // 새로 열린 달에서는 1일을 선택함. 이전 달에 선택했던 31일 등을 그대로 유지하지 않음.
    selected = dateKey(year, month, 1);
    // 내부에서 오류를 처리하는 refreshCalendar의 Promise를 그대로 반환함.
    return refreshCalendar(focusId);
  }

  // 각 버튼에 등록할 동작을 이름 있는 함수로 적음.
  function showPreviousMonth() {
    // -1은 한 달 전으로 이동하라는 뜻이며, 갱신 뒤 이전 달 버튼에 초점을 돌려놓음.
    return changeMonth(-1, 'calendar-previous');
  }

  // 다음 달 버튼의 클릭 처리를 담당하는 별도 함수임. 정의만 할 때는 실행되지 않음.
  function showNextMonth() {
    // 1은 한 달 후로 이동하라는 뜻이며, 갱신 뒤 다음 달 버튼에 초점을 돌려놓음.
    return changeMonth(1, 'calendar-next');
  }

  // type='button'은 폼 제출용이 아닌 일반 버튼임.
  // id는 갱신 후 초점 복원에, className은 CSS가 이 요소를 선택할 때 사용함.
  // ariaLabel은 화면 읽기 프로그램 등에 전달할 버튼의 이름임.
  // previous는 '이전 달' 글자가 들어간 button 요소를 가리킴. 속성 객체는 다음 네 줄임.
  const previous = el('button', {
    // 갱신 뒤 같은 역할의 버튼을 찾기 위한 고유 ID임.
    id: 'calendar-previous',
    // 이 버튼은 폼을 제출하지 않고 아래에 등록한 월 이동만 실행함.
    type: 'button',
    // button과 secondary라는 클래스 두 개를 붙임. 클릭 동작은 클래스가 아니라 이벤트가 정함.
    className: 'button secondary',
    // 버튼의 목적을 보조 기술에 전달함.
    ariaLabel: '이전 달'
  }, '이전 달');
  // 다음 달로 이동할 button 요소를 별도로 만듦. previous와는 다른 DOM 객체임.
  const next = el('button', {
    // 다음 달 버튼에 초점을 복원할 때 사용할 ID임.
    id: 'calendar-next',
    // 검색이나 기록 폼을 제출하지 않는 일반 버튼임.
    type: 'button',
    // 이전 달 버튼과 같은 CSS 클래스들을 적용함.
    className: 'button secondary',
    // 표시 글자와 함께 다음 달 이동 버튼임을 알려줌.
    ariaLabel: '다음 달'
  }, '다음 달');
  // addEventListener는 이벤트 발생 시 실행할 함수를 등록함. 지금 월을 이동하는 것은 아님.
  // 함수 이름 뒤에 ()를 붙이지 않아야, 함수를 즉시 실행하지 않고 등록할 수 있음.
  previous.addEventListener('click', showPreviousMonth);
  // next 버튼에는 다음 달용 함수를 연결함. 클릭할 때마다 showNextMonth가 호출됨.
  next.addEventListener('click', showNextMonth);

  // 백틱(`...`)은 템플릿 문자열임. ${표현식} 자리에 계산한 결과가 들어감.
  // 내부 월은 0~11이므로 month+1을 표시함. ariaLive는 제목 변경을 알리는 보조 정보임.
  // h2 요소 하나를 만들어 '2026년 10월'처럼 현재 연월을 넣고 monthTitle에 보관함.
  const monthTitle = el('h2', { ariaLive: 'polite' }, `${year}년 ${month + 1}월`);
  // toolbar는 이전 버튼·연월 제목·다음 버튼을 한 줄로 묶을 div임. 실제 배치는 CSS가 담당함.
  const toolbar = el('div', { className: 'calendar-toolbar' });
  // 위에서 만든 세 요소를 순서대로 붙임. 결과: toolbar(div) → [previous(button), monthTitle(h2), next(button)].
  toolbar.append(previous, monthTitle, next);
  // 달력 전체를 담을 section을 만듦. 이 안에는 위쪽 도구 모음과 아래쪽 날짜 칸이 들어감.
  const calendarPanel = el('section', { className: 'calendar-panel' });
  // 완성한 toolbar를 calendarPanel의 첫 자식으로 붙임. 날짜 칸 grid는 아래에서 만들어 뒤에 붙임.
  calendarPanel.append(toolbar);

  // 실제 7열 배치는 CSS의 .calendar-grid 규칙이 정함. JS는 요일과 날짜를 순서대로 넣음.
  // grid는 요일 이름·앞쪽 빈칸·날짜 버튼을 담을 부모 div임.
  const grid = el('div', {
    // 이 클래스와 공통 CSS의 7열 Grid 규칙을 연결함.
    className: 'calendar-grid',
    // 어느 연월의 달력인지 설명하는 접근성 이름임.
    ariaLabel: `${year}년 ${month + 1}월 감상 캘린더`
  });
  // 일요일부터 토요일까지 표시할 글자 배열임. 배열 순서가 달력의 열 순서가 됨.
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  // for...of는 배열의 항목을 하나씩 꺼내 반복함. weekday에는 '일', '월', ...이 차례로 들어감.
  for (const weekday of weekdays) {
    // 이번 반복의 요일 글자 하나를 담은 div를 만듦. 예: <div class="calendar-weekday">일</div>.
    const weekdayLabel = el('div', { className: 'calendar-weekday' }, weekday);
    // 요일 div를 grid의 맨 뒤에 추가함. 일곱 번 반복하면 첫 행에 요일 이름 일곱 개가 들어감.
    grid.append(weekdayLabel);
  }

  // getDay()는 일요일 0~토요일 6의 요일 번호임. getDate()(몇 일인지)와 구분해야 함.
  const firstWeekday = new Date(year, month, 1).getDay();
  // 다음 달의 0일은 이번 달의 마지막 날임. 그 일자를 읽으면 이번 달의 날짜 수가 됨.
  // Date가 윤년을 계산하므로 2월 28일/29일을 따로 적을 필요가 없음.
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // 1일 앞에 빈칸을 넣어 요일을 맞춤. 예: 1일이 목요일(4)이면 빈칸을 네 개 만듦.
  // let i=0에서 시작해 i<firstWeekday인 동안 반복하고, i++로 매번 1을 더함.
  for (let i = 0; i < firstWeekday; i++) {
    // 빈칸은 날짜나 버튼이 아니므로 ariaHidden='true'로 보조 기술이 읽지 않게 함.
    const spacer = el('div', { className: 'calendar-spacer', ariaHidden: 'true' });
    // 빈 div 하나도 Grid의 한 칸을 차지하므로, 뒤에 오는 1일 버튼을 올바른 요일 열로 밀어 줌.
    grid.append(spacer);
  }

  // 이번 달의 1일부터 마지막 날까지 버튼을 하나씩 만듦.
  for (let day = 1; day <= daysInMonth; day++) {
    // 이번 날짜를 '2026-10-03' 같은 키로 만들어 저장된 watched_on과 같은 형식으로 비교함.
    const key = dateKey(year, month, day);
    // 대괄호 [key]는 key에 담긴 날짜 문자열을 객체의 속성 이름으로 사용한다는 뜻임.
    let dayLogs = logsByDay[key];
    // 기록이 없는 날짜는 객체에 항목 자체가 없으므로 undefined임. 빈 배열로 바꿔 다룸.
    // ||는 '또는', ===는 형변환 없이 같은 값인지 비교하는 연산자임.
    if (dayLogs === undefined || dayLogs === null) {
      // 빈 배열로 통일해 두면 기록 없는 날에도 dayLogs.length를 안전하게 사용할 수 있음.
      dayLogs = [];
    }

    // 이번 날짜의 클릭 가능한 button 요소를 만듦. 표시할 숫자와 횟수는 뒤에서 자식으로 붙임.
    const button = el('button', {
      // 날짜별로 다른 ID를 사용함. 예: calendar-day-2026-10-03.
      id: 'calendar-day-' + key,
      // 날짜 선택은 폼 제출 동작이 아니므로 일반 button으로 지정함.
      type: 'button',
      // 날짜 칸의 크기와 선택 강조에 사용할 CSS 클래스임.
      className: 'calendar-day',
      // 버튼의 날짜와 기록 수를 한 문장으로 알려줌. 화면에는 아래 숫자와 횟수를 따로 표시함.
      ariaLabel: `${year}년 ${month + 1}월 ${day}일, 감상 ${dayLogs.length}회`
    });
    // classList.add는 기존 클래스를 지우지 않고 클래스 이름 하나를 추가함.
    // selected는 선택한 날짜를 구분하는 클래스임. 현재 CSS의 강조는 aria-pressed="true"를 기준으로 함.
    // aria-pressed는 선택 여부를 화면 읽기 프로그램 같은 보조 기술에도 전달함.
    if (selected === key) {
      // 선택한 날짜에 selected 클래스를 추가함. 기본 calendar-day 클래스도 유지됨.
      button.classList.add('selected');
      // 선택 상태를 CSS와 보조 기술에 모두 전달함. 속성 값은 문자열 'true'임.
      button.setAttribute('aria-pressed', 'true');
    } else {
      // 선택하지 않은 나머지 날짜도 상태를 명시하여 '선택 안 됨'으로 표시함.
      button.setAttribute('aria-pressed', 'false');
    }
    // 한 건 이상의 기록이 있는 날짜만 별도의 표시용 클래스를 갖게 함.
    if (dayLogs.length > 0) {
      // has-records는 기록이 있는 날을 구분하는 이름임. 기록 내용을 바꾸는 명령은 아님.
      button.classList.add('has-records');
    }

    // String(day)로 날짜 숫자를 글자로 바꿔 버튼 안에 표시함.
    const dayNumber = el('span', {}, String(day));
    // 버튼의 첫 자식으로 날짜 숫자를 넣음. 예: <button ...><span>3</span></button>.
    button.append(dayNumber);
    // length는 배열의 항목 수임. 같은 영화를 두 번 본 경우에도 감상 기록 두 건으로 셈.
    if (dayLogs.length > 0) {
      // small 요소에 '2회'처럼 이 날짜의 기록 수를 표시함. 같은 영화의 재감상도 각각 셈.
      const logCount = el('small', {}, `${dayLogs.length}회`);
      // 날짜 숫자 뒤에 횟수를 추가함. span과 small의 배치는 CSS가 정함.
      button.append(logCount);
    }

    // 이 함수는 클릭한 날짜만 바꿈. watched_on 등 실제 저장된 감상 기록은 수정하지 않음.
    // 반복마다 만들어진 key와 button을 함수가 기억하므로 각 버튼이 자기 날짜를 선택함(클로저).
    function selectDay() {
      // 선택 상태 변수만 이 날짜의 키로 바꿈. DB의 watched_on은 변경하지 않음.
      selected = key;
      // 새 선택 상태로 화면을 그린 뒤 같은 날짜 버튼의 ID를 찾아 초점을 돌려놓음.
      return refreshCalendar(button.id);
    }
    // 현재 날짜 버튼에 위 함수를 등록함. selectDay()처럼 지금 실행하는 것이 아님.
    button.addEventListener('click', selectDay);
    // 숫자·횟수·클릭 동작이 준비된 날짜 버튼을 grid의 마지막 칸에 추가함.
    grid.append(button);
  }
  // 요일·빈칸·날짜가 모두 준비된 grid를 도구 모음 아래에 붙임. calendarPanel에는 toolbar와 grid가 들어 있음.
  calendarPanel.append(grid);

  // 선택한 날짜의 기록 목록을 담을 별도 영역임. 빈칸·요일·날짜 버튼과 분리해서 만듦.
  const dayPanel = el('section', { className: 'day-records' });
  // 선택한 날짜 문자열을 기록 목록의 h2 제목으로 만듦.
  const dayTitle = el('h2', {}, selected);
  // dayPanel의 첫 자식으로 날짜 제목을 넣고, 뒤에는 이 날짜의 기록 article들을 붙일 예정임.
  dayPanel.append(dayTitle);
  // 날짜별 객체에서 선택한 날짜의 배열을 꺼냄. 날짜 버튼의 모든 기록과는 별개의 조회임.
  let selectedLogs = logsByDay[selected];
  // 해당 날짜의 항목이 없으면 반복문을 안전하게 돌릴 수 있도록 빈 배열을 사용함.
  if (selectedLogs === undefined || selectedLogs === null) {
    // 원본 logsByDay를 수정하지 않고 이 지역 변수에 빈 배열을 넣음.
    selectedLogs = [];
  }

  // 기록이 한 건도 없는 날에는 안내 문장과 영화 검색으로 이동할 링크를 보여줌.
  if (selectedLogs.length === 0) {
    // p 요소에 기록이 없다는 문장을 넣음. 클래스는 공통 안내 배치에 사용함.
    const emptyMessage = el('p', { className: 'empty-state compact' }, '이날 남긴 감상 기록이 없습니다.');
    // movies.js의 검색 화면으로 가는 링크임. 여기서 기록을 만들지는 않으며 영화 상세에서 작성함.
    const searchLink = el('a', { href: 'movies.html', className: 'text-link' }, '영화 검색 페이지로 이동');
    // 선택 날짜 제목 아래에 빈 기록 안내와 검색 링크를 순서대로 추가함.
    dayPanel.append(emptyMessage, searchLink);
  }

  // 기록이 0건이면 반복문을 한 번도 실행하지 않음.
  // 날짜별 배열에는 groupLogsByDay가 정한 최신 등록 시각 순서로 기록이 들어 있음.
  for (const row of selectedLogs) {
    // row는 감상 기록 한 건임. movie_id로 기본 영화 객체를 Map에서 찾음.
    const movie = catalog.lookup.movieById.get(row.movie_id);
    // 한 번의 감상 기록을 묶을 article임. 같은 영화를 여러 번 봤으면 각각 별도의 article이 됨.
    const record = el('article', { className: 'log-card' });
    // 영화 정보가 있으면 링크, 없으면 안내 span을 넣을 변수임. 아래 조건문에서 값을 결정함.
    let movieTitle;
    // catalog.json에서 영화를 지워도 예전에 브라우저에 저장한 기록은 남아 있을 수 있음.
    // Map의 get()은 ID를 찾지 못하면 undefined를 반환하므로, title에 접근하기 전에 확인함.
    if (movie === undefined) {
      // 기본 정보가 없는 영화는 잘못된 상세 링크 대신 안내 글자를 보여줌.
      // 기록을 삭제하지 않으며 아래의 별점과 감상평은 계속 표시함.
      movieTitle = el('span', { className: 'item-title' }, `영화 정보 없음 (ID: ${row.movie_id})`);
    } else {
      // encodeURIComponent는 영화 ID의 특수문자가 URL 구분자로 잘못 해석되지 않도록 함.
      // 링크의 이동 주소 계약은 movie.html?id=영화ID이며, 상세 페이지에서 이 ID를 읽어야 함.
      movieTitle = el('a', {
        // 이 감상 기록이 가리키는 영화 ID를 상세 페이지에 전달함.
        href: `movie.html?id=${encodeURIComponent(row.movie_id)}`,
        // 영화 제목 부분을 CSS에서 선택할 이름이며 링크 동작은 href가 정함.
        className: 'item-title'
      }, movie.title);
    }

    // null은 별점을 입력하지 않았다는 의미임. 실제 숫자 0과는 다른 값임.
    let ratingText = '별점 미입력';
    if (row.rating !== null) {
      // toFixed(1)은 소수점 한 자리까지 표시할 문자열을 만듦. 저장된 별점 자체를 바꾸지 않음.
      ratingText = '★ ' + row.rating.toFixed(1);
    }
    // 결정한 별점 문구를 p 요소에 넣음. rating 클래스는 화면 표시용 이름임.
    const rating = el('p', { className: 'rating' }, ratingText);

    // 감상평이 비어 있을 때 사용할 기본 안내를 먼저 준비함.
    let reviewText = '감상평 없음';
    // null이나 빈 문자열('')은 거짓으로 취급되므로 기본 문구를 유지함.
    // 값이 있는 경우에는 실제 감상평으로 바꿈. el은 이 글자를 HTML로 해석하지 않고 넣음.
    if (row.review_text) {
      // 작성된 감상평이 있으면 기본 안내 대신 그 문자열을 사용함.
      reviewText = row.review_text;
    }
    // 감상평 문자열을 문단에 넣음. 태그를 실행하는 innerHTML을 사용하지 않음.
    const review = el('p', { className: 'review-text' }, reviewText);
    // article 안을 영화 제목 → 별점 → 감상평 순서로 구성함.
    record.append(movieTitle, rating, review);
    // 완성한 감상 기록 한 개를 날짜별 기록 section의 마지막에 추가함.
    dayPanel.append(record);
  }

  // CSS가 달력과 기록 영역의 위치를 정할 수 있도록 같은 컨테이너 안에 순서대로 넣음.
  const layout = el('div', { className: 'calendar-layout' });
  // layout의 첫 자식은 달력 section, 둘째 자식은 선택 날짜의 기록 section임.
  layout.append(calendarPanel, dayPanel);
  // replaceChildren은 app 자체는 유지하고 기존 본문 자식만 새 요소들로 교체함.
  // 로딩 표시 또는 이전 달력이 사라지고 새 화면이 나타남. DB의 기록은 삭제하지 않음.
  app.replaceChildren(heading, layout);
}

// 준비 함수에 화면을 그릴 함수의 이름을 전달함. renderCalendar()로 즉시 호출하지 않음.
// boot가 데이터 준비를 마치면 renderCalendar(context)를 호출하여 처음 화면을 만듦.
// page는 현재 메뉴 표시용, title은 브라우저 탭 제목임.
boot({
  // 공통 메뉴에서 캘린더 항목을 '현재'로 표시할 때 사용할 구분값임.
  page: 'calendar',
  // 브라우저 탭에 표시할 제목임. 화면 h1은 renderCalendar에서 별도로 만듦.
  title: '감상 캘린더',
  // 자료 준비 후 실행할 함수 자체를 넘김. boot가 context를 전달해 호출함.
  render: renderCalendar
});
