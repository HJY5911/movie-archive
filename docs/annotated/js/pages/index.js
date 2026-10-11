/*
 * index.js — 메인 페이지의 내용과 버튼 동작을 만드는 파일
 *
 * HTML의 <script type="module" src="js/pages/index.js">가 이 모듈을 불러옴.
 * 이 파일은 아래 import로 필요한 함수를 가져온 다음 boot()를 한 번 호출함.
 * 실제 본문은 boot()에 전달한 render 함수가 만들며, 저장 후 refresh()를 호출하면
 * 최신 기록을 읽은 뒤 같은 render 함수가 다시 실행됨.
 *
 * 화면에 만드는 순서: 제목·검색창(hero) → 감상 요약(stats)
 *                   → 최근 감상 기록(recent) → 영화 목록(explore)
 * 현재는 팀에서 디자인을 정하기 전 단계라 텍스트·링크·기본 버튼 위주임.
 * className은 나중에 CSS를 적용할 연결 이름이며, 그 자체가 색상이나 장식은 아님.
 *
 * 데이터 구분:
 * - catalog: catalog.json에서 읽은 영화·장르 등 기본 자료임.
 * - snapshot.logs: 현재 브라우저에 저장된 사용자의 감상 기록 목록임.
 * - totals: getHomeSummary()가 계산한 감상 영화 수·감상 횟수·총 감상 시간임.
 *           메인에서 보여줄 세 값만 계산하며, 별도 통계 테이블로 저장하지 않음.
 *
 * 이 파일은 메인 페이지에서 검색어를 URL로 보내는 동작을 구현함.
 * 검색 결과·캘린더·영화 상세 화면 자체의 구현은 해당 페이지 파일의 책임임.
 * 캘린더는 calendar.js, 검색 결과는 movies.js, 영화 상세와 기록 편집은 movie.js가 담당함.
 */

// import { 함수 이름들 } from '경로': 다른 파일에서 export한 함수를 가져옴.
// '../'는 현재 js/pages 폴더의 한 단계 위인 js 폴더를 가리킴.
// boot: 메뉴·데이터·저장소 준비, el: HTML 요소 생성,
// movieCard: 영화 정보 요소 생성, showMessage: 저장 결과 안내.
import { boot, el, movieCard, showMessage } from '../ui.js';
// getHomeSummary는 감상 기록에서 메인 화면에 필요한 요약 세 가지를 계산하는 함수임.
// 날짜별 기록·장르별 통계처럼 다른 페이지에서 쓸 결과까지 여기서 계산하지 않음.
import { getHomeSummary } from '../selectors.js';
// mutateWatchLog는 감상 기록을 검사한 뒤 추가·수정·삭제하는 저장소 함수임.
// 이 페이지에서는 예시 감상 기록을 'create'(추가)할 때만 사용함.
import { mutateWatchLog } from '../repository.js';

/*
 * boot({...})에 설정 객체 하나를 전달함.
 * page는 공통 메뉴의 현재 위치, title은 브라우저 탭 제목임.
 * render 속성에는 '화면을 어떻게 만들 것인지'를 함수로 전달함.
 * render는 JavaScript 예약어가 아니라 이 프로젝트가 정한 속성 이름임.
 *
 * async ({ app, catalog, repo, snapshot, refresh }) => { ... }
 * - async: 함수가 Promise를 반환하며 내부에서 await를 사용할 수 있다는 선언임.
 * - (...) => {...}: 화살표 함수 문법임.
 * - 매개변수의 {...}: 객체 구조 분해로 전달된 값들을 이름별로 꺼냄.
 * - app: <main id="app"> 요소임. 완성한 내용을 마지막에 여기에 넣음.
 * - catalog: 영화 기본 자료와 ID 조회용 자료(Map)임.
 * - repo: IndexedDB에 접근하기 위한 정보임.
 * - snapshot: 저장소에서 방금 읽은 프로필·감상 기록·사진 정보임.
 * - refresh: 저장소를 다시 읽고 render를 다시 실행하는 함수임.
 *
 * boot()는 비동기 준비를 시작함. 여기서는 그 반환 Promise를 변수에 담지 않음.
 * 데이터 로딩 등의 초기 실패는 ui.js의 boot 내부에서 오류 화면으로 처리함.
 * 버튼 클릭은 나중에 발생하므로, 버튼 안의 실패 처리는 해당 이벤트 함수 안에서 함.
 */
boot({
  // 메뉴의 key가 index인 항목을 현재 페이지로 표시하도록 함.
  page: 'index',
  // 브라우저 탭에 사용할 제목임. 본문의 h1 글자는 아래에서 별도로 지정함.
  title: '메인 페이지',
  // boot가 준비한 객체에서 본문·자료·저장소·기록·갱신 함수를 받아 화면을 그림.
  render: async ({ app, catalog, repo, snapshot, refresh }) => {
  // 함수 호출 결과 객체를 totals에 보관함. const 변수에 다른 값을 다시 대입하지 않음.
  // 원본 기록은 snapshot.logs이며, 이 페이지가 통계용 사본을 별도 DB에 저장하지는 않음.
  // getHomeSummary의 반환 객체에는 unique_movie_count, watch_count, runtime_total이 있음.
  // 아래 감상 요약 영역에서 이 세 속성을 읽어 각각 영화 수·감상 횟수·시간을 표시함.
  const totals = getHomeSummary(catalog, snapshot.logs);

  // 본문의 첫 영역을 기본 DOM 명령으로 차례대로 만듦.
  // document는 현재 HTML 문서이며 createElement('태그')는 새 요소를 만드는 기본 메서드임.
  // hero는 제목·검색창을 담는 section, heading은 그 안에 넣을 h1임.
  // const로 선언해도 요소의 글자나 자식은 바꿀 수 있음. 변수에 다른 요소를 재대입하지 않을 뿐임.
  const hero = document.createElement('section');
  // h1 요소를 따로 만들어 heading에 보관함. hero 안에 붙이는 작업은 아직 하지 않았음.
  const heading = document.createElement('h1');
  // textContent는 문자열을 글자로 넣음. HTML 코드로 해석하지 않음.
  heading.textContent = '영화 감상 기록';
  // 부모.appendChild(자식)는 자식 요소 하나를 부모의 맨 뒤에 붙이는 기본 메서드임.
  // 이제 <section><h1>영화 감상 기록</h1></section> 구조가 만들어짐.
  // hero는 아직 app에 붙이지 않았으므로 이 단계에서는 화면에 표시되지 않음.
  hero.appendChild(heading);

  // form은 검색어 입력과 제출 버튼을 하나로 묶는 HTML 폼임.
  // action은 기본 제출 대상임. 아래 submit 이벤트에서 기본 제출을 막고 URL 이동을 직접 함.
  // 나머지 요소는 기존 el(태그, 속성 객체, 자식들) 도우미를 사용함.
  // el 역시 내부에서 createElement 등 DOM 명령을 호출하며, 같은 일을 짧게 묶어 둔 함수임.
  const form = el('form', {
    // 검색창 배치에 사용하는 클래스임. movies.js의 검색 폼도 같은 클래스를 사용함.
    className: 'search-form',
    // 기본 폼 제출 대상임. 실제 실행에서는 아래 submit 처리 함수가 URL 이동을 맡음.
    action: 'movies.html'
  });
  // input 요소를 만들고 아래 속성들을 넣음. 완성된 요소는 form.append에서 폼에 붙임.
  const input = el('input', {
    // id는 문서에서 이 입력 요소를 찾거나 label과 연결할 때 쓰는 고유 이름임.
    id: 'movie-search',
    // type='search'는 검색어 입력용 칸이라는 뜻임. 검색 기능을 자동 구현하지는 않음.
    type: 'search',
    // name은 폼 데이터의 항목 이름임. 검색 페이지에 q라는 이름으로 검색어를 전달함.
    name: 'q',
    // placeholder는 아무것도 입력하지 않았을 때 보이는 안내임. 실제 입력값은 아님.
    placeholder: '영화 제목, 배우 또는 감독을 검색하세요',
    // ariaLabel은 화면 읽기 프로그램 등이 이 입력칸의 목적을 알 수 있도록 붙이는 이름임.
    ariaLabel: '영화 검색어'
  });

  // append(요소1, 요소2, ...)는 부모의 기존 자식 뒤에 여러 요소를 순서대로 붙임.
  // label의 htmlFor는 HTML의 for 속성에 해당하며, 위 input의 id와 연결함.
  // label 글씨를 클릭하면 연결된 입력칸으로 초점이 이동할 수 있음.
  // type='submit' 버튼은 form의 submit 이벤트를 발생시킴. 입력칸에서 Enter를 눌러도 제출됨.
  form.append(
    // 첫 자식: 화면에 보이는 '영화 검색' 설명임. htmlFor가 input.id와 같아 두 요소가 연결됨.
    el('label', { htmlFor: 'movie-search' }, '영화 검색'),
    // 둘째 자식: 위에서 만들어 둔 input DOM 객체를 그대로 붙임. 복사하거나 새로 만들지 않음.
    input,
    // 셋째 자식: button 클래스를 가진 제출 버튼을 만들어 붙임. '검색'은 버튼 안의 글자임.
    el('button', { className: 'button', type: 'submit' }, '검색')
  );

  // addEventListener(이벤트 이름, 처리 함수)는 나중에 발생할 이벤트의 처리 방법을 등록함.
  // 이 줄을 실행하는 지금 검색하는 것이 아니라, 사용자가 폼을 제출했을 때 함수가 실행됨.
  // event는 브라우저가 이 제출에 대한 정보를 담아 전달하는 객체임.
  form.addEventListener('submit', (event) => {
    // 브라우저가 form을 기본 방식으로 제출하는 동작을 취소함.
    // 아래에서 이동할 주소를 직접 만들기 때문에 중복된 기본 제출이 필요 없음.
    event.preventDefault();

    // input.value: 현재 입력된 문자열. trim(): 앞뒤 공백을 제거한 새 문자열.
    // new URLSearchParams({ q: ... }): 검색 매개변수를 만드는 브라우저 기본 객체.
    // 백틱의 ${...} 안에서는 이 객체가 문자열로 변환되어 q=검색어 형태로 들어감.
    // 한글·공백·& 등도 URL의 다른 구분자로 오해되지 않도록 알맞게 인코딩됨.
    // location.href에 대입하면 현재 탭이 그 주소로 이동함.
    // 예: test 입력 → movies.html?q=test. 이 코드에서는 빈 검색어도 그대로 전달함.
    // 이동한 뒤 실제 일치 영화를 찾고 결과를 표시하는 작업은 movies.js와 searchMovies()가 수행함.
    location.href = `movies.html?${new URLSearchParams({ q: input.value.trim() })}`;
  });

  // catalog.Movie는 영화 기본 정보 배열이고 length는 배열의 영화 개수임.
  // '등록된 영화'는 감상한 영화 수가 아니라 사이트가 가지고 있는 기본 영화 목록의 수임.
  // 백틱(`...`)은 문자열 안에 ${표현식}으로 계산 결과를 끼워 넣는 템플릿 문자열 문법임.
  hero.append(
    // 제목 뒤에 완성한 검색 폼을 붙임. form 안에는 label·input·button이 들어 있음.
    form,
    // 폼 다음에 등록 영화 수를 보여주는 p를 만듦. muted와 small은 CSS용 클래스 이름 두 개임.
    el('p', { className: 'muted small' }, `등록된 영화: ${catalog.Movie.length}편`)
  );

  // 감상 요약 전체를 담을 영역임. ariaLabel은 이 영역의 의미를 설명함.
  const stats = el('section', {
    // 통계 항목들을 나란히 배치하는 공통 CSS 규칙과 연결함.
    className: 'stat-grid',
    // 여러 숫자가 어떤 정보인지 보조 기술에 설명하는 영역 이름임.
    ariaLabel: '나의 감상 요약'
  });

  // 세 통계 값을 [설명, 숫자, 단위] 배열로 나열한 뒤 같은 방식으로 화면에 출력함.
  // unique_movie_count: 같은 영화를 여러 번 봐도 1편으로 계산한 영화 수.
  // watch_count: 감상 기록 수. 영화 A를 두 번, B를 한 번 봤다면 3회.
  // runtime_total: 각 감상 기록에 해당하는 영화 상영 시간을 더한 값. 재감상도 다시 더함.
  // for...of는 배열 항목을 차례로 꺼냄.
  // [label, value, unit] 구조 분해는 각 항목의 세 값을 각각의 이름으로 받음.
  for (const [label, value, unit] of [
    // 첫 번째 반복에서 label='감상한 영화', value=영화 수, unit='편'이 됨.
    ['감상한 영화', totals.unique_movie_count, '편'],
    // 두 번째 반복에서는 재감상까지 포함한 전체 감상 횟수를 사용함.
    ['감상 횟수', totals.watch_count, '회'],
    // 세 번째 반복에서는 영화별 상영 시간에 감상 횟수를 반영한 분 단위 합계를 사용함.
    ['총 감상 시간', totals.runtime_total, '분']
  ]) {
    // 반복할 때마다 article 요소 한 개를 만들어 stats 뒤에 붙임.
    // span에는 설명, strong에는 강조할 숫자, small에는 단위를 넣음.
    // String(value)는 숫자를 문자열로 바꿈. 저장된 totals 값 자체는 바뀌지 않음.
    stats.append(el('article', { className: 'stat-card' },
      // article의 첫 자식은 설명 span임. 예: '감상한 영화: '.
      el('span', { className: 'muted' }, `${label}: `),
      // 둘째 자식은 strong임. 안에는 숫자 텍스트와 단위 small이 차례로 들어감.
      // 결과 예: <article class="stat-card"><span ...>감상한 영화: </span><strong>2<small> 편</small></strong></article>.
      el('strong', {}, String(value), el('small', {}, ` ${unit}`))
    ));
  }

  // 최근 기록 영역에는 제목과 캘린더 링크를 먼저 넣음.
  // a 태그의 href는 클릭 후 이동할 주소이며, 이 코드가 캘린더 내용을 만드는 것은 아님.
  const recent = el('section', { className: 'page-section' },
    // section의 첫 자식으로 구역 제목과 이동 링크를 함께 감싸는 div를 만듦.
    el('div', { className: 'section-heading' },
      // div 안의 첫 자식은 최근 기록 구역의 소제목 h2임.
      el('h2', {}, '최근 감상 기록'),
      // div 안의 둘째 자식은 calendar.html로 이동하는 a임. text-link는 링크 표시용 클래스임.
      el('a', { href: 'calendar.html', className: 'text-link' }, '캘린더로 이동')
    )
  );

  // !는 논리 부정임. 숫자 0은 거짓으로 취급되므로 !0은 true임.
  // 즉 감상 기록 개수가 0이면 if 블록, 하나 이상이면 아래 else 블록을 실행함.
  if (!snapshot.logs.length) {
    // 기록 없는 상태의 설명·검색 링크·예시 저장 버튼을 묶을 div를 만듦.
    const empty = el('div', { className: 'empty-state' },
      // 안내 div의 첫 자식: 지금 보여 줄 감상 기록이 없다는 소제목임.
      el('h3', {}, '감상 기록이 없습니다'),
      // 둘째 자식: 아래 예시 버튼으로 무엇을 확인할 수 있는지 설명하는 p임.
      el('p', {}, '예시 기록 버튼으로 저장과 감상 요약을 확인할 수 있습니다.'),
      // 모양에 'button' 클래스가 있어도 실제 태그가 a이므로 동작은 페이지 이동 링크임.
      el('a', { href: 'movies.html', className: 'button' }, '영화 검색 페이지로 이동')
    );
    // type='button'은 폼 제출용이 아닌 일반 버튼임. 동작은 아래 click 이벤트가 정함.
    const sampleButton = el('button', {
      // 이 버튼은 form 제출 대신 아래의 click 함수에서 예시 기록을 저장함.
      type: 'button',
      // 공통 버튼과 보조 버튼을 구분하는 클래스 두 개를 붙임.
      className: 'button secondary'
    }, '예시 감상 기록 6개 넣어보기');

    // disabled=true이면 버튼을 누를 수 없음. 기본 영화 목록이 비어 있으면 비활성화함.
    // ===는 형변환 없이 값과 자료형이 같은지 비교하는 연산자임.
    // 영화가 1~4편뿐이어도 아래 나머지 연산으로 순환해서 6개의 감상 기록을 만들 수 있음.
    sampleButton.disabled = catalog.Movie.length === 0;

    // 클릭 시 실행할 비동기 함수를 등록함. 등록만으로 기록이 저장되지는 않음.
    // 이 함수는 render가 끝난 후에도 repo, catalog, refresh, sampleButton을 참조함.
    // 바깥 함수의 값을 나중에 사용하는 이런 성질을 클로저라고 함.
    sampleButton.addEventListener('click', async () => {
      // 현재 버튼을 잠시 비활성화해 같은 버튼을 연속 클릭하는 것을 막음.
      sampleButton.disabled = true;
      // let은 값을 다시 대입할 수 있음. 완료한 저장 횟수를 0부터 세기 위한 변수임.
      let saved = 0;
      try {
        // new Date()는 현재 시각을 가진 날짜 객체를 만듦.
        // 여기서 쓰는 getFullYear/getMonth/getDate는 브라우저 환경의 현지 날짜를 읽음.
        const now = new Date();

        // getFullYear(): 연도. getMonth(): 0~11이므로 사람이 보는 월에는 1을 더함.
        // String(...): 숫자를 문자열로 바꾸고 padStart(2, '0'): 두 자리가 되도록 앞에 0을 붙임.
        // 예: 2026년 10월이면 '2026-10', 3월이면 '2026-03'임.
        const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // 영화 목록에서 고를 위치임. 배열은 0부터 시작하므로 0은 첫 번째 영화임.
        // 0을 두 번 넣어 같은 영화를 다시 감상한 상황도 확인하도록 만들었음.
        // 따라서 예시 기록 6개는 서로 다른 영화 6편을 뜻하지 않음.
        const picks = [0, 1, 2, 0, 3, 4];

        // entries()는 [배열 인덱스, 그 위치의 값] 쌍을 차례로 줌.
        // 여기서 i는 0~5의 반복 번호, position은 picks에 적힌 영화 선택 위치임.
        for (const [i, position] of picks.entries()) {
          // await는 이번 저장이 성공하거나 실패할 때까지 이 이벤트 함수의 다음 줄을 기다림.
          // UI 전체를 멈추는 것은 아님. 성공하면 다음 기록으로 진행하며 실패하면 catch로 감.
          // 'create'는 새 감상 기록을 추가하라는 구분값임.
          // 이 동작은 화면에 가짜 숫자만 보이는 것이 아니라 현재 브라우저의 IndexedDB에 실제로 저장함.
          // 6건을 한꺼번에 하나의 작업으로 저장하지 않고, 각각 별도의 저장 작업으로 순차 처리함.
          await mutateWatchLog(repo, catalog, 'create', {
            // %는 나머지 연산임. 영화가 3편이면 position 3은 0, position 4는 1로 바뀜.
            // 이렇게 배열 범위를 넘지 않는 위치로 순환한 뒤, 그 영화 객체의 movie_id를 꺼냄.
            movie_id: catalog.Movie[position % catalog.Movie.length].movie_id,

            // getDate()는 이번 달의 '일'임. getDay()는 요일이므로 서로 다름.
            // i+1로 1~6일을 만들되, Math.min(오늘 날짜, i+1)으로 오늘 이후 날짜를 피함.
            // Math.max(1, ...)는 최소 1일을 보장함. padStart로 01~06처럼 두 자리를 맞춤.
            // 오늘이 3일이면 01, 02, 03, 03, 03, 03에 저장되므로 같은 날 여러 기록이 생길 수 있음.
            watched_on: `${prefix}-${String(Math.max(1, Math.min(now.getDate(), i + 1))).padStart(2, '0')}`,

            // 배열 뒤의 [i]는 이번 반복 번호에 해당하는 별점을 하나 고름.
            // null은 '0점'이 아니라 별점을 입력하지 않았다는 의미임.
            rating: [4.5, 3.5, null, 5, 4, 0.5][i],

            // 조건 ? 참일 때의 값 : 거짓일 때의 값 형태는 삼항 연산자임.
            // i===3, 즉 네 번째 기록(첫 영화를 다시 본 기록)만 재감상 문장을 사용함.
            // 저장한 예시 기록은 해당 영화의 상세 페이지(movie.js)에서 수정하거나 삭제할 수 있음.
            review_text: i === 3 ? '다시 보니 새로운 장면이 눈에 들어왔다. (예시)' : '직접 수정하거나 삭제해도 되는 예시 기록입니다.'
          });

          // += 1은 saved = saved + 1과 같음. 저장이 성공한 뒤에만 완료 횟수를 늘림.
          saved += 1;
        }

        // 반복문 6회를 모두 성공했을 때만 이 안내를 표시함.
        showMessage('예시 감상 기록 6개를 저장했습니다.');
        // 저장소를 다시 읽고 화면을 그림. 기록이 생겼으므로 다시 그릴 때는 아래 else로 감.
        // 따라서 예시 버튼 대신 최근 기록이 보이며, 감상 요약도 새 기록으로 다시 계산됨.
        await refresh();
      } catch (error) {
        // try 안에서 오류가 나면 이 블록을 실행함. error.message는 오류의 설명임.
        // 이미 성공한 saved건은 저장소에 남음. 이 코드가 앞선 저장까지 되돌리지는 않음.
        // 화면 갱신 자체가 실패한 경우에도 이 catch로 들어올 수 있음.
        showMessage(`${saved}개 저장 후 중단되었습니다. ${error.message}`, 'error');
        // saved가 0이 아니면 성공한 기록이라도 반영하도록 갱신함.
        // 이 await 중 다시 오류가 나면 그 오류는 이 catch가 재차 처리하지 않고 호출 밖으로 전달됨.
        if (saved) await refresh();
      } finally {
        // finally는 try 성공·실패 여부에 관계없이 실행됨.
        // 버튼이 아직 화면에 있으면 다시 누를 수 있게 함.
        // 이미 refresh로 화면이 교체됐다면 이 변수는 제거된 이전 버튼을 가리킴.
        sampleButton.disabled = false;
      }
    });

    // 만든 버튼을 안내 영역에 넣고, 안내 영역을 최근 기록 영역에 넣음.
    // empty 안에는 이미 제목·안내 문단·검색 링크가 있으므로 예시 버튼은 그 뒤에 추가됨.
    empty.append(sampleButton);
    // 완성한 안내 div를 recent section 안의 구역 제목 아래에 붙임.
    recent.append(empty);
  } else {
    // 감상 기록이 이미 있는 경우 최대 4건의 최근 기록을 표시함.
    // cards는 개별 영화 카드 article들을 담는 div이며 card-grid CSS가 열 배치를 정함.
    const cards = el('div', { className: 'card-grid' });

    // snapshot.logs는 repository.js의 readSnapshot()에서 이미 최신 기록부터 정렬해서 전달함.
    // 정렬 기준은 최신 감상 날짜 → 최신 등록 시각 → 두 값이 같으면 기록 ID 순임.
    // 이 페이지에서는 같은 정렬을 다시 하지 않고, 그 결과의 앞에서 최대 네 건만 가져옴.
    // slice(0, 4)는 인덱스 0부터 4 직전까지를 담은 새 배열을 만듦.
    // 원래 snapshot.logs를 잘라 없애거나 순서를 바꾸지 않음.
    // 항목이 네 개보다 적으면 있는 만큼만 반환함. 각 기록 객체 자체를 복제하지는 않음.
    const logs = snapshot.logs.slice(0, 4);

    // 위에서 고른 최근 기록을 한 건씩 읽음. 반복마다 새 영화 카드가 만들어짐.
    for (const log of logs) {
      // log는 감상 기록 한 건임. 영화 제목 대신 movie_id로 기본 영화 정보와 연결되어 있음.
      // lookup.movieById는 영화 ID → 영화 객체를 연결한 Map이며 get(ID)로 해당 영화를 조회함.
      const movie = catalog.lookup.movieById.get(log.movie_id);
      // watched:true 옵션을 전달하면 영화 정보에 '감상한 영화' 안내도 표시함.
      const card = movieCard(catalog, movie, { watched: true });

      // 별점이 null이면 미입력 문구를 보여주고, 숫자이면 toFixed(1)로 소수점 한 자리 문자열을 만듦.
      // 예: 4 → '4.0', 4.5 → '4.5'. 표시 형태만 바꾸며 저장된 숫자를 수정하지 않음.
      // 같은 영화를 여러 번 봤다면 영화 정보는 같더라도 날짜·별점이 다른 카드가 여러 개 나올 수 있음.
      // 카드의 마지막 자식으로 날짜·별점 안내 p를 추가함. card-note는 이 문단의 CSS 연결 이름임.
      card.append(el('p', { className: 'card-note' }, `${log.watched_on} · ${log.rating === null ? '별점 미입력' : `★ ${log.rating.toFixed(1)}`}`));
      // 날짜·별점까지 채운 카드 한 개를 목록 div의 맨 뒤에 넣음.
      cards.append(card);
    }
    // 기록 카드를 모두 모은 cards를 최근 기록 구역에 붙임. recent의 제목과 링크는 유지됨.
    recent.append(cards);
  }

  // 감상 여부와 관계없이 기본 영화 목록 일부를 보여주는 영역임.
  const explore = el('section', { className: 'page-section' },
    // section 안에 제목과 전체 보기 링크를 함께 담는 div를 만듦.
    el('div', { className: 'section-heading' },
      // 이 구역이 영화 목록임을 나타내는 소제목 h2임.
      el('h2', {}, '영화 목록'),
      // q가 없는 검색 페이지로 이동하면 movies.js가 전체 영화 목록을 보여줌.
      el('a', { href: 'movies.html', className: 'text-link' }, '전체 영화 보기')
    )
  );
  // 앞 네 편의 영화 카드들을 담을 div임. 위의 최근 기록 cards와는 별도 객체임.
  const collection = el('div', { className: 'card-grid' });

  // catalog.Movie의 앞에서 최대 네 편을 그대로 선택함. 무작위나 추천 알고리즘은 없음.
  // for...of의 본문이 한 문장이라 중괄호를 생략한 형태임.
  // movieCard의 세 번째 인수를 생략했으므로 watched 기본값은 false임.
  // 매 반복마다 movieCard로 article 하나를 만들고 collection의 맨 뒤에 바로 붙임.
  for (const movie of catalog.Movie.slice(0, 4)) collection.append(movieCard(catalog, movie));
  // 앞 네 편의 카드가 든 collection을 explore의 구역 제목 아래에 붙임.
  explore.append(collection);

  // 지금까지 메모리에서 조립한 네 영역을 실제 본문에 순서대로 넣음.
  // replaceChildren은 app 자체는 남기고 내부의 기존 자식만 교체함.
  // 최초에는 로딩 문구가 사라지고, 재실행 때는 이전 화면이 최신 화면으로 바뀜.
  // 화면을 다시 그려도 저장소의 기록은 삭제되지 않음. 여기서 교체하는 것은 DOM 요소임.
  app.replaceChildren(hero, stats, recent, explore);

  // 이 render 함수는 별도의 정리 함수를 반환하지 않음.
  // async 함수이므로 최종적으로 undefined로 완료되는 Promise를 boot에 돌려줌.
  // 실제 저장 대기는 이 render 안에서 등록한 클릭 이벤트 함수에서 수행함.
} });
