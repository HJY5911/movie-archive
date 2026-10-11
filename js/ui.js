/*
 * ui.js — 여러 페이지가 함께 사용하는 화면 구성 함수 모음
 *
 * 이 파일은 HTML 요소를 만들고 메뉴·메시지·초기 실행 흐름을 연결합니다.
 * 실제 색상, 글자 크기, 간격 등은 CSS에서 정합니다. className을 붙이는 것만으로
 * 색상이 생기지는 않습니다. 해당 클래스를 사용하는 CSS 규칙이 있어야 합니다.
 * 현재 버전에서는 디자인 합의 전에도 기능을 확인할 수 있도록 장식을 뺐습니다.
 *
 * 읽는 순서:
 * 1. el(): HTML 요소를 만드는 공통 도구
 * 2. showMessage(): 저장 성공·실패 등의 안내
 * 3. movieCard(): 영화 정보와 상세 페이지 링크
 * 4. mountShell(): 모든 페이지에 공통 메뉴 설치
 * 5. boot(): 데이터 준비 → 기록 읽기 → 각 페이지의 render() 호출
 *
 * export가 붙은 함수는 다른 파일에서 import하여 사용할 수 있습니다.
 * 아래 함수들은 JavaScript의 기본 명령어가 아니라 이 프로젝트에서 만든 함수입니다.
 */

// import { 이름들 } from '경로': 다른 모듈이 export한 함수를 이름으로 가져옵니다.
// './'는 이 ui.js와 같은 폴더를 뜻합니다. 여기서는 js/repository.js를 가리킵니다.
// loadCatalog(): 영화 기본 JSON을 읽고 검사하여 영화·장르 등의 자료를 준비합니다.
// openRepository(): 브라우저의 IndexedDB를 열고 저장소 접근에 필요한 값을 준비합니다.
// readSnapshot(): 열린 저장소에서 현재 프로필의 감상 기록·사진 정보를 읽습니다.
// 이 import 선언 자체가 위 세 함수를 호출하지는 않습니다. 세 함수의 작업은 호출할 때 시작합니다.
// 다만 가져온 모듈의 최상위 코드는 모듈을 불러와 평가하는 과정에서 실행됩니다.
import { loadCatalog, openRepository, readSnapshot } from './repository.js';

/*
 * el(tag, attrs, ...children)
 * 역할: HTML 요소 한 개를 만들고, 속성과 자식 내용을 넣어 돌려줍니다.
 *
 * tag: 'p', 'button', 'section'처럼 만들 HTML 태그 이름입니다.
 * attrs: { className: 'button', type: 'button' }처럼 속성을 적은 객체입니다.
 *        '= {}'는 인수를 생략하거나 undefined를 전달했을 때 빈 객체를 쓴다는 뜻입니다.
 * ...children: 세 번째 이후 인수를 모두 모은 배열입니다. 여기서 ...은 나머지 매개변수입니다.
 * 반환값: 만들어진 DOM 요소입니다. DOM은 브라우저가 HTML을 객체 형태로 관리하는 구조입니다.
 *
 * 예: el('p', { className: 'muted' }, '안녕하세요')
 *     → <p class="muted">안녕하세요</p>에 해당하는 요소를 만듭니다.
 * 주의: 만드는 것만으로 화면에 나타나지는 않습니다. 화면에 연결된 부모에 append하거나
 *       replaceChildren으로 넣어야 실제 페이지에서 볼 수 있습니다.
 * 글자 자식은 HTML 코드가 아닌 텍스트 노드로 넣으므로, 감상평의 '<b>'도 글자로 표시됩니다.
 * 다만 이 함수가 전달받은 모든 속성이나 URL까지 자동으로 안전하게 검사하는 것은 아닙니다.
 */
export function el(tag, attrs = {}, ...children) {
  // const: 이 변수 이름에 다른 값을 다시 대입하지 않겠다는 뜻입니다.
  // node가 가리키는 요소의 속성·자식은 아래처럼 바꿀 수 있습니다.
  // document는 현재 HTML 문서, createElement(tag)는 지정한 태그의 새 요소를 만듭니다.
  const node = document.createElement(tag);

  // Object.entries({ type: 'button' }) → [['type', 'button']]
  // for...of는 그 배열의 항목을 하나씩 꺼냅니다.
  // [key, value]는 구조 분해입니다. 각 항목의 첫 값을 key, 둘째 값을 value로 받습니다.
  for (const [key, value] of Object.entries(attrs)) {
    // ===는 형변환 없이 값과 자료형을 비교하는 엄격한 비교입니다.
    // ||는 '또는'입니다. null(명시적으로 없음)이나 undefined(정해지지 않음)는 건너뜁니다.
    // continue는 현재 반복의 나머지 코드를 생략하고 다음 속성으로 넘어갑니다.
    if (value === null || value === undefined) continue;

    // dataset은 data-* 속성을, style은 요소에 직접 지정하는 CSS를 다루는 객체입니다.
    // node[key]는 key에 들어 있는 이름으로 속성을 읽는 대괄호 표기입니다.
    // Object.assign(대상, 원본)은 원본 객체의 속성들을 대상 객체로 복사합니다.
    // 예: { style: { display: 'none' } }이면 node.style.display를 설정합니다.
    // dataset: { movieId: 'm001' }를 넘기면 HTML에는 data-movie-id="m001"이 연결됩니다.
    // style: { color: 'black' }를 넘기면 이 요소의 인라인 스타일에만 적용됩니다.
    // attrs 전체를 한꺼번에 복사하지 않고 이 속성의 값(value) 안에 적힌 항목만 복사합니다.
    if (key === 'dataset' || key === 'style') Object.assign(node[key], value);

    // 'key in node'는 node가 해당 이름의 속성을 가지고 있는지 확인합니다.
    // className, textContent, disabled, onclick 등은 DOM 속성에 직접 대입합니다.
    // onclick에 함수를 넣으면 클릭 시 실행할 처리 함수로 연결됩니다.
    // 예를 들어 key='disabled', value=false이면 node.disabled=false가 됩니다.
    // 문자열 'false'를 HTML disabled 속성에 넣는 것과 달리 실제 불리언 false로 비활성화를 해제합니다.
    // 이벤트 함수를 넘기면 함수 호출 결과가 아니라 함수 자체를 node.onclick에 넣어 나중에 실행하게 합니다.
    else if (key in node) node[key] = value;

    // DOM 속성으로 처리하지 않은 이름은 HTML 속성으로 붙입니다.
    // 예: setAttribute('aria-current', 'page'). String(value)는 값을 문자열로 바꿉니다.
    // key는 HTML 속성 이름, String(value)는 그 속성에 저장할 글자 값입니다.
    // setAttribute는 요소 내용이나 자식 태그를 만드는 메서드가 아니라 속성 하나를 정하는 메서드입니다.
    else node.setAttribute(key, String(value));
  }

  // children에는 문자열·숫자·DOM 요소뿐 아니라 이들을 담은 배열도 들어올 수 있습니다.
  // flat(Infinity)는 중첩 배열을 깊이 제한 없이 펼칩니다.
  // 예: ['제목', [요소1, [요소2]]] → ['제목', 요소1, 요소2]
  for (const child of children.flat(Infinity)) {
    // !==는 엄격한 '같지 않다', &&는 '그리고'입니다. null과 undefined는 넣지 않습니다.
    // 조건 ? A : B는 삼항 연산자입니다. 조건이 참이면 A, 거짓이면 B를 사용합니다.
    // child instanceof Node: child가 브라우저의 DOM 노드인지 검사합니다.
    // 노드라면 그대로 넣고, 아니라면 문자열로 바꿔 텍스트 노드를 만듭니다.
    // append는 이 요소의 맨 뒤에 자식을 추가합니다. 기존 자식은 유지됩니다.
    // 예: child가 el('strong', {}, '제목')이면 strong 요소를 현재 node의 자식으로 붙입니다.
    // child가 0이면 '0' 텍스트를 붙이며, false도 제외하지 않고 'false' 텍스트로 붙입니다.
    // 기존 DOM 요소를 붙이면 복제본이 아니라 그 요소 자체를 옮깁니다. 같은 노드를 두 위치에 동시에 둘 수는 없습니다.
    if (child !== null && child !== undefined) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  // 호출한 곳에서 이 요소를 변수에 담거나 다른 el()의 자식으로 사용할 수 있게 반환합니다.
  return node;
}

// let은 나중에 값을 다시 대입할 수 있는 변수입니다. 처음에는 undefined입니다.
// 모듈 범위에 두어 showMessage()를 여러 번 호출해도 직전 타이머 번호를 기억합니다.
let messageTimer;

/*
 * showMessage(text, type)
 * text: 화면에 표시할 안내 문장입니다.
 * type: 안내 종류입니다. 생략하면 'success', 오류 알림에는 'error'를 사용합니다.
 * HTML에 id="messages" 요소가 준비되어 있다는 전제로 동작합니다.
 * 반환값을 따로 정하지 않았으므로 호출 결과는 undefined입니다.
 */
export function showMessage(text, type = 'success') {
  // querySelector는 CSS 선택자와 일치하는 첫 요소를 찾습니다. #은 id 선택자입니다.
  const region = document.querySelector('#messages');

  // 이전 알림의 숨김 예약을 취소합니다. 새 알림이 오래된 예약 때문에 일찍 사라지는 것을 막습니다.
  // 아직 타이머가 없는 첫 호출에서도 clearTimeout(undefined)는 취소할 작업 없이 끝납니다.
  clearTimeout(messageTimer);

  // 백틱(`)으로 감싼 것은 템플릿 문자열입니다. ${표현식} 자리에 계산한 값을 넣습니다.
  // 예: type이 'error'이면 'toast error'. className 대입은 기존 클래스 전체를 교체합니다.
  region.className = `toast ${type}`;
  // textContent는 HTML을 해석하지 않고 문자를 넣습니다. 이전 메시지는 새 문장으로 바뀝니다.
  region.textContent = text;
  // hidden은 요소를 숨기는 HTML 속성에 연결된 속성입니다. false로 바꿔 메시지를 보여줍니다.
  region.hidden = false;

  // setTimeout(함수, 밀리초)는 지정한 시간이 지난 뒤 실행할 함수를 예약합니다.
  // 지금 여기서 6초·12초 동안 프로그램을 멈추는 명령은 아닙니다.
  // () => { ... }는 이름 없는 화살표 함수로, 이 함수 자체를 타이머에 전달합니다.
  // 함수는 이 호출의 region을 기억했다가 나중에 숨깁니다. 이런 참조 유지가 클로저입니다.
  // 오류는 12000ms(12초), 그 외는 6000ms(6초) 뒤 숨깁니다. 실제 실행은 더 늦어질 수 있습니다.
  // 반환된 타이머 번호를 저장해야 다음 알림에서 취소할 수 있습니다.
  messageTimer = setTimeout(() => { region.hidden = true; }, type === 'error' ? 12000 : 6000);
}

/*
 * movieCard(catalog, movie, options)
 * catalog: 영화·장르·연결 자료와 ID별 검색용 Map 등이 들어 있는 객체입니다.
 * movie: 표시할 영화 한 편의 객체입니다.
 * 세 번째 인수 { watched = false } = {}는 옵션 객체에서 watched를 꺼내는 구조 분해입니다.
 * 옵션 객체를 생략해도 {}, watched를 생략해도 false를 사용하므로 호출하기 편합니다.
 * 반환값: 영화 제목, 기본 정보, 상세 링크를 넣은 article 요소입니다.
 * 현재는 포스터와 색상 장식을 생성하지 않습니다. 상세 화면의 입력·저장은 pages/movie.js에서 처리합니다.
 * 아래에서는 el()에 요소를 중첩해 전달하는 대신 기본 DOM 명령을 한 단계씩 사용합니다.
 * 요소를 만들기 → 속성과 글자를 넣기 → 부모 요소에 붙이기 순서로 읽으면 됩니다.
 */
export function movieCard(catalog, movie, { watched = false } = {}) {
  // MovieGenre는 영화와 장르의 연결 목록입니다. 영화 하나가 여러 장르에 속할 수 있습니다.
  const genres = catalog.MovieGenre
    // filter(검사 함수)는 조건이 참인 항목만 모아 새로운 배열을 만듭니다.
    // row => 식 은 'row를 받아 이 식의 결과를 반환하는 함수'의 짧은 형태입니다.
    .filter(row => row.movie_id === movie.movie_id)
    // map(변환 함수)은 각 항목을 다른 값으로 바꾼 새 배열을 만듭니다.
    // 여기서는 장르 ID를 genreById라는 Map의 get(ID)으로 조회해 장르 이름으로 바꿉니다.
    // 예: 연결 행들의 배열 → ['드라마', '코미디']. 원래 연결 목록은 바꾸지 않습니다.
    .map(row => catalog.lookup.genreById.get(row.genre_id).name);

  // document.createElement(태그 이름)는 브라우저의 기본 기능으로 새 HTML 요소를 만듭니다.
  // article은 영화 한 편의 제목과 정보를 묶는 바깥 요소입니다. 아직 실제 문서에는 붙지 않았습니다.
  const card = document.createElement('article');
  // className은 HTML의 class 속성에 해당합니다. 기존 이름을 유지해 같은 CSS를 적용받게 합니다.
  card.className = 'movie-card';

  // h3는 영화 제목을 담을 소제목, a는 제목을 클릭하면 상세 화면으로 이동하게 할 링크입니다.
  // heading은 글자가 아니라 HTMLHeadingElement 객체이며, 그 안에 다음 줄의 링크를 넣을 예정입니다.
  const heading = document.createElement('h3');
  // link는 아직 주소와 제목이 없는 HTMLAnchorElement 객체입니다. 바로 아래 href/textContent에서 값을 채웁니다.
  const link = document.createElement('a');
  // href는 이동할 주소입니다. ?id=...는 이동할 페이지에 전달하는 검색 매개변수입니다.
  // encodeURIComponent는 ID의 특수문자가 URL 구조로 잘못 해석되지 않도록 인코딩합니다.
  // 이 링크는 상세 페이지 주소를 만드는 것이며, 상세 기능 자체를 구현하는 코드는 아닙니다.
  link.href = `movie.html?id=${encodeURIComponent(movie.movie_id)}`;
  // textContent는 제목을 일반 글자로 넣습니다. 제목에 '<b>'가 있어도 HTML 태그로 해석하지 않습니다.
  link.textContent = movie.title;
  // 부모.appendChild(자식)는 자식 노드 한 개를 부모의 맨 뒤에 붙입니다.
  // 먼저 h3 안에 a를 넣고, 그 h3를 article 안에 넣습니다.
  // 결과는 <article class="movie-card"><h3><a ...>제목</a></h3></article> 구조입니다.
  // 이 줄의 부모는 heading(h3), 자식은 link(a)입니다. 영화 제목을 누를 수 있는 소제목으로 묶습니다.
  heading.appendChild(link);
  // 이 줄의 부모는 card(article), 자식은 링크가 들어 있는 heading(h3)입니다. 링크만 따로 두지 않습니다.
  card.appendChild(heading);

  // 개봉 날짜·장르·상영 시간은 한 문단(p)에 넣습니다. const 변수에 요소를 보관해 순서대로 설정합니다.
  const details = document.createElement('p');
  // ??는 왼쪽 값이 null 또는 undefined일 때만 오른쪽 값을 사용합니다.
  // join(', ')은 장르 배열을 쉼표와 공백으로 이어 붙입니다. 빈 배열이면 빈 문자열입니다.
  // 상영 시간은 null일 때 '미등록', 숫자가 있으면 '120분'처럼 표시합니다.
  // 백틱(`...`)은 템플릿 문자열이며 ${표현식} 자리에 계산 결과를 끼워 넣습니다.
  // 바깥 템플릿 문자열 안의 ${...}에서 또 다른 템플릿 문자열을 사용할 수 있습니다.
  details.textContent = `개봉: ${movie.release_date ?? '미등록'} / 장르: ${genres.join(', ')} / 상영 시간: ${movie.runtime_min === null ? '미등록' : `${movie.runtime_min}분`}`;
  // 이미 제목이 들어 있는 card의 맨 뒤에 정보 문단을 붙입니다. 제목은 유지됩니다.
  card.appendChild(details);

  // watched가 참일 때만 추가 안내 문단을 만듭니다. 거짓이면 이 세 줄은 실행하지 않습니다.
  // 최근 감상 기록에서는 watched:true로 호출하고, 일반 영화 목록에서는 기본값 false를 사용합니다.
  if (watched) {
    // 영화 제목·기본 정보와 별도로 '감상한 영화' 문구를 담을 문단을 새로 만듭니다.
    const watchedNote = document.createElement('p');
    // 새 문단 안에 실제로 보일 문자열을 넣습니다. watched 여부를 DB에 저장하는 코드는 아닙니다.
    watchedNote.textContent = '감상한 영화';
    // 부모 card의 마지막 자식으로 붙여 제목과 기본 정보 다음에 감상 여부가 나오게 합니다.
    card.appendChild(watchedNote);
  }
  // 완성한 요소를 호출한 곳에 반환합니다. 호출한 페이지가 이 요소를 본문에 붙여 실제로 보여줍니다.
  return card;
}

// 공통 메뉴의 [파일 이름에서 .html을 뺀 값, 화면에 표시할 이름] 쌍입니다.
// const는 navigation에 다른 배열을 재대입하지 않는다는 뜻이며 배열 자체가 읽기 전용인 것은 아닙니다.
// 메뉴가 있어도 해당 페이지의 기능이 완성되었다는 뜻은 아닙니다.
// 메인·캘린더・영화 검색·영화 상세 페이지를 제공하며, 통계·업적·사진 보관함·시리즈·지도는 별도 구현 대상입니다.
const navigation = [
  ['index', '메인'], ['movies', '영화 검색'], ['calendar', '캘린더'],
  ['stats', '통계'], ['achievements', '업적'], ['archive', '사진 보관함'],
  ['series', '시리즈'], ['map', '지도']
];

/*
 * mountShell(page): 공통 메뉴와 저장 위치 안내를 HTML의 빈 자리들에 넣습니다.
 * page는 'index', 'calendar'처럼 현재 페이지를 구분하는 값입니다.
 * export가 없으므로 다른 모듈에서 직접 가져올 수 없고, 아래 boot()가 내부에서 호출합니다.
 * 반환값은 없으며 기존 문서 요소의 자식들을 변경하는 함수입니다.
 */
function mountShell(page) {
  // ariaLabel은 이 내비게이션의 목적을 화면 읽기 프로그램에 알려주는 이름입니다.
  const nav = el('nav', { ariaLabel: '주 메뉴' });
  // ul은 메뉴 항목(li)들을 담을 목록입니다. 아직 nav 안에 들어 있지는 않습니다.
  const list = el('ul');
  // 배열 구조 분해로 현재 반복 항목의 파일 이름을 key, 메뉴 이름을 title로 받습니다.
  for (const [key, title] of navigation) {
    // &&가 ||보다 먼저 계산되므로 다음과 같은 뜻입니다.
    // (현재 메뉴 key와 page가 같음) 또는 (상세 페이지 movie이면서 영화 검색 메뉴임).
    // 상세 페이지에는 별도 메뉴가 없으므로 영화 검색 메뉴를 현재 위치로 표시합니다.
    const active = key === page || page === 'movie' && key === 'movies';
    // active가 참이면 이름 뒤에 ' (현재)'를 붙이고, 거짓이면 빈 문자열을 붙입니다.
    // 예: key='movies'이면 href='movies.html'입니다. title='영화 검색'은 링크에 보일 글자입니다.
    // 상세 페이지를 보고 있을 때도 active가 참이 되어 '영화 검색 (현재)'라고 표시합니다.
    const link = el('a', { href: `${key}.html` }, `${title}${active ? ' (현재)' : ''}`);
    // 현재 위치임을 보조 기술에도 전달합니다. 화면에 보이는 '(현재)'와 역할이 다릅니다.
    if (active) link.setAttribute('aria-current', 'page');
    // li 안에 링크를 넣고, 완성한 li를 부모 list(ul)에 추가합니다.
    // 각 반복에서 새로운 li/a가 만들어지므로 메뉴 항목들이 차례로 쌓입니다.
    list.append(el('li', {}, link));
  }
  // 부모 nav에 메뉴 목록 ul을 붙입니다. nav → ul → li → a 계층이 완성됩니다.
  nav.append(list);
  // replaceChildren은 대상 요소 자체는 유지하고 기존 자식들을 전달한 새 자식들로 교체합니다.
  document.querySelector('#sidebar').replaceChildren(nav);

  // 페이지 HTML의 <header id="topbar"> 요소를 찾습니다. 새 header를 생성하는 명령은 아닙니다.
  const topbar = document.querySelector('#topbar');
  // 안내를 담은 p 하나를 만들고 header의 기존 자식을 이것으로 교체합니다.
  // 부모 header 자체와 그 id는 유지됩니다. 다음 코드에서 알림 영역을 같은 header에 추가합니다.
  topbar.replaceChildren(el('p', {}, '저장 위치: 현재 브라우저'));
  // 감상 기록은 서버에 올리는 것이 아니라 이 사이트를 연 브라우저의 IndexedDB에 저장합니다.
  // 안내를 본문 위에서 볼 수 있게, HTML에 있던 메시지 요소를 topbar 쪽으로 이동합니다.
  const messages = document.querySelector('#messages');
  // querySelector는 요소가 없으면 null을 반환하므로, 존재할 때만 append합니다.
  // 이미 문서 안에 있는 요소를 append하면 복제하지 않고 원래 자리에서 새 자리로 옮깁니다.
  if (messages) topbar.append(messages);
}

/*
 * boot({ page, title, render }) — 각 페이지 실행의 공통 준비 과정
 * 객체 하나를 받아 구조 분해로 세 항목을 꺼냅니다.
 * page: 메뉴에서 현재 페이지를 표시할 때 쓰는 이름입니다.
 * title: 브라우저 탭 제목입니다. 본문 h1을 자동으로 만드는 값은 아닙니다.
 * render: 페이지별 화면을 만드는 함수입니다. index.js, calendar.js, movies.js, movie.js가 각자 전달합니다.
 *
 * async 함수는 항상 Promise를 반환합니다. Promise는 나중에 끝날 작업의 결과를 나타냅니다.
 * await는 Promise의 완료를 기다린 뒤 이 async 함수의 다음 줄을 이어서 실행합니다.
 * 기다리는 동안 브라우저 전체를 멈추는 것은 아니므로 클릭·화면 갱신 등 다른 일은 진행됩니다.
 * 이 함수가 받는 render도 비동기일 수 있으므로 await로 그 결과를 받습니다.
 *
 * render에 전달하는 것:
 * app: 본문 <main id="app">, catalog: 영화 기본 자료, repo: 저장소 접근 정보,
 * snapshot: 방금 읽은 사용자 기록, refresh: 기록을 다시 읽고 화면을 다시 그리는 함수.
 * render는 선택적으로 정리 함수(cleanup)를 반환할 수 있습니다.
 * 정리 함수는 사진의 임시 URL 등을 해제할 필요가 있을 때 사용하며 모든 페이지에 필수는 아닙니다.
 */
export async function boot({ page, title, render }) {
  // 전달받은 title 문자열을 브라우저 탭 제목에 대입합니다. 본문 제목 h1과는 별도입니다.
  document.title = title;
  // 공통 메뉴를 즉시 만듭니다. page가 'movie'이면 영화 검색 메뉴를 현재 메뉴로 표시합니다.
  mountShell(page);
  // HTML에서 본문을 채울 <main id="app">를 찾고 이후 render에도 같은 요소를 전달합니다.
  const app = document.querySelector('#app');
  // 로딩 안내 div를 본문에 먼저 추가합니다. className은 CSS 연결 이름, 마지막 인수는 표시할 글자입니다.
  // 데이터 준비가 끝나면 페이지별 render의 replaceChildren()이 이 안내를 실제 내용으로 바꿉니다.
  app.append(el('div', { className: 'empty-state' }, '데이터를 불러오는 중입니다.'));

  // 직전에 render가 돌려준 정리 함수를 기억합니다. 최초에는 undefined입니다.
  let cleanup;
  // 완료된 Promise에서 시작합니다. 앞으로 갱신 작업들을 이 뒤에 연결해 순서를 유지합니다.
  let queue = Promise.resolve();

  // try 안의 작업에서 예외가 나거나 await한 Promise가 실패하면 아래 catch로 이동합니다.
  try {
    // 두 함수를 호출하면 영화 읽기와 DB 열기가 각각 시작됩니다.
    // Promise.all은 둘 다 성공할 때 결과 배열을 돌려줍니다. 하나라도 실패하면 실패합니다.
    // 결과 순서는 완료 순서가 아니라 [loadCatalog(), openRepository()]에 적은 순서입니다.
    // [catalog, repo] 구조 분해로 두 결과를 각각 변수에 넣습니다.
    const [catalog, repo] = await Promise.all([loadCatalog(), openRepository()]);

    // refresh는 페이지 전체 새로고침이 아니라 '기록 읽기 + 본문 다시 그리기' 함수입니다.
    // 탭 복귀와 저장 버튼 등이 동시에 호출하더라도 queue 뒤에 차례대로 작업을 연결합니다.
    // 함수는 바깥의 queue, repo, catalog, cleanup 등을 계속 참조합니다(클로저).
    const refresh = () => {
      // 앞선 갱신의 실패를 catch로 받아 다음 갱신을 시작할 수 있게 합니다.
      // () => {}는 빈 함수입니다. 여기서 앞선 실패를 다시 던지지 않아 체인을 이어갑니다.
      // then은 앞의 Promise가 성공 상태로 끝나면 전달받은 함수를 실행합니다.
      queue = queue.catch(() => {}).then(async () => {
        // 오래된 snapshot을 재사용하지 않고 저장소에서 최신 기록을 다시 읽습니다.
        const snapshot = await readSnapshot(repo);

        // typeof 값 === 'function'으로 실제 함수인지 확인한 뒤에만 실행합니다.
        // 새 화면을 만들기 전에 직전 화면이 등록했던 자원 정리 작업을 수행합니다.
        // 이 코드에서는 cleanup을 동기적으로 호출합니다(반환 Promise를 await하지 않습니다).
        if (typeof cleanup === 'function') cleanup();
        // 이전 정리 함수를 더는 재사용하지 않도록 비웁니다. 다음 render의 새 반환값이 아래에서 들어옵니다.
        cleanup = undefined;

        // { app, catalog, ... }는 속성 이름과 변수 이름이 같을 때 쓰는 객체 축약 문법입니다.
        // 예: { app }는 { app: app }와 같습니다.
        // 페이지가 전달한 render 함수가 HTML을 만들고, 필요하면 새 정리 함수를 반환합니다.
        // 메인 페이지 render는 별도로 반환하지 않으므로 cleanup에는 undefined가 들어갑니다.
        cleanup = await render({ app, catalog, repo, snapshot, refresh });
      }).catch(error => {
        // 위 then 안의 읽기·정리·그리기 작업 중 오류가 나면 안내 메시지를 표시합니다.
        // ||는 왼쪽 값이 비어 있는 문자열 등 거짓으로 취급되는 값이면 오른쪽 값을 선택합니다.
        showMessage(error.message || '화면을 불러올 수 없습니다.', 'error');
        // throw는 같은 오류를 다시 전달합니다. 호출한 곳에서도 실패를 처리할 수 있습니다.
        throw error;
      });

      // 호출한 쪽에서 await refresh()로 이번 갱신이 끝나는 시점을 기다릴 수 있게 합니다.
      return queue;
    };

    // 최초 한 번 기록을 읽고 화면을 그립니다. 실패하면 바깥 catch가 오류 화면을 만듭니다.
    await refresh();

    // 탭 복귀처럼 사용자가 직접 저장 버튼을 누르지 않은 갱신에 쓰는 함수입니다.
    // refresh 안에서 이미 오류 메시지를 표시하므로 여기서는 재전달된 실패를 받아 종료합니다.
    // 함수 이름의 Quietly가 '오류를 화면에 전혀 표시하지 않는다'는 뜻은 아닙니다.
    const refreshQuietly = () => refresh().catch(() => {});

    // addEventListener(이벤트 이름, 함수)는 일이 발생했을 때 실행할 함수를 등록합니다.
    // 등록하는 지금 즉시 함수를 실행하는 것이 아닙니다.
    // visibilitychange: 사용자가 다른 탭으로 가거나 이 탭으로 돌아오는 등 표시 상태가 바뀔 때.
    // document.hidden이 false인 경우, 즉 이 문서가 다시 보일 때만 갱신합니다.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshQuietly(); });

    // 앞에 대상 객체를 쓰지 않은 addEventListener는 이 브라우저 문맥의 window에 등록합니다.
    // pageshow의 persisted는 뒤로 가기 등으로 브라우저의 페이지 캐시에서 복원되었는지 나타냅니다.
    // 캐시로 복원된 화면의 기록이 오래되었을 수 있으므로 다시 읽습니다.
    addEventListener('pageshow', event => { if (event.persisted) refreshQuietly(); });

    // pagehide는 페이지를 떠나 숨겨질 때 발생합니다. 현재 화면의 정리 함수가 있으면 호출합니다.
    // 이 세 이벤트 처리 함수는 boot가 끝난 뒤에도 등록된 채로 필요한 값을 참조합니다.
    addEventListener('pagehide', () => { if (typeof cleanup === 'function') cleanup(); });
  } catch (error) {
    // 초기 데이터 준비나 최초 화면 그리기가 실패했을 때, 로딩 표시 대신 오류 화면을 넣습니다.
    // 메뉴 생성 등 try 바깥에서 일어난 오류까지 이 catch가 처리하는 것은 아닙니다.
    // 나중의 버튼 이벤트 오류도 각 이벤트 함수에서 처리해야 합니다.
    app.replaceChildren(el('section', { className: 'empty-state' },
      // 아래 h1/p/button은 모두 바깥 section의 형제 자식들입니다. section 전체가 app의 새 내용이 됩니다.
      // h1: 오류 화면 제목. 빈 속성 객체 {}는 별도로 지정할 속성이 없다는 뜻입니다.
      el('h1', {}, '페이지를 불러올 수 없습니다'),
      // p: 실제 발생한 오류의 message 문자열을 일반 텍스트로 보여줍니다.
      el('p', {}, error.message),
      // p: 오류 원인과 구분되는 추가 안내입니다. muted는 공통 CSS에서 연결하는 클래스 이름입니다.
      el('p', { className: 'muted' }, '위 오류 내용을 확인한 뒤 다시 시도해 주세요.'),
      // onclick에는 함수를 넘깁니다. () => 없이 location.reload()를 쓰면 생성 즉시 실행됩니다.
      // location.reload()는 refresh()와 달리 브라우저의 현재 문서를 실제로 다시 불러옵니다.
      el('button', { className: 'button', onclick: () => location.reload() }, '다시 시도')
    ));
  }
}
