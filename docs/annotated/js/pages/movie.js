/*
 * movie.js — 영화 한 편의 정보와 감상 기록을 관리하는 상세 페이지임.
 * movie.html?id=m001의 id로 영화를 찾음. 기록은 현재 브라우저의 IndexedDB에 저장함.
 * 순서: 화면 상태 → 도우미 함수 → 영화 정보 → 입력 폼 → 기록 목록 → 저장된 사진 읽기.
 * 공통 준비는 boot(), 날짜·별점 검사와 실제 저장은 repository.js에 맡김.
 * el(태그, 속성, 글자)은 프로젝트 도우미이며 글자를 HTML로 해석하지 않고 요소를 만듦.
 * className은 CSS가 요소를 선택할 이름이며 그 이름 자체가 배치나 색상을 만드는 것은 아님.
 */

// ../는 현재 js/pages에서 한 단계 위임. 공통 실행·요소 생성·안내 함수를 가져옴.
import { boot, el, showMessage } from '../ui.js';
// 감상 기록 쓰기와 사진 원본 읽기 함수임. import 자체가 저장 작업을 호출하지는 않음.
import { mutateWatchLog, manageMedia } from '../repository.js';

// location.search의 '?id=m001'을 항목별로 읽을 수 있게 만드는 브라우저 기본 객체임.
const parameters = new URLSearchParams(location.search);
// id 값이 없으면 null을 반환함. 유효하지 않은 ID는 아래에서 안내 화면으로 처리함.
const movieId = parameters.get('id');
// null이면 새 기록 추가, 문자열이면 그 ID의 기존 기록을 수정하는 모드임.
let editingId = null;
// 수정 시작 때 읽은 버전임. 다른 탭에서 바뀐 기록을 모르고 덮어쓰지 않도록 함께 보냄.
let editingVersion = null;
// 작성 중인 날짜·별점·감상평임. render 밖에 두어 탭 복귀로 다시 그려도 입력을 유지함.
let draft = createEmptyDraft();
// 저장·삭제·편집 전환 중에는 true로 두어 버튼을 연속 눌러도 겹치는 작업을 시작하지 않음.
let busy = false;
// 폼 안내 문장도 화면 밖에 기억하므로 재그리기 후에 유지됨.
let statusText = '';
// 안내가 오류인지 구분함. 색상 자체가 아니라 error 클래스 추가 여부에 사용함.
let statusIsError = false;

// 날짜 입력의 기본값을 YYYY-MM-DD로 만듦. UTC 변환 대신 현지 날짜를 읽음.
function today() {
  // 현재 시각을 가진 Date 객체를 만듦.
  const date = new Date();
  // 월은 0~11이므로 1을 더함. String과 padStart로 3을 '03'처럼 바꿈.
  const month = String(date.getMonth() + 1).padStart(2, '0');
  // getDate는 날짜(일)임. 요일을 구하는 getDay와 다름.
  const day = String(date.getDate()).padStart(2, '0');
  // 템플릿 문자열의 ${...} 안에 실제 값을 넣어 완성한 날짜 문자열을 반환함.
  return `${date.getFullYear()}-${month}-${day}`;
}

// 새 입력을 시작할 기본값 객체를 만듦. 호출마다 새로운 객체를 반환함.
function createEmptyDraft() {
  // 세 속성 이름은 저장소 함수에 전달할 필드 이름과 같음.
  return {
    // 실제 감상 날짜의 초기값이며, 사용자가 다른 날짜로 바꿀 수 있음.
    watched_on: today(),
    // select의 value는 문자열임. ''는 별점 미입력이며 0점과 다름.
    rating: '',
    // textarea에 처음 표시할 글자는 비워 둠.
    review_text: ''
  };
}

// 쓰기 성공 또는 수정 취소 후 새 기록 모드로 돌아감. 저장된 기록을 지우는 함수는 아님.
function resetEditor() {
  // 기존 편집 대상을 해제하여 다음 제출을 create로 처리하게 함.
  editingId = null;
  // 새 기록에는 이전 기록의 충돌 검사 버전이 필요하지 않음.
  editingVersion = null;
  // 날짜를 오늘로, 별점과 감상평을 빈 값으로 초기화함.
  draft = createEmptyDraft();
  // 오류나 저장 중 안내를 비움. 함수 선언은 아래에 있어도 호출할 수 있음.
  setStatus('', false);
}

// 화면의 입력과 기록 버튼을 모두 같은 busy 상태로 맞춤.
function setBusy(value) {
  // 작업 상태를 모듈 변수에도 저장하여 새로 만들어지는 요소에 동일하게 적용함.
  busy = value;
  // 쉼표로 연결한 CSS 선택자는 각각의 입력 요소와 기록 버튼들을 한 번에 찾음.
  const controls = document.querySelectorAll('#watch-form input, #watch-form select, #watch-form textarea, #watch-form button, .record-panel button');
  // 제거된 이전 요소가 아니라 현재 문서에 있는 요소를 차례로 처리함.
  for (const control of controls) {
    // true이면 입력·클릭이 막히고 false이면 다시 사용할 수 있음.
    control.disabled = value;
  }
}

// 입력 폼 아래에 진행 또는 오류 문장을 표시함.
function setStatus(text, isError) {
  // 다음 재그리기에 사용할 문구를 기억함.
  statusText = text;
  // 오류 여부도 함께 기억함.
  statusIsError = isError;
  // 현재 화면에서 안내 요소를 찾음. 화면을 아직 만들지 않았으면 null임.
  const status = document.getElementById('watch-status');
  // 요소가 없을 때는 상태 변수만 저장하고 종료함.
  if (status === null) return;
  // 문자열을 HTML로 해석하지 않고 그대로 글자로 넣음.
  status.textContent = text;
  // 기존 오류 클래스가 남지 않게 공통 클래스부터 다시 지정함.
  status.className = 'status';
  // 오류일 때만 클래스를 하나 추가함.
  if (isError) status.classList.add('error');
}

// 저장소가 전달한 오류 객체에서 사용자에게 보일 문장을 얻음.
function errorText(error) {
  // 객체가 존재하고 message가 문자열인 경우 그 설명을 사용함.
  if (error && typeof error.message === 'string') return error.message;
  // 설명이 없는 예외에도 빈 안내가 나오지 않게 기본 문장을 사용함.
  return '작업을 완료하지 못했습니다. 다시 시도해 주세요.';
}

// 재그리기 후의 새 날짜 입력칸에 키보드 초점을 줌.
function focusDate() {
  // 예전 DOM 객체를 재사용하지 않고 현재 문서의 같은 id를 다시 찾음.
  const date = document.getElementById('watched-on');
  // 없는 영화 화면에는 입력칸이 없으므로 존재할 때만 실행함.
  if (date !== null) date.focus();
}

// 별점 표시를 통일함. 입력 숫자 자체를 수정하지 않음.
function ratingLabel(value) {
  // null은 미입력이므로 숫자의 toFixed 메서드를 호출하면 안 됨.
  if (value === null) return '별점 미입력';
  // toFixed(1)은 4를 '4.0'처럼 소수점 한 자리 문자열로 바꿈.
  return '★ ' + value.toFixed(1);
}

// 이 영화의 감독 또는 배우 이름을 찾음. role에는 'director' 또는 'actor'가 들어감.
function creditNames(catalog, role) {
  // 결과 이름들을 담을 배열임. const여도 push로 배열 안에 항목을 넣을 수 있음.
  const names = [];
  // 영화·인물 연결 행을 순서대로 읽음.
  for (const credit of catalog.MovieCredit) {
    // 영화와 역할이 모두 일치할 때만 선택함. &&는 두 조건 모두 참이어야 함.
    if (credit.movie_id === movieId && credit.role === role) {
      // personById는 ID로 인물 객체를 찾는 Map임. 카탈로그가 연결을 미리 검사함.
      const person = catalog.lookup.personById.get(credit.person_id);
      // 인물 이름을 결과 배열 끝에 추가함.
      names.push(person.name);
    }
  }
  // 해당 역할의 인물이 등록되지 않았으면 안내를 반환함.
  if (names.length === 0) return '정보 없음';
  // 여러 이름을 쉼표와 공백으로 이어 붙여 표시용 문자열로 만듦.
  return names.join(', ');
}

// boot가 자료 준비 후 호출하는 화면 함수임. 사진 원본 읽기를 await하므로 async임.
async function renderMovie(context) {
  // HTML의 <main id="app"> 요소임. 조립한 본문을 여기에 넣음.
  const app = context.app;
  // 영화 기본 자료와 장르·국가·인물 조회용 Map임.
  const catalog = context.catalog;
  // 저장소 함수에 전달할 열린 DB와 프로필 정보임.
  const repo = context.repo;
  // 이번에 읽은 사용자 기록·사진 정보임.
  const snapshot = context.snapshot;
  // 자료를 다시 읽고 이 화면 함수를 다시 실행할 함수임. 여기서는 호출하지 않고 받아 둠.
  const refresh = context.refresh;
  // 주소의 ID에 해당하는 영화 객체를 찾음. 없으면 undefined임.
  const movie = catalog.lookup.movieById.get(movieId);

  // 잘못된 ID에는 영화 속성을 읽거나 저장 폼을 만들지 않음.
  if (movie === undefined) {
    // 오류 안내 전체를 묶을 section임.
    const empty = el('section', { className: 'empty-state' });
    // 이 화면의 제목이며 h1 태그로 만듦.
    const title = el('h1', {}, '영화를 찾을 수 없습니다');
    // 다음에 무엇을 해야 하는지 안내함.
    const help = el('p', {}, '주소의 영화 ID를 확인하거나 영화 목록에서 다시 선택해 주세요.');
    // a 태그는 이동 링크임. button 클래스는 버튼 같은 모양만 지정함.
    const back = el('a', { href: 'movies.html', className: 'button' }, '영화 목록으로');
    // 제목·안내·링크를 부모 요소 뒤에 순서대로 붙임.
    empty.append(title, help, back);
    // 로딩 표시를 안내 화면으로 교체하며 main 자체는 유지함.
    app.replaceChildren(empty);
    // 아래의 정상 상세 화면 처리를 실행하지 않고 종료함.
    return;
  }

  // 현재 영화의 장르 이름만 모을 배열임.
  const genreNames = [];
  // 영화·장르 연결 목록을 하나씩 확인함.
  for (const row of catalog.MovieGenre) {
    // 현재 영화의 연결이면 장르 ID로 이름을 찾아 배열에 추가함.
    if (row.movie_id === movieId) genreNames.push(catalog.lookup.genreById.get(row.genre_id).name);
  }
  // 공동 제작 영화는 국가가 여러 개일 수 있어 배열에 모음.
  const countryNames = [];
  // 영화·국가 연결을 순서대로 확인함.
  for (const row of catalog.MovieCountry) {
    // 국가 코드로 국가 객체를 찾아 표시할 이름만 꺼냄.
    if (row.movie_id === movieId) countryNames.push(catalog.lookup.countryByCode.get(row.country_code).name);
  }
  // 포스터와 영화 설명을 묶는 영역임.
  const details = el('section', { className: 'movie-detail' });
  // 포스터 경로가 있는 영화에서만 이미지 요소를 만듦.
  if (movie.poster_url) {
    // img는 src의 파일을 보여 주며 글자 자식을 넣는 태그가 아님.
    const poster = el('img', {
      // CSS에서 포스터 크기와 비율을 정할 이름임.
      className: 'detail-poster',
      // 상대 경로는 현재 movie.html을 기준으로 해석됨.
      src: movie.poster_url,
      // 이미지 대신 읽을 설명임. 실패 시와 화면 읽기 프로그램에서 참고함.
      alt: movie.title + ' 포스터'
    });
    // 설명보다 먼저 포스터를 넣음.
    details.append(poster);
  }
  // 제목·장르·소개 등을 담을 안쪽 컨테이너임.
  const info = el('div', { className: 'detail-copy' });
  // 현재 스키마에서 없어진 원제 속성은 사용하지 않고 title만 표시함.
  const title = el('h1', {}, movie.title);
  // 장르 표시들을 CSS로 배치할 묶음임.
  const tags = el('div', { className: 'tag-row' });
  // 영화의 장르마다 하나의 표시 요소를 만듦.
  for (const name of genreNames) {
    // span은 일반 인라인 요소이며 tag 클래스가 모양을 정할 선택자임.
    const tag = el('span', { className: 'tag' }, name);
    // 만든 요소를 장르 묶음에 붙임.
    tags.append(tag);
  }
  // 개봉 날짜가 없는 경우의 안내를 기본으로 둠.
  let releaseText = '개봉일 미등록';
  // 날짜가 있는 경우에만 실제 문자열로 바꿈.
  if (movie.release_date !== null) releaseText = movie.release_date;
  // 상영 시간도 비어 있을 수 있으므로 기본 안내를 준비함.
  let runtimeText = '상영 시간 미등록';
  // 등록된 시간에는 분 단위를 붙여 표시함.
  if (movie.runtime_min !== null) runtimeText = movie.runtime_min + '분';
  // 국가 연결이 없는 영화의 안내임.
  let countryText = '제작 국가 정보 없음';
  // 국가가 하나 이상이면 모든 이름을 쉼표로 연결함.
  if (countryNames.length > 0) countryText = countryNames.join(', ');
  // 템플릿 문자열로 날짜·시간·국가를 한 문단에 표시함.
  const metadata = el('p', {}, `${releaseText} · ${runtimeText} · ${countryText}`);
  // 빈 줄거리에는 안내 문장을 사용함.
  let overviewText = '줄거리 정보가 없습니다.';
  // 글자가 있는 경우 실제 소개로 바꿈.
  if (movie.overview) overviewText = movie.overview;
  // overview 클래스는 문단 간격과 줄바꿈을 지정할 대상임.
  const overview = el('p', { className: 'overview' }, overviewText);
  // 감독 역할로 연결된 인물을 찾아 표시함.
  const directors = el('p', {}, '감독: ' + creditNames(catalog, 'director'));
  // 배우 역할로 연결된 인물을 찾아 표시함. 감독과 같은 인물일 수도 있음.
  const actors = el('p', {}, '출연: ' + creditNames(catalog, 'actor'));
  // 만들어진 자식들을 표시할 순서대로 한 부모 안에 넣음.
  info.append(title, tags, metadata, overview, directors, actors);
  // 포스터 다음에 설명을 붙여 영화 정보 영역을 완성함.
  details.append(info);

  // 새 기록일 때 사용할 폼 제목임.
  let formTitleText = '감상 기록 추가';
  // 새 기록일 때 사용할 저장 버튼 문구임.
  let submitText = '감상 기록 저장';
  // 편집 대상이 있으면 제목과 버튼 문구를 수정 모드로 바꿈.
  if (editingId !== null) {
    // 기존 기록을 수정 중임을 제목으로 알림.
    formTitleText = '감상 기록 수정';
    // 버튼에도 실제 작업을 표시함.
    submitText = '수정 내용 저장';
  }
  // 폼 전체 영역임. class는 CSS, id는 특정 요소 검색과 이동에 사용함.
  const formPanel = el('section', { className: 'record-form-panel', id: 'record-form-panel' });
  // 폼 제목에 고유 id를 주어 저장 후 초기 상태를 화면에도 바로 반영할 수 있게 함.
  const formTitle = el('h2', { id: 'watch-form-title' }, formTitleText);
  // submit 이벤트로 날짜·별점·감상평을 한꺼번에 처리할 form임.
  const form = el('form', { id: 'watch-form' });
  // 날짜 입력 요소를 만들고 각 속성을 설정함.
  const date = el('input', {
    // label의 htmlFor와 연결할 고유 이름임.
    id: 'watched-on',
    // 저장소의 필드 이름과 맞춤. 제출은 아래 JS에서 직접 처리함.
    name: 'watched_on',
    // 브라우저 기본 날짜 입력을 사용함.
    type: 'date',
    // 날짜는 필수이며 저장소에서도 유효한 실제 날짜인지 다시 검사함.
    required: true,
    // 재그리기 때 작성 중인 초안의 날짜를 되살림.
    value: draft.watched_on,
    // 저장 중 새 화면이 생겨도 잠긴 상태로 생성함.
    disabled: busy
  });
  // 별점 입력은 정해진 선택지를 사용하는 select임.
  const rating = el('select', {
    // 별점 label이 가리킬 id임.
    id: 'rating',
    // 저장소가 받는 별점 항목 이름임.
    name: 'rating',
    // 작업 중에는 선택을 바꿀 수 없음.
    disabled: busy
  });
  // 빈 문자열은 별점 미입력이며 저장소가 null로 정리함.
  const noRating = el('option', { value: '' }, '별점 남기지 않음');
  // 미입력 항목을 선택지 맨 앞에 넣음.
  rating.append(noRating);
  // 정수 1~10을 2로 나눠 정확한 0.5 단위 별점 열 가지를 만듦.
  for (let n = 1; n <= 10; n++) {
    // option의 value는 문자열이고 표시 문구는 소수점 한 자리임.
    const option = el('option', { value: String(n / 2) }, ratingLabel(n / 2));
    // 만든 항목을 select 뒤에 붙임.
    rating.append(option);
  }
  // 선택지를 모두 만든 다음 초안 값과 일치하는 항목을 선택함.
  rating.value = draft.rating;
  // 여러 줄의 감상평을 입력할 textarea임.
  const review = el('textarea', {
    // 감상평 label과 연결할 이름임.
    id: 'review-text',
    // 저장소의 감상평 필드 이름임.
    name: 'review_text',
    // 보이는 초기 높이를 약 다섯 줄로 정함. 입력 글자 수 제한은 아님.
    rows: 5,
    // 비었을 때 보이는 안내이며 실제 입력값에 포함되지 않음.
    placeholder: '감상평을 입력하세요.',
    // 화면이 갱신되어도 작성 중인 글을 유지함.
    value: draft.review_text,
    // 저장·삭제 중에는 입력을 바꿀 수 없음.
    disabled: busy
  });
  // 날짜 변경은 DB 저장이 아니라 메모리의 초안만 갱신함.
  function rememberDate() {
    // 날짜가 선택되면 YYYY-MM-DD 문자열이며, 비우면 빈 문자열임.
    draft.watched_on = date.value;
  }
  // 별점 선택을 초안에 기록함.
  function rememberRating() {
    // select.value는 문자열이며 숫자 변환은 저장소의 검증 단계가 처리함.
    draft.rating = rating.value;
  }
  // 글자가 바뀔 때마다 현재 감상평을 초안에 기억함.
  function rememberReview() {
    // 줄바꿈과 공백도 입력 상태 그대로 유지함.
    draft.review_text = review.value;
  }
  // 함수를 즉시 호출하지 않고 이벤트에 등록함.
  date.addEventListener('input', rememberDate);
  // 별점 선택이 바뀌면 실행할 함수임.
  rating.addEventListener('change', rememberRating);
  // 글자 입력마다 실행하여 탭 이동 전의 초안을 남김.
  review.addEventListener('input', rememberReview);
  // 날짜와 별점을 배치할 묶음이며 열 개수는 CSS가 정함.
  const fields = el('div', { className: 'form-grid' });
  // 날짜 설명과 입력을 한 영역에 넣음.
  const dateField = el('div', { className: 'field' });
  // htmlFor는 HTML의 for 속성임. 연결된 input의 id를 지정함.
  const dateLabel = el('label', { htmlFor: 'watched-on' }, '감상 날짜 · 필수');
  // label 다음에 실제 입력칸을 붙임.
  dateField.append(dateLabel, date);
  // 별점의 label과 select도 같은 영역에 묶음.
  const ratingField = el('div', { className: 'field' });
  // 별점은 선택 입력이라는 안내이며 해당 select와 연결됨.
  const ratingLabelElement = el('label', { htmlFor: 'rating' }, '별점 · 선택');
  // 설명과 입력의 순서를 정함.
  ratingField.append(ratingLabelElement, rating);
  // 날짜 영역 다음에 별점 영역을 배치함.
  fields.append(dateField, ratingField);
  // 감상평은 별도의 여러 줄 입력 영역으로 만듦.
  const reviewField = el('div', { className: 'field' });
  // id가 review-text인 textarea와 연결한 설명임.
  const reviewLabel = el('label', { htmlFor: 'review-text' }, '감상평 · 선택');
  // label 다음에 textarea를 붙임.
  reviewField.append(reviewLabel, review);
  // 같은 영화를 같은 날 다시 저장해도 별도 기록으로 남는 현재 규칙을 설명함.
  const formHelp = el('p', {}, '같은 영화를 같은 날 여러 번 감상한 기록도 각각 저장할 수 있습니다.');
  // 진행/오류 안내임. ariaLive는 문구 변경을 보조 기술이 알릴 수 있게 함.
  const status = el('p', { id: 'watch-status', className: 'status', ariaLive: 'polite' }, statusText);
  // 재그리기 전 오류 상태도 복원함.
  if (statusIsError) status.classList.add('error');
  // submit 버튼을 클릭하면 아래 submit 이벤트가 발생함. 브라우저가 입력칸의 Enter를 폼 제출로 처리할 때도 같음.
  // 여러 줄 입력인 textarea에서 Enter를 누르는 것은 일반적으로 감상평의 줄바꿈임.
  const submit = el('button', { id: 'watch-submit', type: 'submit', className: 'button', disabled: busy }, submitText);
  // 저장/취소 버튼을 나란히 놓을 컨테이너임.
  const buttons = el('div', { className: 'toolbar' });
  // 항상 존재하는 저장 버튼부터 붙임.
  buttons.append(submit);


  // 공통 refresh는 실패 안내를 표시한 뒤 오류를 다시 전달하므로, 클릭 이벤트 쪽에서 받아야 함.
  // 이 보조 함수는 갱신 성공 여부만 반환하며 동일한 오류 알림을 두 번 표시하지 않음.
  async function refreshPage() {
    // await 중 실패하면 catch로 이동함. UI 전체를 멈추는 명령은 아님.
    try {
      // 저장소를 다시 읽고 renderMovie를 다시 실행할 때까지 기다림.
      await refresh();
      // 다시 그리기가 완료되었다는 결과임.
      return true;
    } catch (error) {
      // ui.js가 이미 오류 문구를 표시했으므로 처리되지 않은 이벤트 오류만 막음.
      return false;
    }
  }

  // 저장 성공 뒤 재조회가 실패하더라도 이전 입력을 다시 저장하지 않도록 보이는 폼도 즉시 비움.
  function clearVisibleForm() {
    // 다른 갱신이 먼저 실행되었을 수 있으므로 현재 문서의 입력칸을 다시 찾음.
    const currentDate = document.getElementById('watched-on');
    // 폼이 없는 화면으로 바뀌었다면 아무것도 바꾸지 않고 끝냄.
    if (currentDate === null) return;
    // resetEditor가 만든 오늘 날짜를 현재 날짜 입력칸에 반영함.
    currentDate.value = draft.watched_on;
    // 현재 별점 select를 미입력 항목으로 되돌림.
    document.getElementById('rating').value = draft.rating;
    // 현재 감상평 textarea의 글자를 비움.
    document.getElementById('review-text').value = draft.review_text;
    // 편집 모드를 해제했다는 사실을 제목에도 즉시 반영함.
    document.getElementById('watch-form-title').textContent = '감상 기록 추가';
    // 제출 문구도 새 기록 저장으로 돌려놓음.
    document.getElementById('watch-submit').textContent = '감상 기록 저장';
    // 이전 화면에 수정 취소 버튼이 있을 때만 제거함.
    const cancel = document.getElementById('watch-cancel');
    // remove는 요소를 화면에서 떼며 저장소 기록에는 영향을 주지 않음.
    if (cancel !== null) cancel.remove();
  }

  // 수정 취소는 작성 중인 변경만 버리고 원래 저장된 기록은 그대로 둠.
  async function cancelEditing() {
    // 쓰기나 다른 편집 전환이 진행 중이면 이번 클릭을 무시함.
    if (busy) return;
    // 버튼과 입력을 잠가 전환이 끝날 때까지 다른 작업이 끼어들지 않게 함.
    setBusy(true);
    // finally에서 반드시 잠금을 풀기 위해 화면 전환을 try로 묶음.
    try {
      // 수정 대상과 초안을 초기화함. 저장 함수는 호출하지 않음.
      resetEditor();
      // 재조회 전에 현재 폼도 새 기록 모드로 맞춤.
      clearVisibleForm();
      // 기록을 다시 읽어 편집 취소 상태의 화면을 만듦. 오류는 이 함수 안에서 처리됨.
      await refreshPage();
    } finally {
      // 새로 만들어진 폼까지 찾아서 입력 가능 상태로 돌림.
      setBusy(false);
    }
    // disabled가 풀린 뒤에야 날짜 입력칸으로 초점을 옮길 수 있음.
    focusDate();
  }

  // 기존 기록을 수정할 때만 취소 버튼이 필요함.
  if (editingId !== null) {
    // 일반 button이므로 폼을 제출하지 않음. id는 초기화 때 제거할 대상을 찾는 데 씀.
    const cancel = el('button', { id: 'watch-cancel', type: 'button', className: 'button secondary', disabled: busy }, '수정 취소');
    // 함수 자체를 등록하므로 지금 즉시 취소가 실행되는 것은 아님.
    cancel.addEventListener('click', cancelEditing);
    // 저장 버튼 다음에 취소 버튼을 넣음.
    buttons.append(cancel);
  }
  // 입력 묶음·설명·버튼·상태 안내를 폼 안에 순서대로 붙임.
  form.append(fields, reviewField, formHelp, buttons, status);
  // 제목과 폼을 폼 영역 안에 넣음.
  formPanel.append(formTitle, form);

  // 폼 제출 한 번을 추가 또는 수정 작업 한 번으로 처리함.
  async function saveRecord(event) {
    // 브라우저의 기본 페이지 제출을 막고 아래 저장 함수를 사용함.
    event.preventDefault();
    // 더블 클릭이나 Enter 연타로 이미 진행 중인 쓰기를 다시 시작하지 않음.
    if (busy) return;
    // 프로그램이 value를 바꿔 input 이벤트가 없었더라도 제출 직전 실제 입력을 초안에 반영함.
    rememberDate();
    // 별점도 제출 시점의 선택값으로 맞춤.
    rememberRating();
    // 감상평도 제출 시점의 글자를 초안에 기억함.
    rememberReview();
    // 저장하는 동안 입력값 변경과 다른 기록 수정·삭제를 막음.
    setBusy(true);
    // 입력칸 가까이에 현재 처리 상태를 표시함.
    setStatus('기록을 저장하는 중입니다.', false);
    // 기본 작업은 새 감상 기록 추가임.
    let action = 'create';
    // 편집 ID가 있으면 기존 기록 수정으로 바꿈.
    if (editingId !== null) action = 'update';
    // 저장소가 검사할 입력값만 담은 객체를 만듦.
    const payload = {
      // 현재 상세 페이지의 영화 ID임. 폼으로 영화를 바꾸지는 않음.
      movie_id: movieId,
      // 실제 감상 날짜이며 등록 시각과 다름.
      watched_on: draft.watched_on,
      // 미입력 또는 숫자 문자열임. 저장소가 유효한 0.5 단위 값인지 검사함.
      rating: draft.rating,
      // 저장소가 문자열 여부를 검사하고 앞뒤 공백을 정리함.
      review_text: draft.review_text
    };
    // 수정할 때에만 기존 기록 ID와 읽었던 버전을 추가함.
    if (editingId !== null) {
      // 바꿀 감상 기록 한 건의 기본 키임.
      payload.log_id = editingId;
      // 다른 탭에서 이미 바뀌었으면 저장소가 수정 요청을 거부하게 하는 비교 값임.
      payload.expected_version = editingVersion;
    }
    // 성공한 경우에만 아래에서 입력 초점을 옮기기 위한 표시임.
    let saved = false;
    // 검증 오류·저장 오류를 사용자에게 알리고 입력은 보존함.
    try {
      // IndexedDB 트랜잭션이 실제 완료될 때까지 기다림. 실패하면 다음 줄로 넘어가지 않음.
      await mutateWatchLog(repo, catalog, action, payload);
      // 저장 성공 후에만 초안을 비움. 실패 시에는 원래 입력과 편집 버전이 남음.
      resetEditor();
      // 다음 자료 읽기가 실패해도 이미 저장한 글을 폼에 그대로 남기지 않음.
      clearVisibleForm();
      // 실제 작업에 맞는 완료 안내를 선택함.
      let message = '감상 기록을 저장했습니다.';
      // 수정 성공이면 새 기록이 생긴 것이 아니라는 점을 명확히 함.
      if (action === 'update') message = '감상 기록을 수정했습니다.';
      // 공통 메시지 영역에 완료 문장을 표시함.
      showMessage(message);
      // 저장 자체는 이미 완료되었음을 기억함.
      saved = true;
      // 최신 기록 수와 목록을 다시 표시함. 이 실패는 저장 실패와 구분되어 공통 UI가 안내함.
      await refreshPage();
    } catch (error) {
      // 오류 객체에서 안내 문장을 얻음.
      const message = errorText(error);
      // 초안을 유지한 채 폼 바로 아래에도 오류를 표시함.
      setStatus(message, true);
      // 공통 상단 안내에도 동일한 저장 실패를 표시함.
      showMessage(message, 'error');
    } finally {
      // 성공·실패 어느 경우든 현재 화면의 입력과 버튼을 다시 사용할 수 있게 함.
      setBusy(false);
    }
    // 오류가 난 경우 사용자가 보고 있던 입력 위치를 불필요하게 옮기지 않음.
    if (saved) focusDate();
  }
  // form 제출 이벤트를 등록함. 버튼 클릭이나 입력칸에서 실제 폼 제출이 발생하면 이 저장 함수를 실행함.
  form.addEventListener('submit', saveRecord);

  // readSnapshot이 이미 감상일·등록 시각 순으로 정렬했으므로 여기서는 해당 영화만 고름.
  const logs = [];
  // 원래 배열의 순서대로 순회하면 골라낸 결과도 최신순을 유지함.
  for (const row of snapshot.logs) {
    // 같은 영화 ID를 가진 기록만 새 배열에 넣음. 원본 배열은 수정하지 않음.
    if (row.movie_id === movieId) logs.push(row);
  }
  // 저장된 기록들을 표시할 패널임. 이 클래스의 버튼들도 setBusy가 함께 잠금.
  const recordPanel = el('section', { className: 'record-panel' });
  // 기록 개수를 제목에 넣음. 같은 영화 재감상도 각각 1건으로 셈.
  const recordTitle = el('h2', {}, `나의 감상 기록 ${logs.length}건`);
  // 목록 앞에 제목을 붙임.
  recordPanel.append(recordTitle);
  // 기록이 없으면 목록 카드 대신 안내 문단만 표시함.
  if (logs.length === 0) {
    // 처음 기록을 입력할 수 있음을 알림.
    const empty = el('p', { className: 'empty-state compact' }, '아직 이 영화의 감상 기록이 없습니다.');
    // 안내를 기록 패널에 추가함.
    recordPanel.append(empty);
  }
  // 각 기록마다 독립된 표시 카드와 수정·삭제 버튼을 만듦.
  for (const row of logs) {
    // article은 감상 기록 한 건을 묶는 의미상의 영역임.
    const card = el('article', { className: 'log-card' });
    // 날짜와 별점을 같은 줄에 배치할 묶음임.
    const recordHeading = el('div', { className: 'record-heading' });
    // 실제 영화를 본 날짜를 강조함.
    const watchedOn = el('strong', {}, row.watched_on);
    // null을 포함한 별점을 공통 표시 함수로 처리함.
    const savedRating = el('span', { className: 'rating' }, ratingLabel(row.rating));
    // 날짜 다음에 별점을 넣음.
    recordHeading.append(watchedOn, savedRating);
    // 비어 있는 감상평에 사용할 안내임.
    let reviewText = '남긴 감상평이 없습니다.';
    // 저장된 글이 있으면 실제 감상평으로 바꿈.
    if (row.review_text) reviewText = row.review_text;
    // review-text 클래스는 줄바꿈을 보존할 CSS와 연결됨.
    const savedReview = el('p', { className: 'review-text' }, reviewText);
    // 저장된 수정 시각을 브라우저 현지 시간의 한국어 형식으로 표시함.
    const updated = el('p', {}, '최근 저장: ' + new Date(row.updated_at).toLocaleString('ko-KR'));
    // 기록 작업용 버튼들을 묶음.
    const actions = el('div', { className: 'toolbar' });
    // 수정 버튼은 폼을 제출하지 않는 일반 버튼임.
    const edit = el('button', { type: 'button', className: 'button secondary', disabled: busy }, '수정');
    // 삭제 버튼도 일반 버튼이며 실제 삭제 여부는 확인창 이후 결정함.
    const remove = el('button', { type: 'button', className: 'button danger', disabled: busy }, '삭제');

    // 이 반복의 row를 기억하는 함수임. 각 버튼은 자기 기록을 편집함(클로저).
    async function editRecord() {
      // 다른 쓰기나 전환 중에는 편집 대상을 바꾸지 않음.
      if (busy) return;
      // 새 편집 화면을 못 만들면 지금 보이는 폼과 같은 상태로 돌아가야 하므로 이전 값을 기억함.
      const previousId = editingId;
      // 이전에 다른 기록을 수정하고 있었다면 그 기록의 비교 버전도 함께 보관함.
      const previousVersion = editingVersion;
      // 아래에서 draft를 새 객체로 교체하므로 기존 객체는 이 변수에 그대로 남음.
      const previousDraft = draft;
      // 이전 폼의 안내 문장과 오류 여부도 원래대로 되돌릴 수 있게 보관함.
      const previousStatus = statusText;
      // true/false 값을 별도로 기억함. 나중의 setStatus 호출은 모듈 상태와 화면을 함께 바꿈.
      const previousStatusIsError = statusIsError;
      // 화면이 새로 만들어지는 동안 다른 기록 버튼을 잠금.
      setBusy(true);
      // 이 기록 ID를 기억하여 다음 폼 제출을 update로 처리하게 함.
      editingId = row.log_id;
      // 입력 도중 다른 탭에서 기록이 바뀌어도 이 버전은 자동으로 최신 버전으로 덮어쓰지 않음.
      editingVersion = row.version;
      // 별점 미입력은 select의 빈 값으로 옮김.
      let ratingValue = '';
      // 숫자 별점은 select.value에 맞춰 문자열로 바꿈.
      if (row.rating !== null) ratingValue = String(row.rating);
      // null 감상평은 textarea의 빈 글자로 바꿈.
      let reviewValue = '';
      // 실제 글이 있는 경우 그 내용으로 초기화함.
      if (row.review_text) reviewValue = row.review_text;
      // 편집할 기록을 초안에 복사함. 원본 row 자체는 바꾸지 않음.
      draft = { watched_on: row.watched_on, rating: ratingValue, review_text: reviewValue };
      // 이전 작업의 오류나 진행 안내를 비움.
      setStatus('', false);
      // 화면 갱신 중에도 마지막에 잠금이 해제되도록 묶음.
      try {
        // 수정 제목·초안·취소 버튼을 가진 새 화면을 만듦.
        const refreshed = await refreshPage();
        // 자료 읽기가 실패하면 이전 폼이 남으므로 내부 상태도 이전 값으로 되돌림.
        if (!refreshed) {
          // 다음 저장이 화면에 보이는 추가/수정 모드와 동일하게 처리되도록 복원함.
          editingId = previousId;
          // 이전 폼의 기록 버전으로 되돌려 다른 기록의 버전이 섞이지 않게 함.
          editingVersion = previousVersion;
          // 사용자가 편집 전 작성하던 초안을 보존함. 저장소의 기록을 되돌리는 작업은 아님.
          draft = previousDraft;
          // 폼의 기존 안내를 복원함. 갱신 실패 설명은 공통 상단 메시지에 표시되어 있음.
          setStatus(previousStatus, previousStatusIsError);
          // 실패 시 초점 이동까지 진행하지 않음. return해도 아래 finally는 실행됨.
          return;
        }
      } finally {
        // 새 폼을 편집할 수 있도록 잠금을 해제함.
        setBusy(false);
      }
      // 화면 전환이 끝난 뒤 첫 입력칸에 초점을 줌.
      focusDate();
    }

    // 삭제 버튼에 연결할 비동기 함수임. 다른 영화나 사진은 삭제하지 않음.
    async function deleteRecord() {
      // 이미 진행 중인 작업이 있으면 중복 삭제를 시작하지 않음.
      if (busy) return;
      // confirm은 확인/취소 선택을 받아 true 또는 false를 반환하는 브라우저 대화상자임.
      const accepted = confirm(`${row.watched_on} 감상 기록을 삭제할까요?`);
      // 취소를 누르면 저장소 함수를 호출하지 않음.
      if (!accepted) return;
      // 삭제하는 동안 추가 저장과 다른 수정·삭제도 함께 잠금.
      setBusy(true);
      // 실제 삭제 오류를 잡고 잠금을 반드시 해제하도록 구성함.
      try {
        // ID와 표시할 때 읽었던 버전을 전달함. 남이 수정한 오래된 기록은 바로 삭제하지 않음.
        await mutateWatchLog(repo, catalog, 'delete', { log_id: row.log_id, expected_version: row.version });
        // 현재 편집하던 기록 자체를 지운 경우에만 초안도 새 기록 모드로 돌아감.
        if (editingId === row.log_id) {
          // 존재하지 않게 된 기록을 계속 수정하지 않도록 편집 대상을 지움.
          resetEditor();
          // 재조회가 실패해도 폼이 삭제된 기록의 수정 상태로 남지 않게 함.
          clearVisibleForm();
        }
        // 감상 기록과 사진은 별개로 연결되어 있어 사진이 유지됨을 알려 줌.
        showMessage('감상 기록을 삭제했습니다. 사진은 유지됩니다.');
        // 감소한 기록 수와 목록을 다시 읽어 보여줌.
        await refreshPage();
      } catch (error) {
        // 버전 충돌·이미 삭제된 기록·저장 실패 등을 안내함. 작성 중인 다른 초안은 유지됨.
        showMessage(errorText(error), 'error');
      } finally {
        // 성공·실패와 관계없이 현재 화면의 버튼을 다시 사용할 수 있게 함.
        setBusy(false);
      }
    }
    // 함수 이름 뒤에 괄호를 붙이지 않고 이벤트 처리 함수로 전달함.
    edit.addEventListener('click', editRecord);
    // 삭제 클릭도 각각의 row를 기억하는 함수에 연결됨.
    remove.addEventListener('click', deleteRecord);
    // 수정 버튼 다음에 삭제 버튼을 넣음.
    actions.append(edit, remove);
    // 기록 카드에 날짜·별점, 감상평, 수정 시각, 버튼을 순서대로 넣음.
    card.append(recordHeading, savedReview, updated, actions);
    // 완성한 기록 한 건을 목록의 뒤에 붙임.
    recordPanel.append(card);
  }

  // 사진 영역은 읽기만 하며 업로드·삭제는 사진 보관함 담당 페이지의 기능임.
  const mediaPanel = el('section', { className: 'page-section' });
  // 제목과 보관함 이동 링크를 같은 줄에 둘 묶음임.
  const mediaHeading = el('div', { className: 'section-heading' });
  // 현재 영화에 연결된 사진이라는 의미를 표시함.
  const mediaTitle = el('h2', {}, '이 영화의 보관 사진');
  // 사진 보관함에 현재 영화 ID를 전달함. 링크만으로 보관함 기능이 구현되는 것은 아님.
  const archiveLink = el('a', { href: `archive.html?movie_id=${encodeURIComponent(movieId)}`, className: 'text-link' }, '사진 보관함');
  // 제목 다음에 이동 링크를 붙임.
  mediaHeading.append(mediaTitle, archiveLink);
  // 사진 카드들이 들어갈 공간임. 빈 상태 또는 읽기 실패 안내도 여기서 표시함.
  const photoGrid = el('div', { className: 'media-grid' });
  // 사진 제목 묶음과 사진 목록을 부모에 붙임.
  mediaPanel.append(mediaHeading, photoGrid);
  // 입력 폼과 저장된 기록 목록의 상대적 위치를 CSS로 정할 묶음임.
  const recordLayout = el('div', { className: 'record-layout' });
  // 입력 폼을 먼저, 기록 목록을 뒤에 넣음.
  recordLayout.append(formPanel, recordPanel);
  // 상세 화면에서 전체 영화 목록으로 돌아갈 이동 링크임.
  const back = el('a', { href: 'movies.html', className: 'back-link' }, '← 영화 목록');
  // 기존 로딩/이전 화면을 완성한 새 요소들로 교체함. 저장소 데이터는 삭제하지 않음.
  app.replaceChildren(back, details, recordLayout, mediaPanel);

  // 이번 화면에서 만들어진 사진 임시 URL만 모음. 사진 원본 Blob과는 다른 표시용 주소임.
  const objectUrls = [];
  // 페이지를 떠났거나 화면을 교체한 뒤 늦게 끝난 사진 읽기를 화면에 반영하지 않도록 기억함.
  let disposed = false;
  // boot가 다음 화면을 그리기 전과 페이지를 떠날 때 호출할 정리 함수임.
  function cleanupPhotos() {
    // 비동기 사진 읽기가 진행 중이어도 정리된 화면임을 먼저 표시함.
    disposed = true;
    // 이번 화면이 만든 주소들만 차례로 해제함.
    for (const url of objectUrls) {
      // 주소의 메모리 연결을 해제함. IndexedDB에 저장된 사진 자체는 삭제하지 않음.
      URL.revokeObjectURL(url);
    }
    // 배열을 비워 정리 함수가 다시 호출되어도 같은 주소를 계속 처리하지 않게 함.
    objectUrls.length = 0;
    // 직접 등록한 페이지 떠남 이벤트도 제거해 오래된 화면 함수가 계속 남지 않게 함.
    removeEventListener('pagehide', cleanupPhotos);
  }
  // 사진 읽기를 기다리는 중 페이지를 떠나는 경우도 처리함. boot의 반환 cleanup 전에도 유효함.
  addEventListener('pagehide', cleanupPhotos);
  // 현재 영화에 연결된 사진 정보만 선택함. 원본 사진 데이터는 아직 읽지 않았음.
  const assets = [];
  // snapshot.assets도 저장소가 정렬했으므로 원래 순서대로 골라냄.
  for (const asset of snapshot.assets) {
    // 현재 영화의 사진만 목록에 넣음.
    if (asset.movie_id === movieId) assets.push(asset);
  }
  // 보관한 사진이 없으면 업로드된 것처럼 빈 이미지들을 만들지 않음.
  if (assets.length === 0) {
    // 사진 저장 기능은 보관함에서 별도로 구현한다는 안내임.
    const emptyPhoto = el('p', { className: 'empty-state compact' }, '이 영화에 저장된 사진이 없습니다.');
    // 안내 문단을 사진 목록에 붙임.
    photoGrid.append(emptyPhoto);
  }
  // 사진은 읽기 작업만 순차적으로 실행함. 이 페이지에서는 add/delete를 호출하지 않음.
  for (const asset of assets) {
    // 이미 페이지를 떠났다면 더 이상 다음 사진 읽기를 시작하지 않음.
    if (disposed) break;
    // figure는 이미지와 설명을 한 덩어리로 묶는 태그임.
    const card = el('figure', { className: 'media-card' });
    // 읽기가 끝나기 전에도 이 사진의 위치를 목록에 마련함.
    photoGrid.append(card);
    // 한 사진이 실패해도 다른 사진과 감상 기록을 계속 표시하도록 개별 오류를 처리함.
    try {
      // 사진 정보 ID로 원본 Blob을 읽음. 이 함수가 소유 프로필도 검사함.
      const blob = await manageMedia(repo, catalog, 'read', { asset_id: asset.asset_id });
      // 기다리는 동안 페이지를 떠났다면 URL을 만들지 않고 반복을 끝냄.
      if (disposed) break;
      // Blob을 img.src에서 사용할 수 있는 임시 blob: 주소로 만듦.
      const url = URL.createObjectURL(blob);
      // 나중에 정리할 수 있도록 주소를 만든 즉시 배열에 보관함.
      objectUrls.push(url);
      // 기본 사진 종류 이름임. 저장 값은 영어 구분값, 표시 문구는 한국어임.
      let kind = '기타';
      // ticket이면 티켓으로 표시함.
      if (asset.kind === 'ticket') kind = '티켓';
      // poster이면 포스터로 표시함.
      if (asset.kind === 'poster') kind = '포스터';
      // src는 방금 만든 주소, alt는 영화와 사진 종류를 설명하는 대체 글자임.
      const image = el('img', { src: url, alt: movie.title + ' ' + kind, loading: 'lazy' });
      // 이미지 아래에 표시할 종류 설명임.
      const caption = el('figcaption', {}, kind);
      // 이미지 다음에 설명을 붙여 사진 카드 한 개를 완성함.
      card.append(image, caption);
    } catch (error) {
      // 페이지를 떠난 뒤에는 제거된 카드에 오류 문장을 새로 추가할 필요가 없음.
      if (disposed) break;
      // 사진 정보만 있고 원본이 없는 경우 등에도 나머지 페이지는 계속 사용할 수 있게 안내함.
      const failed = el('p', { className: 'status error' }, '사진 원본을 읽지 못했습니다. 사진 보관함에서 확인해 주세요.');
      // 해당 사진 위치에 실패 문장을 넣음.
      card.append(failed);
    }
  }
  // 함수 자체를 반환함. boot가 다음 갱신 또는 페이지 떠남 때 호출하여 임시 URL을 해제함.
  return cleanupPhotos;
}

// 공통 준비 함수에 상세 페이지의 설정을 전달함. renderMovie()를 여기서 직접 실행하지 않음.
boot({
  // 공통 메뉴가 영화 검색 메뉴를 현재 위치로 표시하도록 정한 페이지 구분값임.
  page: 'movie',
  // 브라우저 탭 제목임. 본문 h1의 영화 제목과는 별개임.
  title: '영화 상세',
  // 데이터 준비가 끝난 뒤 boot가 호출할 이름 있는 화면 함수임.
  render: renderMovie
});

