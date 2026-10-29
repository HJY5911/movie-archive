/*
 * map.js — 영화의 제작 국가를 세계 지도 위의 핀과 국가 순위로 보여주는 페이지
 *
 * 이 파일에서 하는 일:
 * 1. 표시 기준(감상한 영화/등록된 전체 영화)과 선택한 국가를 기억함.
 * 2. 국가별 영화 ID 목록을 만들고, 영화 수가 많은 순서로 국가 순위를 정함.
 * 3. 각 국가의 위도·경도를 지도 이미지 위의 % 위치로 바꿔 핀 버튼을 놓음.
 * 4. 핀이나 순위 버튼을 누르면 그 국가의 영화 목록(포스터·개봉 연도·감상 횟수)을 보여줌.
 *
 * 이 페이지는 기록을 읽는 화면임. 모드를 바꾸거나 국가를 선택해도 저장소의 기록은 바뀌지 않음.
 * 기록 추가·수정·삭제는 movie.js가 담당하는 영화 상세 페이지(movie.html)에서 수행함.
 * 국가별로 감상한 영화를 묶는 계산은 selectors.js의 buildProjections()가 담당함.
 * 국가 이름과 핀 좌표(pin_lat, pin_lng)는 catalog.json의 Country 자료에 있으며 이 파일은 읽기만 함.
 *
 * HTML은 페이지의 빈 틀, map.css는 지도·핀·목록의 배치와 모양, 이 JS는 위치 계산과 클릭 동작을 담당함.
 * 화면을 그리는 공통 준비 작업은 ui.js의 boot()가 담당함.
 */

// import는 다른 파일에서 export한 함수를 가져오는 문법임.
// '../'는 현재 js/pages 폴더에서 한 단계 위인 js 폴더를 뜻함.
// boot(): 메뉴·영화 자료·저장소를 준비한 뒤 아래 renderMap 함수를 호출함.
// el(): HTML 요소를 만드는 프로젝트 도우미임. 내부에서 document.createElement 등을 사용함.
import { boot, el } from '../ui.js';
// buildProjections(catalog, 기록 배열)는 감상 기록으로 여러 통계를 한 번에 계산해 객체로 반환함.
// 이 페이지는 그중 국가 코드별 감상 영화 ID 목록인 country_movies만 사용함.
import { buildProjections } from '../selectors.js';

import { arrangeMapPins } from '../map-layout.js';

// mode는 지도에 표시할 영화의 기준임. 'watched'는 감상한 영화, 'all'은 등록된 전체 영화임.
// let은 나중에 값을 다시 대입할 수 있는 변수임. 처음 열면 감상한 영화 기준으로 보여줌.
let mode = 'watched';
// selectedCode는 선택한 국가의 코드임. 예: 'KR'. null은 아직 고른 국가가 없다는 뜻임.
// 두 변수는 renderMap 밖(모듈 범위)에 있으므로 refresh()로 화면을 다시 그려도 값이 유지됨.
// 브라우저에서 페이지 자체를 새로고침하면 모듈이 다시 실행되므로 처음 값으로 돌아감.
let selectedCode = null;

/*
 * toMapPosition(lat, lng): 위도·경도를 지도 이미지 안의 위치(%)로 바꿈.
 * lat: 위도(북쪽 90 ~ 남쪽 -90), lng: 경도(서쪽 -180 ~ 동쪽 180)임.
 * 반환값: { left: 왼쪽 끝에서의 %, top: 위쪽 끝에서의 % } 객체임.
 * 예: toMapPosition(0, 0) → { left: 50, top: 50 }
 * 예: toMapPosition(36.3, 127.8) → { left: 약 85.5, top: 약 29.8 }
 * assets/world-map.jpg는 2000×1000 크기의 정방형 도법(Natural Earth) 세계 지도임.
 * 정방형 도법은 경도가 가로, 위도가 세로에 직선으로 비례하므로 간단한 비례식만으로 위치를 구할 수 있음.
 */
function toMapPosition(lat, lng) {
  // 경도 -180~180에 180을 더하면 0~360이 됨. 360으로 나누고 100을 곱해 0~100%로 바꿈.
  // 예: 경도 -180(지도 왼쪽 끝) → 0%, 경도 180(오른쪽 끝) → 100%.
  const left = (lng + 180) / 360 * 100;
  // 위도는 위쪽이 +90(북극)이지만 CSS의 top은 아래로 갈수록 커지므로 90에서 위도를 뺌.
  // 예: 위도 90(북극) → 0%, 위도 0(적도) → 50%, 위도 -90(남극) → 100%.
  const top = (90 - lat) / 180 * 100;
  // 두 값을 객체로 묶어 반환함. 호출한 쪽에서 position.left, position.top으로 읽음.
  return { left: left, top: top };
}

/*
 * moviesByCountry(catalog, logs): 현재 mode에 맞는 국가 코드별 영화 ID 목록을 만듦.
 * catalog: 영화 기본 자료, logs: 현재 프로필의 감상 기록 배열임.
 * 반환값: { 국가 코드: [영화 ID, ...] } 형태의 객체임. 영화가 없는 국가는 항목 자체가 없음.
 * 예: { KR: ['m001', 'm004'], US: ['m001'] }
 * 한 영화가 여러 나라의 공동 제작이면 각 나라의 목록에 모두 들어감.
 * 반환된 배열은 이 파일에서 읽기만 하며 push·sort 등으로 수정하지 않음.
 */
function moviesByCountry(catalog, logs) {
  // 감상한 영화 모드이면 selectors.js가 계산한 국가별 묶음을 그대로 사용함.
  if (mode === 'watched') {
    // buildProjections는 기록 배열을 바꾸지 않고 통계 객체를 새로 계산해 반환함.
    const projections = buildProjections(catalog, logs);
    // country_movies에는 감상한 영화가 국가별로 한 번씩만 들어 있음. 같은 영화를 여러 번 봐도 ID는 하나임.
    return projections.country_movies;
  }

  // 여기부터는 mode가 'all'일 때만 실행됨. 'watched'이면 위의 return에서 함수가 이미 끝났기 때문임.
  // result는 국가 코드를 속성 이름으로, 영화 ID 배열을 값으로 갖게 될 빈 객체임.
  const result = {};
  // catalog.MovieCountry는 { movie_id, country_code } 한 쌍씩 어느 영화가 어느 나라 제작인지 담은 배열임.
  // 감상 기록과 상관없이 등록된 모든 영화의 연결 자료를 for...of로 한 줄씩 꺼냄.
  for (const row of catalog.MovieCountry) {
    // 대괄호 [row.country_code]는 변수에 담긴 국가 코드를 속성 이름으로 사용한다는 뜻임.
    // 처음 나온 국가 코드라면 아직 항목이 없으므로 값이 undefined임.
    if (result[row.country_code] === undefined) {
      // 그 국가의 빈 배열을 먼저 만들어 두어야 아래 push가 오류 없이 동작함.
      result[row.country_code] = [];
    }
    // push는 배열의 맨 뒤에 값을 추가함. 같은 영화·국가 쌍의 중복은 catalog를 불러올 때 repository.js가 막음.
    result[row.country_code].push(row.movie_id);
  }
  // 완성한 국가별 묶음을 반환함. 이 함수가 새로 만든 객체이므로 원본 catalog는 바뀌지 않음.
  return result;
}

/*
 * countLogsByMovie(logs): 영화 ID별 감상 횟수를 셈.
 * logs: 감상 기록 배열임. 같은 영화를 다시 본 기록도 한 건씩 셈.
 * 반환값: { 영화 ID: 횟수 } 형태의 객체임. 기록이 없는 영화는 항목 자체가 없음.
 * 예: m001을 두 번, m003을 한 번 봤으면 → { m001: 2, m003: 1 }
 * 오른쪽 영화 목록의 '감상 2회' 같은 문구를 만들 때 사용함.
 */
function countLogsByMovie(logs) {
  // 영화 ID를 속성 이름으로, 감상 횟수를 값으로 담을 빈 객체임.
  const counts = {};
  // 기록을 한 건씩 꺼냄. log에는 movie_id, watched_on, rating 등이 들어 있음.
  for (const log of logs) {
    // 이 영화가 처음 나왔다면 항목이 없으므로 값이 undefined임.
    if (counts[log.movie_id] === undefined) {
      // undefined에 1을 더하면 NaN(숫자 아님)이 되므로 먼저 숫자 0을 넣음.
      counts[log.movie_id] = 0;
    }
    // += 1은 기존 값에 1을 더해 다시 저장하는 줄임 표현임.
    counts[log.movie_id] += 1;
  }
  // 완성한 횟수 객체를 반환함. 원래 기록 배열은 바뀌지 않음.
  return counts;
}

/*
 * compareRanking(a, b): 국가 순위를 정렬할 때 sort()에 넘기는 비교 함수임.
 * a, b: { country, movie_ids } 형태의 순위 항목 두 개임.
 * 반환값이 음수이면 a가 앞, 양수이면 b가 앞에 놓이고, 0이면 두 항목의 순서를 그대로 둠.
 * 1순위 기준은 영화 수가 많은 국가, 영화 수가 같으면 국가 이름의 가나다순임.
 * 예: 미국 5편, 대한민국 5편, 독일 3편 → 대한민국, 미국, 독일
 */
function compareRanking(a, b) {
  // b - a 순서로 빼면 큰 값이 앞에 오는 내림차순이 됨. a - b였다면 오름차순임.
  const countOrder = b.movie_ids.length - a.movie_ids.length;
  // 영화 수가 다르면 그 차이만으로 순서가 정해짐.
  if (countOrder !== 0) {
    // 0이 아닌 숫자를 돌려주면 sort가 그 부호대로 두 항목의 순서를 정함.
    return countOrder;
  }
  // localeCompare는 두 문자열을 사전 순서로 비교해 음수·0·양수를 반환함. 한글 이름은 가나다순이 됨.
  // 영화 수가 같은 국가들도 갱신할 때마다 같은 순서로 나오도록 이름을 두 번째 기준으로 사용함.
  return a.country.name.localeCompare(b.country.name);
}

/*
 * renderMap(context): 현재 mode·selectedCode와 기록에 맞게 지도 페이지 본문을 만듦.
 * context는 ui.js의 boot()가 전달하는 객체임. 필요한 항목을 아래에서 하나씩 꺼냄.
 * 별도의 반환값은 없으며 마지막에 app.replaceChildren()으로 화면을 바꿈.
 * 최초 실행 때와 refresh()를 호출했을 때 이 함수가 다시 실행되어 페이지 본문 전체를 새로 만듦.
 */
function renderMap(context) {
  // app: HTML의 <main id="app"> 요소. 완성한 본문을 넣을 자리임.
  const app = context.app;
  // catalog: 영화·국가 기본 자료와 ID별 조회용 Map. 국가 좌표와 영화 제목·포스터를 여기서 읽음.
  const catalog = context.catalog;
  // snapshot: 저장소에서 방금 읽은 현재 프로필의 자료. snapshot.logs가 감상 기록 배열임.
  const snapshot = context.snapshot;
  // refresh: 최신 기록을 다시 읽고 renderMap을 재실행하는 함수임.
  // 함수 뒤에 ()를 붙이지 않았으므로 여기서는 실행하지 않고 함수 자체를 변수로 받아 둠.
  const refresh = context.refresh;

  // 현재 mode에 맞는 국가별 영화 ID 묶음을 한 번만 계산해 핀·순위·영화 목록에서 함께 사용함.
  const byCountry = moviesByCountry(catalog, snapshot.logs);
  // 영화별 감상 횟수임. 'all' 모드에서도 횟수는 실제 감상 기록을 기준으로 셈.
  const watchCounts = countLogsByMovie(snapshot.logs);

  // ranking은 영화가 한 편 이상 있는 국가만 담을 배열임. 각 항목은 { country, movie_ids } 객체임.
  const ranking = [];
  // catalog.Country는 국가 코드·이름·핀 좌표(pin_lat, pin_lng)를 가진 국가 목록임.
  for (const country of catalog.Country) {
    // 이 국가 코드에 해당하는 영화 ID 배열을 꺼냄. 영화가 없는 국가는 undefined임.
    const movieIds = byCountry[country.country_code];
    // 영화가 없는 국가는 핀도 순위도 만들지 않음. ||는 둘 중 하나라도 참이면 참임.
    if (movieIds === undefined || movieIds.length === 0) {
      // continue는 아래 줄을 건너뛰고 다음 국가로 반복을 이어감.
      continue;
    }
    // 국가 객체와 영화 ID 배열을 한 항목으로 묶어 추가함. 배열은 복사하지 않고 같은 배열을 가리킴.
    ranking.push({ country: country, movie_ids: movieIds });
  }
  // sort(비교 함수)는 배열 자체의 순서를 바꿈. ranking은 이 함수가 새로 만든 배열이라 원본 자료에 영향이 없음.
  // compareRanking 뒤에 ()를 붙이지 않고 함수 자체를 넘기면 sort가 두 항목씩 넣어 호출함.
  ranking.sort(compareRanking);

  // 핀 크기와 순위 막대 길이의 기준이 될 가장 큰 영화 수임.
  // 국가가 없으면 핀 크기·순위 막대를 계산하는 아래 반복문이 실행되지 않아 이 값은 나눗셈에 쓰이지 않음.
  // 그래도 0으로 나누는 계산이 생기지 않도록 안전한 기본값 1로 시작함.
  let maxCount = 1;
  // 정렬 후 첫 번째 항목이 영화 수가 가장 많은 국가임.
  if (ranking.length > 0) {
    // 1위 국가의 영화 수를 최댓값으로 사용함. 다른 국가는 이 값에 대한 비율로 크기가 정해짐.
    maxCount = ranking[0].movie_ids.length;
  }

  // Set은 같은 값을 한 번만 저장하는 모음임. 지도에 표시된 영화 수를 중복 없이 세기 위해 사용함.
  // 공동 제작 영화는 여러 국가 목록에 들어 있으므로 국가별 영화 수를 단순히 더하면 중복이 생김.
  const shownMovies = new Set();
  // 순위에 들어간 국가를 하나씩 꺼냄.
  for (const entry of ranking) {
    // 그 국가의 영화 ID를 다시 하나씩 꺼내는 이중 반복문임.
    for (const movieId of entry.movie_ids) {
      // 이미 들어 있는 ID라면 add를 해도 개수가 늘지 않음.
      shownMovies.add(movieId);
    }
  }

  // 오른쪽 영화 목록에 보여줄 국가 항목임. null은 아직 정하지 않았다는 뜻임.
  let selectedEntry = null;
  // 이전에 선택한 국가(selectedCode)가 현재 순위에도 있는지 찾음.
  for (const entry of ranking) {
    // 국가 코드가 같은 항목을 찾으면 그 항목을 선택 대상으로 기억함.
    if (entry.country.country_code === selectedCode) {
      // 국가 코드는 국가마다 하나뿐이므로 일치하는 항목은 최대 한 개임.
      selectedEntry = entry;
    }
  }
  // 처음 열었거나 모드를 바꿔 selectedCode가 null이면, 또는 그 국가가 순위에서 사라졌으면 1위 국가를 기본으로 선택함.
  // &&는 두 조건이 모두 참일 때만 참임. 순위가 비어 있으면 기본 선택도 하지 않음.
  if (selectedEntry === null && ranking.length > 0) {
    // ranking[0]은 정렬 후 첫 항목, 즉 영화가 가장 많은 국가임.
    selectedEntry = ranking[0];
  }
  // 최종 선택 결과를 모듈 범위의 selectedCode에도 맞춰 둠. 핀·순위 버튼의 선택 표시가 이 값을 비교함.
  if (selectedEntry === null) {
    // 표시할 국가가 하나도 없으면 선택 상태도 비움.
    selectedCode = null;
  } else {
    // 이전 선택에서 찾은 국가 또는 기본으로 고른 1위 국가의 코드를 저장하여 화면의 선택 표시와 일치시킴.
    selectedCode = selectedEntry.country.country_code;
  }

  // el(태그 이름, 속성 객체, 글자 또는 자식 요소)로 요소를 만들 수 있음.
  // heading은 제목과 소개 문장을 함께 담을 바깥 div임. className은 CSS 연결 이름임.
  const heading = el('div', { className: 'page-heading' });
  // h1 한 개를 만들고 그 안에 '영화 지도'라는 글자를 넣음. 아직 heading에는 붙이지 않음.
  // el의 두 번째 인수 {}는 따로 지정할 속성이 없다는 뜻임.
  const pageTitle = el('h1', {}, '영화 지도');
  // p는 페이지 내용을 설명하는 문단이며 muted는 이 문단을 구분하기 위한 클래스임.
  const description = el('p', { className: 'muted' }, '영화의 제작 국가를 지도 위의 핀으로 보여줍니다. 핀이 클수록 해당 국가의 영화가 많습니다.');
  // append(요소1, 요소2)는 부모의 맨 뒤에 자식을 적은 순서대로 추가함.
  // 결과: heading(div) 안에 pageTitle(h1), description(p)이 그 순서로 들어감.
  heading.append(pageTitle, description);

  /*
   * refreshMap(focusId): 클릭 결과를 그린 뒤 같은 역할의 버튼으로 초점을 옮김.
   * focusId는 새 화면에서 초점을 받을 요소의 id 문자열임.
   * 예: 'map-pin-KR', 'map-rank-KR', 'map-mode-all'
   * refresh()는 본문 요소를 새로 만들기 때문에, 이전 버튼 객체에 focus()하면 안 됨.
   * 그래서 id로 새 버튼을 다시 찾음. calendar.js의 refreshCalendar와 같은 방식임.
   * 이 처리는 키보드로 버튼을 누른 뒤에도 계속 같은 위치에서 조작할 수 있도록 함.
   */
  async function refreshMap(focusId) {
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
      // focus()는 이 요소로 키보드 초점을 옮김. 버튼을 다시 클릭하는 명령은 아님.
      target.focus();
    }
  }

  /*
   * selectCountry(code, focusId): 선택한 국가를 바꾸고 화면을 다시 그림.
   * code: 국가 코드(예: 'KR'), focusId: 갱신 뒤 초점을 받을 버튼의 id임.
   * 지도의 핀과 국가 순위 버튼이 함께 사용함. 저장된 감상 기록은 바꾸지 않음.
   */
  function selectCountry(code, focusId) {
    // 모듈 범위의 선택 상태만 바꿈. 이 값은 다음 renderMap 실행에서 읽힘.
    selectedCode = code;
    // 내부에서 오류를 처리하는 refreshMap의 Promise를 그대로 반환함.
    return refreshMap(focusId);
  }

  /*
   * changeMode(nextMode): 지도에 표시할 영화의 기준을 바꿈.
   * nextMode: 'watched'(감상한 영화) 또는 'all'(등록된 전체 영화)임.
   * 모드가 바뀌면 국가 목록이 달라지므로 선택한 국가를 비우고 새 순위의 1위 국가부터 보여줌.
   */
  function changeMode(nextMode) {
    // 모듈 범위의 mode를 바꿈. 다음 renderMap에서 moviesByCountry가 이 값을 읽음.
    mode = nextMode;
    // null로 비우면 renderMap이 새 순위의 1위 국가를 기본으로 선택함.
    selectedCode = null;
    // 문자열을 +로 이어 'map-mode-watched' 또는 'map-mode-all'을 만들고, 그 모드 버튼으로 초점을 돌려놓음.
    return refreshMap('map-mode-' + nextMode);
  }

  // 각 버튼에 등록할 동작을 이름 있는 함수로 적음. 정의만 할 때는 실행되지 않음.
  function showWatched() {
    // 감상한 영화 기준으로 바꾸고, 갱신 뒤 '감상한 영화' 버튼에 초점을 돌려놓음.
    return changeMode('watched');
  }

  // '등록된 전체 영화' 버튼과 빈 기록 안내의 버튼이 함께 사용하는 함수임.
  function showAll() {
    // 등록된 전체 영화 기준으로 바꾸고, 갱신 뒤 '등록된 전체 영화' 버튼에 초점을 돌려놓음.
    return changeMode('all');
  }

  // type='button'은 폼 제출용이 아닌 일반 버튼임.
  // id는 갱신 후 초점 복원에, className은 CSS가 이 요소를 선택할 때 사용함.
  const watchedButton = el('button', {
    // changeMode('watched')가 'map-mode-' + 'watched'로 만드는 id와 같아야 초점이 돌아옴.
    id: 'map-mode-watched',
    // 이 버튼은 폼을 제출하지 않고 아래에 등록한 모드 전환만 실행함.
    type: 'button',
    // button과 secondary라는 클래스 두 개를 붙임. 클릭 동작은 클래스가 아니라 이벤트가 정함.
    className: 'button secondary'
  }, '감상한 영화');
  // 전체 영화 기준으로 바꿀 button 요소를 별도로 만듦. watchedButton과는 다른 DOM 객체임.
  const allButton = el('button', {
    // changeMode('all')이 갱신 뒤 초점을 돌려놓을 때 찾는 id임.
    id: 'map-mode-all',
    // 폼을 제출하지 않는 일반 버튼임.
    type: 'button',
    // '감상한 영화' 버튼과 같은 CSS 클래스들을 적용함.
    className: 'button secondary'
  }, '등록된 전체 영화');
  // aria-pressed는 토글 버튼이 눌린(선택된) 상태인지 보조 기술에 알려주는 속성임.
  // String(mode === 'watched')는 비교 결과 true/false를 문자열 'true'/'false'로 바꿈.
  // map.css는 [aria-pressed="true"]인 모드 버튼의 테두리를 두껍게, 글자를 굵게 표시함.
  watchedButton.setAttribute('aria-pressed', String(mode === 'watched'));
  // 두 버튼 중 현재 모드에 해당하는 버튼 하나만 'true'가 됨.
  allButton.setAttribute('aria-pressed', String(mode === 'all'));
  // addEventListener는 이벤트 발생 시 실행할 함수를 등록함. 지금 모드를 바꾸는 것은 아님.
  // 함수 이름 뒤에 ()를 붙이지 않아야, 함수를 즉시 실행하지 않고 등록할 수 있음.
  watchedButton.addEventListener('click', showWatched);
  // 전체 영화 버튼에는 showAll을 연결함. 클릭할 때마다 showAll이 호출됨.
  allButton.addEventListener('click', showAll);

  // 두 모드 버튼을 묶는 div임. role='group'은 관련 버튼들의 묶음이라는 뜻임.
  // ariaLabel로 이 묶음이 '지도에 표시할 영화'를 고르는 버튼들임을 보조 기술에 알려줌.
  const modeSwitch = el('div', { className: 'map-mode-switch', role: 'group', ariaLabel: '지도에 표시할 영화' });
  // 결과: modeSwitch(div) → [watchedButton(button), allButton(button)].
  modeSwitch.append(watchedButton, allButton);

  // 백틱(`...`)은 템플릿 문자열임. ${표현식} 자리에 계산한 결과가 들어감. 예: '5개 국가 · 영화 12편'.
  // shownMovies.size는 Set에 든 서로 다른 영화 ID의 개수임. 배열의 length에 해당함.
  // ariaLive: 'polite'는 이 문단의 내용이 바뀌면 보조 기술이 진행 중인 안내를 마친 뒤 알리도록 하는 설정임.
  const summary = el('p', { className: 'map-summary', ariaLive: 'polite' }, `${ranking.length}개 국가 · 영화 ${shownMovies.size}편`);

  // toolbar는 모드 버튼 묶음과 요약 문구를 한 줄로 묶을 div임. 실제 배치는 map.css가 담당함.
  const toolbar = el('div', { className: 'map-toolbar' });
  // 결과: toolbar(div) → [modeSwitch(div), summary(p)].
  toolbar.append(modeSwitch, summary);

  // canvas는 지도 이미지·연결선·핀을 담는 div임. 최종 핀 위치(px)의 기준 상자가 됨.
  const canvas = el('div', { className: 'map-canvas' });
  // 정방형 도법 세계 지도 이미지임. src 경로는 이 JS 파일이 아니라 map.html의 위치를 기준으로 해석됨.
  // alt는 이미지를 볼 수 없을 때 대신 전달되는 설명임.
  const mapImage = el('img', { src: 'assets/world-map.jpg', alt: '제작 국가 핀을 표시하는 세계 지도' });
  // 이미지를 canvas의 첫 자식으로 넣음. 핀들은 아래 반복문에서 이미지 뒤에 붙음.
  // 핀이 이미지 위에 겹쳐 보이는 것은 map.css가 핀에 position: absolute를 지정했기 때문이며 DOM 순서 때문이 아님.
  canvas.append(mapImage);

  const svgNamespace = 'http://www.w3.org/2000/svg';
  const connections = document.createElementNS(svgNamespace, 'svg');
  connections.setAttribute('class', 'map-connections');
  connections.setAttribute('aria-hidden', 'true');
  canvas.append(connections);
  const pins = [];

  // 순위에 들어간 국가마다 핀 버튼 하나를 만듦.
  for (const entry of ranking) {
    // 이번 항목의 국가 객체임. 예: { country_code: 'KR', name: '대한민국', pin_lat: 36.3, pin_lng: 127.8 }.
    const country = entry.country;
    // 이 국가의 영화 수임. 핀 안의 숫자와 핀 크기에 사용함.
    const count = entry.movie_ids.length;
    // catalog의 핀 좌표를 지도 위의 % 위치로 바꿈.
    const position = toMapPosition(country.pin_lat, country.pin_lng);
    // 핀 크기(px)는 26에 0~18을 더한 값이라 26~44px 사이가 됨. 1위 국가의 핀이 44px로 가장 큼.
    // Math.round는 가장 가까운 정수로 반올림함. 예: 최대 10편 중 5편이면 26 + 9 = 35.
    const size = 26 + Math.round(18 * count / maxCount);
    // 국가마다 다른 id임. 예: 'map-pin-KR'. 갱신 뒤 같은 핀으로 초점을 돌려놓을 때 사용함.
    const pinId = 'map-pin-' + country.country_code;

    // 핀 하나는 클릭할 수 있는 button 요소임. 그래서 키보드 Tab과 Enter로도 선택할 수 있음.
    const pin = el('button', {
      // 위에서 만든 국가별 id임.
      id: pinId,
      // 폼을 제출하지 않는 일반 버튼임.
      type: 'button',
      // map.css의 '.map-canvas .map-pin' 규칙이 공통 버튼의 테두리·여백·최소 크기를 지워 --size 크기의 투명한 상자로 만듦.
      // 눈에 보이는 핀 모양은 안쪽의 map-pin-head가 그림.
      className: 'map-pin',

      ariaLabel: `${country.name}, 영화 ${count}편`,
      title: `${country.name} · ${count}편`
    });
    // style.left는 요소에 직접 넣는 인라인 스타일임. 숫자 뒤에 '%'를 붙여 '85.5%' 같은 CSS 값을 만듦.
    // map.css의 position: absolute와 함께 canvas 왼쪽 끝에서의 거리를 정함.
    pin.style.left = position.left + '%';
    // 초기 좌표를 지정함. 화면에 붙인 뒤 positionPins()가 겹침 없는 픽셀 좌표로 다시 배치함.
    // left/top은 상자의 왼쪽 위 모서리를 이 좌표에 놓음. 뾰족한 끝을 좌표에 맞추는 일은 map.css가 담당함.
    // map.css의 translate(-50%, -120.7%)가 상자를 너비의 절반만큼 왼쪽, 높이의 120.7%만큼 위로 옮김.
    pin.style.top = position.top + '%';
    // setProperty('--size', 값)는 CSS 사용자 정의 속성(변수)을 이 요소에만 지정함.
    // --로 시작하는 사용자 정의 속성은 style.backgroundColor 같은 전용 속성 이름이 없음.
    // style.size나 style['--size']로 대입해도 CSS에 반영되지 않으므로 setProperty를 사용함.
    // map.css가 width: var(--size), height: var(--size)로 이 값을 읽어 핀마다 다른 크기를 적용함.
    pin.style.setProperty('--size', size + 'px');

    // pinHead는 물방울 모양 핀 머리임. map.css가 정사각형을 -45도 돌려 뾰족한 모서리가 아래를 향하게 함.
    const pinHead = el('span', { className: 'map-pin-head' });
    // 핀 머리 안에 표시할 영화 수 숫자임. String(count)로 숫자를 글자로 바꿔 넣음.
    // 부모가 -45도 돌아가 있으므로 map.css가 이 span을 +45도 되돌려 숫자가 똑바로 보이게 함.
    const pinCount = el('span', { className: 'map-pin-count' }, String(count));
    // 결과: pinHead(span) → pinCount(span).
    pinHead.append(pinCount);

    pin.append(pinHead);
    pins.push({ code: country.country_code, left: position.left, top: position.top, size, button: pin });

    // 이번 국가가 선택된 국가인지 확인해 선택 상태를 표시함.
    if (country.country_code === selectedCode) {
      // classList.add는 기존 클래스를 지우지 않고 클래스 이름 하나를 추가함.
      // selected는 선택한 핀을 구분하는 클래스임. 현재 map.css의 강조는 aria-pressed="true"를 기준으로 함.
      pin.classList.add('selected');
      // 선택 상태를 CSS와 보조 기술에 모두 전달함. map.css는 이 핀 머리의 테두리를 두껍게, 크기를 조금 크게 함. 국가 이름은 지도 아래 선택 문구와 버튼 title로 확인함.
      pin.setAttribute('aria-pressed', 'true');
    } else {
      // 선택하지 않은 나머지 핀도 상태를 명시하여 '선택 안 됨'으로 표시함.
      pin.setAttribute('aria-pressed', 'false');
    }

    // 반복마다 새로 만들어지는 클릭 함수임. 이번 반복의 country와 pinId를 기억함(클로저).
    // const 변수는 반복마다 따로 생기므로 각 핀이 마지막 국가가 아닌 자기 국가를 선택함.
    function selectPin() {
      // 이 핀의 국가를 선택하고, 갱신 뒤 같은 국가의 핀으로 초점을 돌려놓음.
      return selectCountry(country.country_code, pinId);
    }
    // 현재 핀에 위 함수를 등록함. selectPin()처럼 지금 실행하는 것이 아님.
    pin.addEventListener('click', selectPin);
    // 완성한 핀을 canvas에 붙임. position: absolute인 핀은 순서와 상관없이 위치 지정이 없는 지도 이미지보다 위에 그려짐.
    // 핀끼리 겹치면 나중에 붙인 핀(순위가 낮은 국가)이 위에 옴.
    // 마우스를 올린 핀·키보드 초점을 받은 핀·선택된 핀은 map.css의 z-index: 1로 맨 위에 옴.
    canvas.append(pin);
  }

  // 실제 좌표는 유지하고, 회전·확대된 핀이 겹치지 않는 가까운 빈 자리로 표시 위치를 옮김.
  // 지도 영역이 너무 좁으면 지도 자체를 넓히고 해당 영역만 가로 스크롤하도록 함.
  function positionPins() {
    let width = Math.max(560, viewport.getBoundingClientRect().width);
    let positions = arrangeMapPins(pins, width, width / 2);
    while (positions === null) {
      width += 80;
      positions = arrangeMapPins(pins, width, width / 2);
    }
    canvas.style.width = width + 'px';
    connections.setAttribute('viewBox', `0 0 ${width} ${width / 2}`);
    connections.replaceChildren();
    for (const position of positions) {
      const pin = pins.find(item => item.code === position.code);
      const tipY = position.y + position.size * 0.707;
      pin.button.style.left = position.x + 'px';
      pin.button.style.top = tipY + 'px';
      if (Math.hypot(position.x - position.anchorX, tipY - position.anchorY) < 1) continue;
      const line = document.createElementNS(svgNamespace, 'line');
      line.setAttribute('x1', position.anchorX);
      line.setAttribute('y1', position.anchorY);
      line.setAttribute('x2', position.x);
      line.setAttribute('y2', tipY);
      const dot = document.createElementNS(svgNamespace, 'circle');
      dot.setAttribute('cx', position.anchorX);
      dot.setAttribute('cy', position.anchorY);
      dot.setAttribute('r', '2.5');
      if (position.code === selectedCode) {
        line.classList.add('selected');
        dot.classList.add('selected');
      }
      connections.append(line, dot);
    }
  }
  // 화면 폭이 바뀔 때 다시 배치하며, boot의 화면 정리 함수에서 관찰을 해제함.
  function observeMap() {
    positionPins();
    const observer = new ResizeObserver(positionPins);
    observer.observe(viewport);
    return () => observer.disconnect();
  }
  const viewport = el('div', { className: 'map-viewport', tabIndex: 0, role: 'region', ariaLabel: '세계 지도. 좁은 화면에서는 좌우로 스크롤할 수 있습니다.' });
  viewport.append(canvas);

  // 지도 영역 전체를 담을 section임.
  const mapPanel = el('section', { className: 'map-panel' });
  // 지도 영역의 소제목 h2임.
  const mapTitle = el('h2', {}, '세계 지도');

  const mapHelp = el('p', { className: 'map-help' }, '가까운 핀은 펼쳐서 표시합니다. 연결선 끝의 점이 실제 국가 위치입니다. 지도가 잘리면 좌우로 스크롤하세요.');
  mapPanel.append(mapTitle, toolbar, viewport, mapHelp);
  if (selectedEntry !== null) {
    mapPanel.append(el('p', { className: 'map-selection', ariaLive: 'polite' }, `선택한 국가: ${selectedEntry.country.name} · ${selectedEntry.movie_ids.length}편`));
  }

  // 감상한 영화 모드에서 핀이 하나도 없으면(주로 감상 기록이 아직 없을 때) 다음 행동을 안내함.
  if (ranking.length === 0 && mode === 'watched') {
    // 공통 CSS에서 점선 테두리와 간격을 지정한 empty-state를 적용함.
    const empty = el('div', { className: 'empty-state' });
    // 핀이 없는 이유를 설명하는 문단임.
    const emptyMessage = el('p', {}, '아직 감상 기록이 없어 지도에 표시할 핀이 없습니다.');
    // 메인 페이지로 가는 링크임. button 클래스로 버튼처럼 보이지만 실제로는 a 요소임.
    const homeLink = el('a', { href: 'index.html', className: 'button' }, '메인 페이지로 이동');
    // 기록이 없어도 지도를 사용해 볼 수 있도록 전체 영화 모드로 바꾸는 버튼임.
    const allMoviesButton = el('button', { type: 'button', className: 'button secondary' }, '등록된 전체 영화로 보기');
    // 위의 '등록된 전체 영화' 버튼과 같은 showAll을 연결함. 갱신 뒤 초점은 'map-mode-all' 버튼으로 감.
    allMoviesButton.addEventListener('click', showAll);
    // 결과: empty(div) → [emptyMessage(p), homeLink(a), allMoviesButton(button)].
    empty.append(emptyMessage, homeLink, allMoviesButton);
    // 안내 상자를 지도 아래에 붙임.
    mapPanel.append(empty);
  } else if (ranking.length === 0) {
    // 전체 영화 모드인데도 국가가 없다면 catalog에 제작 국가 연결 자료가 없는 경우임. 짧은 안내만 보여줌.
    const emptyMessage = el('p', { className: 'empty-state compact' }, '제작 국가가 등록된 영화가 없습니다.');
    // 안내 문장을 지도 아래에 붙임.
    mapPanel.append(emptyMessage);
  }

  // layout은 지도 영역과 오른쪽 영역을 나란히 놓을 div임. 2열 배치는 map.css의 .map-layout이 정함.
  const layout = el('div', { className: 'map-layout' });
  // 지도 영역을 첫 자식으로 붙임. 오른쪽 영역은 선택된 국가가 있을 때만 아래에서 붙임.
  layout.append(mapPanel);

  // 선택된 국가가 없다는 것은 ranking이 비어 있다는 뜻임. 이때는 지도 영역만 보여주고 끝냄.
  if (selectedEntry === null) {
    // single 클래스를 붙이면 map.css가 2열 대신 1열 배치를 적용함.
    layout.classList.add('single');
    // 제목과 지도 영역만으로 본문을 교체함.
    app.replaceChildren(heading, layout);

    return observeMap();
  }

  // 선택한 국가의 영화 목록을 담을 section임.
  const countryPanel = el('section', { className: 'map-country-panel' });
  // 선택한 국가 이름을 h2 제목으로 사용함. 예: '대한민국'.
  const countryTitle = el('h2', {}, selectedEntry.country.name);
  // 기본 문구는 전체 영화 모드용임. let으로 선언해 아래 조건에서 바꿀 수 있게 함.
  let countText = '등록된 영화 ' + selectedEntry.movie_ids.length + '편';
  // 감상한 영화 모드이면 같은 숫자라도 의미가 다르므로 문구를 바꿈.
  if (mode === 'watched') {
    // 예: '감상한 영화 3편'.
    countText = '감상한 영화 ' + selectedEntry.movie_ids.length + '편';
  }
  // 결정한 문구를 muted 문단에 넣음.
  const countryCount = el('p', { className: 'muted' }, countText);
  // 영화 항목들을 담을 순서 없는 목록 ul임. 기본 글머리표는 map.css에서 없앰.
  const movieList = el('ul', { className: 'map-movie-list' });

  // 선택한 국가의 영화 ID를 하나씩 꺼내 목록 항목을 만듦.
  // 순서는 moviesByCountry가 돌려준 배열의 순서 그대로이며 여기서 다시 정렬하지 않음.
  for (const movieId of selectedEntry.movie_ids) {
    // catalog.lookup.movieById는 영화 ID로 영화 객체를 찾는 Map임. get(ID)로 영화 정보를 꺼냄.
    // 목록의 ID는 모두 catalog 자료에서 나온 값이므로 영화 객체를 항상 찾을 수 있음.
    const movie = catalog.lookup.movieById.get(movieId);

    // 포스터가 없을 때 사용할 기본 이미지 경로를 먼저 정해 둠.
    let posterUrl = 'assets/posters/placeholder.jpg';
    // poster_url이 null이 아니면 영화에 등록된 포스터 경로를 사용함.
    if (movie.poster_url !== null) {
      // 예: 'assets/posters/m001.jpg'.
      posterUrl = movie.poster_url;
    }
    // 개봉일이 없을 때 보여줄 기본 문구임.
    let yearText = '개봉일 미등록';
    // release_date는 '2018-01-01' 같은 문자열 또는 null임.
    if (movie.release_date !== null) {
      // slice(0, 4)는 0번째부터 4번째 글자 앞까지, 즉 연도 네 글자만 잘라냄. 예: '2018-01-01' → '2018'.
      yearText = movie.release_date.slice(0, 4);
    }
    // 감상 기록이 없는 영화의 기본 문구임. 전체 영화 모드에서는 보지 않은 영화도 목록에 나옴.
    let watchText = '감상 기록 없음';
    // 위에서 센 watchCounts에 이 영화의 항목이 있으면 한 번 이상 본 영화임.
    if (watchCounts[movieId] !== undefined) {
      // 예: '감상 2회'. 같은 영화를 다시 본 기록도 각각 셈.
      watchText = '감상 ' + watchCounts[movieId] + '회';
    }

    // 포스터 이미지임. alt는 '영화 제목 포스터' 형식의 대체 설명임.
    // loading: 'lazy'는 이미지가 화면 근처에 올 때까지 내려받기를 미루는 브라우저 기능임.
    const poster = el('img', { src: posterUrl, alt: movie.title + ' 포스터', loading: 'lazy' });
    // strong은 영화 제목을 강조하는 요소임.
    const movieTitle = el('strong', {}, movie.title);
    // small에 개봉 연도와 감상 횟수를 함께 넣음. 예: '2018 · 감상 2회'.
    const movieInfo = el('small', {}, `${yearText} · ${watchText}`);
    // 제목과 부가 정보를 세로로 쌓을 span임. 세로 배치는 map.css의 .map-movie-text가 담당함.
    const text = el('span', { className: 'map-movie-text' });
    // 결과: text(span) → [movieTitle(strong), movieInfo(small)].
    text.append(movieTitle, movieInfo);
    // 영화 상세 페이지로 가는 링크임. 이동 주소 계약은 movie.html?id=영화ID임.
    // encodeURIComponent는 영화 ID의 특수문자가 URL 구분자로 잘못 해석되지 않도록 함.
    const link = el('a', { href: `movie.html?id=${encodeURIComponent(movieId)}` });
    // 포스터와 글자 묶음을 링크 안에 넣어 항목 전체를 누를 수 있게 함.
    link.append(poster, text);
    // 목록 항목 li를 만듦. 속성 객체를 생략하면 el의 기본값 {}가 사용됨.
    const item = el('li');
    // li 안에 링크를 넣음.
    item.append(link);
    // 완성한 항목을 영화 목록의 맨 뒤에 추가함.
    movieList.append(item);
  }
  // 결과: countryPanel(section) → [countryTitle(h2), countryCount(p), movieList(ul)].
  countryPanel.append(countryTitle, countryCount, movieList);

  // 국가 순위를 담을 section임.
  const rankPanel = el('section', { className: 'map-rank-panel' });
  // 순위 영역의 소제목 h2임.
  const rankTitle = el('h2', {}, '국가 순위');
  // 순서 있는 목록 ol임. 번호 표시는 map.css에서 없애지만 순서가 있는 목록이라는 의미는 남음.
  const rankList = el('ol', { className: 'map-rank-list' });

  // 정렬된 순서대로 국가마다 순위 버튼 하나를 만듦. 핀을 만든 반복문과 같은 ranking을 사용함.
  for (const entry of ranking) {
    // 이번 순위 항목의 국가 객체임.
    const country = entry.country;
    // 이 국가의 영화 수임.
    const count = entry.movie_ids.length;
    // 순위 버튼의 국가별 id임. 예: 'map-rank-KR'. 핀의 id와 겹치지 않도록 앞부분을 다르게 함.
    const rankId = 'map-rank-' + country.country_code;

    // 클래스 없이 만든 일반 버튼임. 기본 테두리·여백은 common.css의 button 규칙이 정함.
    // 가로 배치·전체 너비·회색 테두리는 map.css의 '.map-rank-list button' 규칙이 정함.
    const rankButton = el('button', { id: rankId, type: 'button' });
    // 국가 이름을 담는 span임.
    const rankName = el('span', { className: 'map-rank-name' }, country.name);
    // 숫자 뒤에 '편'을 붙여 '3편' 같은 글자를 만듦.
    const rankCount = el('span', { className: 'map-rank-count' }, count + '편');
    // 버튼 아래쪽에 깔리는 막대임. 글자 없이 길이로 영화 수를 보여줌.
    const rankBar = el('span', { className: 'map-rank-bar' });
    // 1위 국가를 100%로 하여 막대 길이를 비율로 정함. 예: 최대 10편 중 5편이면 '50%'.
    rankBar.style.width = (count / maxCount * 100) + '%';
    // 결과: rankButton(button) → [rankName(span), rankCount(span), rankBar(span)].
    rankButton.append(rankName, rankCount, rankBar);

    // 핀과 같은 방법으로 선택한 국가의 순위 버튼에 선택 상태를 표시함.
    if (country.country_code === selectedCode) {
      // selected 클래스를 추가함. map.css의 강조는 아래 aria-pressed 값을 기준으로 함.
      rankButton.classList.add('selected');
      // map.css가 이 버튼의 테두리를 연한 회색에서 글자색으로 바꾸고 글자를 굵게 표시함.
      rankButton.setAttribute('aria-pressed', 'true');
    } else {
      // 선택하지 않은 순위 버튼도 상태를 명시하여 '선택 안 됨'으로 표시함.
      rankButton.setAttribute('aria-pressed', 'false');
    }

    // 이번 반복의 country와 rankId를 기억하는 클릭 함수임(클로저). selectPin과 같은 방식임.
    function selectRank() {
      // 이 국가를 선택하고, 갱신 뒤 같은 국가의 순위 버튼으로 초점을 돌려놓음.
      return selectCountry(country.country_code, rankId);
    }
    // 순위 버튼에 위 함수를 등록함. 지금 실행하는 것이 아님.
    rankButton.addEventListener('click', selectRank);

    // 순위 목록의 항목 li를 만듦.
    const rankItem = el('li');
    // li 안에 순위 버튼을 넣음.
    rankItem.append(rankButton);
    // 완성한 항목을 ol의 맨 뒤에 추가함. 정렬된 순서가 곧 화면 순서가 됨.
    rankList.append(rankItem);
  }
  // 결과: rankPanel(section) → [rankTitle(h2), rankList(ol)].
  rankPanel.append(rankTitle, rankList);

  // side는 국가별 영화 목록과 국가 순위를 세로로 쌓을 오른쪽 영역 div임.
  const side = el('div', { className: 'map-side' });
  // 위에서부터 선택 국가의 영화 목록 → 국가 순위 순서로 넣음.
  side.append(countryPanel, rankPanel);
  // layout의 둘째 자식으로 붙여 지도 영역 오른쪽에 놓이게 함.
  layout.append(side);

  // replaceChildren은 app 자체는 유지하고 기존 본문 자식만 새 요소들로 교체함.
  // 로딩 표시 또는 이전 지도 화면이 사라지고 새 화면이 나타남. DB의 기록은 삭제하지 않음.
  app.replaceChildren(heading, layout);

  return observeMap();
}

// 준비 함수에 화면을 그릴 함수의 이름을 전달함. renderMap()으로 즉시 호출하지 않음.
// boot가 데이터 준비를 마치면 renderMap(context)를 호출하여 처음 화면을 만듦.
// page는 현재 메뉴 표시용, title은 브라우저 탭 제목임.
boot({
  // 공통 메뉴에서 '지도' 항목을 '현재'로 표시할 때 사용할 구분값임.
  page: 'map',
  // 브라우저 탭에 표시할 제목임. 화면 h1은 renderMap에서 별도로 만듦.
  title: '영화 지도',
  // 자료 준비 후 실행할 함수 자체를 넘김. boot가 context를 전달해 호출함.
  render: renderMap
});
