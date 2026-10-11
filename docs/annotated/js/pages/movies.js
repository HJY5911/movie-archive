/*
 * movies.js — 영화 검색 페이지
 *
 * 동작 순서:
 * 1. URL의 q 값을 읽어 처음 검색어를 정함.
 * 2. boot()가 영화 자료와 현재 브라우저의 감상 기록을 준비함.
 * 3. renderMovies()가 검색창·결과 개수·영화 목록을 화면에 넣음.
 * 4. 검색 폼을 제출하면 검색어와 URL을 바꾸고 같은 페이지의 본문을 다시 그림.
 *
 * 이 파일은 검색 결과를 표시하는 역할임. 제목·별칭·배우·감독 이름 중에서
 * 어떤 영화가 일치하는지 판단하는 작업은 selectors.js의 searchMovies()가 담당함.
 * 빈 검색어는 전체 영화 목록을 뜻함. 검색은 감상 기록이나 영화 JSON을 수정하지 않음.
 * 영화 제목을 누르면 movie.html?id=영화ID로 이동하며, 기록 작성은 그 상세 페이지에서 함.
 */

// import는 다른 모듈이 export한 함수를 가져옴. ../는 js/pages의 한 단계 위인 js 폴더임.
// boot는 공통 준비, movieCard는 영화 한 편의 표시 요소 생성, showMessage는 오류 안내를 담당함.
import { boot, movieCard, showMessage } from '../ui.js';
// searchMovies(catalog, 검색어)는 일치하는 영화 객체들의 새 배열을 반환함.
import { searchMovies } from '../selectors.js';

// location.search는 현재 URL에서 ?부터 시작하는 검색 매개변수 부분임.
// 예: movies.html?q=달우1에서 q의 값을 쉽게 읽도록 URLSearchParams 객체로 감쌈.
const urlParams = new URLSearchParams(location.search);
// get('q')는 q 항목의 값을 문자열로 반환함. q가 없으면 null을 반환함.
// 검색할 때마다 값이 바뀌므로 재대입이 가능한 let을 사용함.
let query = urlParams.get('q');
// q가 빠진 movies.html로 들어왔을 때는 검색어가 없는 것으로 처리함.
if (query === null) {
  // 빈 문자열은 아래 searchMovies에서 전체 영화를 보여 달라는 의미로 사용함.
  query = '';
}
// trim()은 앞뒤 공백을 제거한 새 문자열을 반환함. 검색어 중간의 공백은 여기서 지우지 않음.
query = query.trim();

/*
 * renderMovies(context): 준비된 자료와 현재 query를 사용해 검색 화면을 만듦.
 * context는 boot가 전달한 객체임. 함수 반환값 대신 app의 자식 요소들을 교체함.
 * query를 이 함수 밖에 두었으므로 refresh()로 다시 그려도 입력한 검색어가 유지됨.
 */
function renderMovies(context) {
  // app은 HTML의 <main id="app">임. 마지막에 완성한 요소들을 이 안에 넣음.
  const app = context.app;
  // catalog에는 영화 기본 목록과 제목·별칭·배우·감독 검색에 필요한 연결 자료가 있음.
  const catalog = context.catalog;
  // snapshot.logs에는 현재 프로필의 감상 기록이 있음. '감상한 영화' 표시를 만들 때 사용함.
  const snapshot = context.snapshot;
  // refresh는 저장소의 최신 기록을 다시 읽은 뒤 이 renderMovies 함수를 재실행함.
  const refresh = context.refresh;

  // section은 페이지 제목과 소개 문장을 묶는 영역임. 아직 실제 본문에 붙이지는 않음.
  const heading = document.createElement('section');
  // className은 CSS가 이 요소를 찾을 수 있게 HTML의 class 속성을 지정함.
  heading.className = 'page-heading';
  // h1은 페이지의 대표 제목 요소임. 요소 생성만으로 글자가 자동으로 들어가지는 않음.
  const title = document.createElement('h1');
  // textContent는 문자열을 일반 글자로 넣으며 HTML 태그로 해석하지 않음.
  title.textContent = '영화 검색';
  // 제목 요소를 heading의 첫 자식으로 붙여 <section><h1>영화 검색</h1></section>을 만듦.
  heading.appendChild(title);
  // p는 검색 방법을 안내하는 문단임. 제목과 별도의 요소로 만듦.
  const description = document.createElement('p');
  // 대표 제목뿐 아니라 미리 등록한 줄임말과 영화에 연결된 인물 이름도 검색할 수 있음.
  description.textContent = '영화 제목, 별칭, 배우 또는 감독 이름으로 검색할 수 있습니다.';
  // 제목 뒤에 설명 문단을 붙임. appendChild는 기존 제목을 지우지 않음.
  heading.appendChild(description);

  // form은 설명(label), 입력창(input), 제출 버튼(button)을 묶는 검색 폼임.
  const form = document.createElement('form');
  // 메인 검색창과 같은 클래스이므로 공통 CSS의 배치·간격을 함께 적용받음.
  form.className = 'search-form';
  // 기본 제출 대상 주소임. 아래 submit 이벤트에서는 기본 제출을 막고 화면만 갱신함.
  form.action = 'movies.html';
  // label은 검색 입력칸의 이름을 화면에 보여주는 요소임.
  const label = document.createElement('label');
  // htmlFor는 HTML의 for 속성임. 같은 id의 입력칸과 연결되어 글씨를 눌러도 입력칸에 초점을 줌.
  label.htmlFor = 'movie-search';
  // 사용자가 실제로 읽게 되는 입력칸 설명임.
  label.textContent = '영화 검색';
  // input 요소를 만들고 다음 줄들에서 검색 입력칸에 필요한 속성을 하나씩 지정함.
  const input = document.createElement('input');
  // label.htmlFor와 같은 id를 지정하여 label과 input을 연결함.
  input.id = 'movie-search';
  // search는 검색어 입력용이라는 뜻이며, 실제 검색 알고리즘은 JavaScript에서 실행함.
  input.type = 'search';
  // name은 폼 데이터 항목의 이름임. 이 프로젝트는 검색어 이름으로 q를 사용함.
  input.name = 'q';
  // 현재 검색어를 입력칸에 넣음. URL로 들어온 검색어도 여기서 화면에 나타남.
  input.value = query;
  // placeholder는 입력이 비어 있을 때만 보이는 예시임. '달우1'은 현재 자료에 있는 영화 별칭임.
  input.placeholder = '예: 달우1';
  // 보조 기술에도 검색 가능한 정보의 종류를 알려줌. 실제 검색 범위를 바꾸는 속성은 아님.
  input.setAttribute('aria-label', '영화 제목, 별칭, 배우 또는 감독');
  // button 요소를 만들어 검색을 실행할 제출 버튼으로 사용함.
  const submit = document.createElement('button');
  // submit 버튼을 누르거나 입력칸에서 Enter를 누르면 form의 submit 이벤트가 발생함.
  submit.type = 'submit';
  // 공통 버튼 CSS를 선택할 수 있게 클래스 이름을 붙임.
  submit.className = 'button';
  // 버튼 안에 보이는 문구임.
  submit.textContent = '검색';
  // label을 form의 첫 자식으로 넣어 입력 설명이 먼저 나타나도록 함.
  form.appendChild(label);
  // label 뒤에 입력칸을 붙임. 이 순서가 화면의 기본 배치 순서가 됨.
  form.appendChild(input);
  // 입력칸 뒤에 검색 버튼을 붙여 폼 구성을 완성함.
  form.appendChild(submit);

  // submit 이벤트가 나중에 발생했을 때 실행할 함수를 등록함. 지금 즉시 검색하지는 않음.
  // async 함수 안에서는 await로 화면 갱신의 완료를 기다릴 수 있음.
  form.addEventListener('submit', async function (event) {
    // 폼 제출에 따른 문서 전체 이동을 막음. 아래 코드로 URL과 본문을 직접 갱신함.
    event.preventDefault();
    // 실패할 수 있는 URL 변경·화면 갱신을 try 안에 두어 catch에서 안내할 수 있게 함.
    try {
      // 입력한 문자열에서 앞뒤 공백을 정리하여 현재 검색어 변수에 다시 저장함.
      query = input.value.trim();
      // URL에 넣을 검색 매개변수를 새 객체로 만듦.
      const params = new URLSearchParams();
      // q에 검색어를 넣음. 한글·공백·& 등은 URL에 맞는 형태로 자동 인코딩됨.
      params.set('q', query);
      // replaceState는 주소 표시줄의 현재 기록을 교체함. 새 페이지를 요청하거나 뒤로가기 항목을 추가하지 않음.
      // 첫 인수 null은 별도의 상태 객체를 저장하지 않음, 둘째 ''는 사용하지 않는 제목 인수임.
      // URL도 바꾸므로 이 상태에서 새로고침하거나 주소를 복사해도 같은 검색어로 시작할 수 있음.
      history.replaceState(null, '', 'movies.html?' + params.toString());
      // query가 바뀌었으므로 최신 기록을 읽고 검색 결과 화면을 다시 만듦.
      // await는 이 이벤트 함수의 다음 줄을 기다리게 하며 브라우저 전체를 멈추지 않음.
      await refresh();
    } catch (error) {
      // URL 변경 또는 갱신 실패를 처리함. refresh가 같은 안내를 했어도 기존 안내 영역의 문구만 갱신됨.
      // ||는 error.message가 빈 값일 때 오른쪽의 기본 안내 문구를 선택함.
      showMessage(error.message || '검색 결과를 불러올 수 없습니다.', 'error');
    }
  });

  // searchMovies는 검색 판정만 하고 화면이나 저장소를 바꾸지 않음.
  // query가 빈 문자열이면 전체 영화, 값이 있으면 제목·별칭·인물 이름에 일치하는 영화 배열을 받음.
  const results = searchMovies(catalog, query);
  // 결과 개수를 보여줄 p 요소를 만듦. 배열.length는 결과로 나온 영화의 개수임.
  const count = document.createElement('p');
  // 결과 안내를 CSS에서 구분할 수 있게 클래스 이름을 붙임.
  count.className = 'result-count';
  // 검색 결과 안내가 상태 정보임을 보조 기술에 알리는 설정임.
  count.setAttribute('aria-live', 'polite');
  // 검색어가 없으면 '전체 영화', 있으면 입력한 검색어와 '검색 결과'라는 문구를 붙임.
  if (query === '') {
    // 숫자를 문자열과 +로 연결하면 화면에 읽을 수 있는 문장이 됨.
    count.textContent = '전체 영화 ' + results.length + '편';
  } else {
    // 입력한 검색어도 textContent로 넣으므로 검색어 속 HTML 문자가 태그로 실행되지 않음.
    count.textContent = '“' + query + '” 검색 결과 ' + results.length + '편';
  }

  // 영화 항목들을 담을 부모 div를 만듦.
  const grid = document.createElement('div');
  // 메인 목록과 같은 card-grid를 사용하므로 공통 CSS의 열 배치를 적용받음.
  grid.className = 'card-grid';
  // 이미 본 영화 ID를 중복 없이 기억할 Set임. 같은 영화를 여러 번 봐도 ID는 하나만 남음.
  const watched = new Set();
  // snapshot.logs에서 감상 기록을 하나씩 읽음. 이 반복은 원래 기록을 수정하지 않음.
  for (const log of snapshot.logs) {
    // Set.add는 영화 ID를 추가함. 이미 같은 ID가 있으면 중복 저장하지 않음.
    watched.add(log.movie_id);
  }
  // 검색 결과에 해당하는 영화마다 화면 요소 한 개를 만듦. 배열 순서는 검색 함수가 돌려준 순서임.
  for (const movie of results) {
    // has(ID)는 이 영화를 본 기록이 있는지 true/false로 알려줌.
    const hasWatched = watched.has(movie.movie_id);
    // movieCard는 제목·기본 정보·상세 링크를 가진 article을 만듦.
    // watched 옵션이 true이면 카드에 '감상한 영화'라는 안내도 붙임.
    const card = movieCard(catalog, movie, { watched: hasWatched });
    // 카드 한 개를 grid의 마지막에 붙임. 영화 제목 링크는 movie.html?id=영화ID로 연결됨.
    grid.appendChild(card);
  }

  // 검색 결과가 없을 때는 빈 화면 대신 다음 행동을 안내함.
  if (results.length === 0) {
    // 비어 있는 결과 안내를 담을 바깥 div임.
    const empty = document.createElement('div');
    // 공통 CSS에서 점선 테두리와 간격을 지정한 empty-state를 적용함.
    empty.className = 'empty-state';
    // h2는 결과 없음 안내의 소제목임.
    const emptyTitle = document.createElement('h2');
    // 현재 조건에 맞는 영화가 없음을 설명함.
    emptyTitle.textContent = '검색 결과가 없습니다';
    // 안내 제목을 empty 안에 먼저 넣음.
    empty.appendChild(emptyTitle);
    // 검색어를 바꾸거나 비울 수 있음을 알려줄 문단임.
    const emptyText = document.createElement('p');
    // 빈 검색어로 제출하면 위의 전체 목록 분기로 돌아감.
    emptyText.textContent = '다른 제목·별칭·인물 이름으로 검색해 주세요. 검색어를 비우면 전체 영화가 표시됩니다.';
    // 안내 제목 아래에 설명 문단을 붙임.
    empty.appendChild(emptyText);
    // 완성한 안내를 영화 목록 자리인 grid에 넣음.
    grid.appendChild(empty);
  }

  // app 자체는 유지하면서 자식들을 제목 → 검색 폼 → 결과 수 → 영화 목록 순서로 교체함.
  // 이전 검색 결과는 화면에서 사라지지만 저장소의 감상 기록은 삭제되지 않음.
  app.replaceChildren(heading, form, count, grid);
}

// 공통 메뉴·자료·저장소 준비를 시작함. render에는 함수의 실행 결과가 아니라 함수 자체를 넘김.
boot({
  // 공통 메뉴에서 '영화 검색' 항목을 현재 위치로 표시할 때 쓰는 페이지 이름임.
  page: 'movies',
  // 준비가 시작되면 브라우저 탭의 제목을 이 문자열로 바꿈.
  title: '영화 검색',
  // 준비 완료와 이후 refresh()마다 renderMovies(context)를 호출하도록 연결함.
  render: renderMovies
});
