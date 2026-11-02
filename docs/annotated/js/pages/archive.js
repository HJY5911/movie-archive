/*
 * archive.js — 감상한 영화의 티켓·특전 포스터 사진을 보관하고 영화별로 모아 보여주는 페이지
 *
 * 이 파일에서 하는 일:
 * 1. 사진 올리기: 파일 선택 → 미리보기 → 종류(티켓·포스터·기타) 선택 → 영화 찾기로 연결할 영화 선택 → 저장함.
 * 2. 주소에 ?movie_id=영화ID가 있으면(영화 상세 페이지의 '사진 보관함' 링크) 그 영화를 미리 선택해 둠.
 * 3. 모아 보기: 저장된 사진을 영화별로 묶어 보여주고, 종류 필터(전체/티켓/포스터/기타)로 거름.
 * 4. 사진을 누르면 크게 보기 창(dialog)을 열고(닫기 버튼·Esc·창 바깥 클릭으로 닫음), 삭제 버튼은 확인을 받은 뒤 사진을 지움.
 * 5. 저장한 사진의 용량 합계를 '사용량 N MiB / 50 MiB'로 보여줌.
 *
 * 사진의 실제 저장·읽기·삭제와 파일 검사는 repository.js의 manageMedia()가 담당함.
 * manageMedia()는 저장 전에 validation.js의 validateMedia()로 형식(JPEG·PNG·WebP)·용량·종류를 검사함.
 * 이 페이지는 영화·종류·파일 중 비어 있는 칸만 저장 전에 직접 확인해 한꺼번에 알려 줌.
 * → manageMedia()는 영화부터 확인하고 바로 멈추므로, 맡겨 두면 빈 칸 오류가 저장 버튼을 누를 때마다 하나씩 나오기 때문임.
 * 형식·용량 검사는 따로 다시 만들지 않고 manageMedia()의 결과(성공 또는 오류 문구)를 그대로 화면에 보여줌.
 * 입력을 고치면(파일·종류·영화 선택) 이전 오류 안내는 지움. 고친 뒤에도 오래된 오류가 남아 헷갈리지 않게 함.
 * 영화 찾기는 영화 검색 페이지와 같은 selectors.js의 searchMovies()를 사용하므로 제목·별칭·배우·감독으로 찾을 수 있음.
 *
 * HTML은 페이지의 빈 틀, archive.css는 폼·사진 목록·크게 보기 창의 배치, 이 JS는 상태 관리와 클릭 동작을 담당함.
 * 화면을 그리는 공통 준비 작업은 ui.js의 boot()가 담당함.
 */

// import는 다른 파일에서 export한 함수와 값을 가져오는 문법임.
// '../'는 현재 js/pages 폴더에서 한 단계 위인 js 폴더를 뜻함.
// boot(): 메뉴·영화 자료·저장소를 준비한 뒤 아래 renderArchive 함수를 호출함.
// el(): HTML 요소를 만드는 프로젝트 도우미임. 내부에서 document.createElement 등을 사용함.
// showMessage(): 페이지 위쪽 #messages 영역에 성공·오류 안내를 잠시 보여줌.
import { boot, el, showMessage } from '../ui.js';
// manageMedia(repo, catalog, 작업, 내용)는 사진 추가('add')·원본 읽기('read')·삭제('delete')를 한 함수로 처리함.
import { manageMedia } from '../repository.js';
// searchMovies(catalog, 검색어)는 제목·별칭·배우·감독 이름에 검색어가 들어 있는 영화 배열을 반환함.
import { searchMovies } from '../selectors.js';
// MEDIA_KINDS: 저장할 수 있는 사진 종류 ['ticket', 'poster', 'other']임.
// MEDIA_MAX_FILE_BYTES: 한 장의 최대 용량(5 MiB), MEDIA_MAX_TOTAL_BYTES: 전체 합계 최대 용량(50 MiB)임.
// 검사 기준 숫자를 이 파일에 다시 적지 않고 가져와 쓰므로, 기준이 바뀌어도 안내 문구가 함께 맞춰짐.
import { MEDIA_KINDS, MEDIA_MAX_FILE_BYTES, MEDIA_MAX_TOTAL_BYTES } from '../validation.js';

// location.search의 '?movie_id=m001'을 항목별로 읽을 수 있게 만드는 브라우저 기본 객체임.
const parameters = new URLSearchParams(location.search);
// 영화 상세 페이지에서 넘어왔을 때의 영화 ID임. 주소에 없으면 null임.
// movie.js는 상세 페이지에서 archive.html?movie_id=영화ID로 연결하므로 이름을 movie_id로 맞춤.
const linkedMovieId = parameters.get('movie_id');
// 1 MiB는 1024 × 1024 바이트임. 바이트 수를 MiB 단위로 바꿀 때 나누는 값임.
const bytesPerMiB = 1024 * 1024;
// 영화 찾기 결과를 한 번에 보여줄 최대 개수임. 결과가 많으면 검색어를 더 입력하도록 안내함.
const resultLimit = 8;

// 아래 변수들은 renderArchive 밖(모듈 범위)에 있으므로 refresh()로 화면을 다시 그려도 값이 유지됨.
// 예: 다른 탭에 갔다 돌아오면 boot()가 화면을 다시 그리지만, 고른 파일·종류·영화는 그대로 남음.
// 브라우저에서 페이지 자체를 새로고침하면 모듈이 다시 실행되므로 처음 값으로 돌아감.

// 사진을 연결할 영화의 ID임. 주소로 넘어온 영화가 있으면 그 값으로 시작함. null은 아직 고르지 않았다는 뜻임.
let selectedMovieId = linkedMovieId;
// 고른 사진 종류임. 'ticket'·'poster'·'other' 중 하나이거나, 아직 고르지 않았으면 null임.
// 일부러 기본값을 두지 않음 → 종류를 고르지 않고 저장하면 savePhoto()가 '사진 종류를 선택해 주세요.'를 알려줌.
let selectedKind = null;
// 파일 입력에서 고른 File 객체임. 화면을 다시 그려도 파일을 다시 고르지 않아도 되도록 따로 기억함.
let selectedFile = null;
// 미리보기용 주소(blob:로 시작하는 객체 URL)임. selectedFile이 있을 때만 값이 있음.
let previewUrl = null;
// 영화 찾기 입력칸에 적은 글자임. 빈 문자열이면 등록된 영화 전체가 결과로 나옴.
let searchText = '';
// 모아 보기의 종류 필터임. 'all'은 전체, 나머지는 MEDIA_KINDS의 값과 같음.
let kindFilter = 'all';
// 크게 보기 창에 띄운 사진의 ID임. 창이 닫혀 있으면 null임.
// 창이 열린 채로 화면을 다시 그리면 이 값을 보고 새 화면에서 같은 사진을 다시 띄움.
let viewingAssetId = null;
// 저장·삭제 중에는 true로 두어 버튼을 연속으로 눌러도 겹치는 작업을 시작하지 않음.
let busy = false;
// 폼 아래 안내 문장과 그 문장이 오류인지 여부임. 화면을 다시 그려도 안내가 사라지지 않도록 기억함.
let statusText = '';
let statusIsError = false;

/*
 * kindLabel(kind): 저장소에 쓰는 영어 종류 이름을 화면에 보여줄 한글로 바꿈.
 * 예: 'ticket' → '티켓', 'poster' → '포스터', 'other' → '기타'
 * movie.js의 사진 카드와 같은 이름을 사용하여 두 페이지의 표시를 맞춤.
 */
function kindLabel(kind) {
  // 위에서부터 차례로 비교하고, 맞는 조건을 만나면 return으로 바로 함수를 끝냄.
  if (kind === 'ticket') {
    return '티켓';
  }
  if (kind === 'poster') {
    return '포스터';
  }
  // 위 두 경우가 아니면 남은 종류는 'other' 하나뿐이므로 '기타'를 반환함.
  return '기타';
}

/*
 * filterLabel(kind): 종류 필터 버튼에 쓸 이름을 만듦.
 * 필터에는 종류 세 가지 앞에 '전체'('all')가 하나 더 있으므로 kindLabel과 따로 둠.
 * 예: 'all' → '전체', 'poster' → '포스터'
 */
function filterLabel(kind) {
  if (kind === 'all') {
    return '전체';
  }
  // 나머지는 kindLabel에 맡겨 같은 한글 이름을 사용함.
  return kindLabel(kind);
}

/*
 * movieLabel(movie): 영화 찾기 결과와 선택한 영화 안내에 쓸 '제목 (개봉 연도)' 문구를 만듦.
 * 예: { title: '기생충', release_date: '2019-05-30' } → '기생충 (2019)'
 * 같은 제목의 영화가 있어도 개봉 연도로 구분할 수 있게 함.
 */
function movieLabel(movie) {
  // 개봉일이 없을 때 보여줄 기본 문구임. let이므로 아래에서 바꿀 수 있음.
  let yearText = '개봉일 미등록';
  // release_date는 '2018-01-01' 같은 문자열 또는 null임.
  if (movie.release_date !== null) {
    // slice(0, 4)는 앞의 네 글자, 즉 연도만 잘라냄. 예: '2018-01-01' → '2018'.
    yearText = movie.release_date.slice(0, 4);
  }
  // 템플릿 문자열의 ${...} 자리에 제목과 연도가 들어감.
  return `${movie.title} (${yearText})`;
}

/*
 * movieTitle(catalog, movieId): 영화 ID로 제목을 찾음.
 * 사진이 가리키는 영화가 catalog.json에서 빠진 경우에도 화면이 멈추지 않도록 '영화 정보 없음'을 반환함.
 * 예: movieTitle(catalog, 'm001') → '기생충'
 */
function movieTitle(catalog, movieId) {
  // catalog.lookup.movieById는 영화 ID로 영화 객체를 찾는 Map임. 없는 ID이면 undefined를 반환함.
  const movie = catalog.lookup.movieById.get(movieId);
  if (movie === undefined) {
    return '영화 정보 없음';
  }
  return movie.title;
}

/*
 * formatSize(bytes): 바이트 수를 읽기 쉬운 용량 문구로 바꿈.
 * 1 MiB보다 작으면 KiB(1024바이트) 단위의 정수, 그 이상이면 MiB 단위의 소수 첫째 자리까지 보여줌.
 * 예: 350000 → '342 KiB', 3355443 → '3.2 MiB', 0 → '0 KiB'
 */
function formatSize(bytes) {
  if (bytes < bytesPerMiB) {
    // Math.ceil은 올림임. 1바이트짜리도 '0 KiB'가 아니라 '1 KiB'로 보이게 함.
    return Math.ceil(bytes / 1024) + ' KiB';
  }
  // toFixed(1)은 소수 첫째 자리까지 반올림한 문자열을 만듦. 예: 3.2000… → '3.2'.
  return (bytes / bytesPerMiB).toFixed(1) + ' MiB';
}

/*
 * formatUsage(bytes): '사용량 N MiB / 50 MiB'의 N 자리에 넣을 문구를 만듦.
 * formatSize와 달리 1 MiB보다 작아도 KiB로 바꾸지 않고 항상 MiB로 보여줌 → 뒤의 '/ 50 MiB'와 단위가 맞음.
 * 소수 첫째 자리에서 올림하므로 사진이 조금이라도 있으면 0.0이 아니라 최소 0.1 MiB로 보임.
 * 예: 0 → '0.0 MiB', 350000 → '0.4 MiB', 3145728(3 MiB) → '3.0 MiB'
 */
function formatUsage(bytes) {
  // bytes * 10을 먼저 하고 나누면 정수를 2의 거듭제곱(1048576)으로 나누는 계산이라 소수 오차가 생기지 않음.
  // Math.ceil로 올림한 뒤 10으로 나누면 소수 첫째 자리까지의 값이 됨. 예: 350000 * 10 / 1048576 = 3.33… → 4 → 0.4.
  return (Math.ceil(bytes * 10 / bytesPerMiB) / 10).toFixed(1) + ' MiB';
}

/*
 * savedDateText(isoText): 저장 시각 문자열을 한국식 날짜로 바꿈.
 * 저장소의 created_at은 '2026-10-29T12:34:56.000Z' 같은 ISO 형식(UTC)임.
 * toLocaleDateString('ko-KR')이 현재 컴퓨터의 시간대로 바꿔 '2026. 10. 29.' 형식으로 만듦.
 */
function savedDateText(isoText) {
  return new Date(isoText).toLocaleDateString('ko-KR');
}

/*
 * errorText(error): 오류 객체에서 화면에 보여줄 문장을 꺼냄.
 * repository.js와 validation.js가 만든 오류는 message에 한국어 안내가 들어 있음.
 * 예: '사진 한 장은 5 MiB 이하여야 합니다.', '실제 형식이 일치하는 JPEG, PNG 또는 WebP 사진을 선택해 주세요.'
 * 문장이 없는 예외적인 경우에만 기본 문구를 사용함.
 */
function errorText(error) {
  // &&는 왼쪽이 거짓이면 오른쪽을 확인하지 않음. error가 null이어도 .message를 읽다가 오류가 나지 않음.
  if (error && typeof error.message === 'string') {
    return error.message;
  }
  return '작업을 완료하지 못했습니다. 다시 시도해 주세요.';
}

/*
 * setBusy(value): 작업 중 여부를 바꾸고 폼의 입력·버튼과 삭제 버튼을 모두 같은 상태로 맞춤.
 * value가 true이면 사용할 수 없게(disabled), false이면 다시 사용할 수 있게 함.
 * movie.js의 setBusy와 같은 방식임.
 */
function setBusy(value) {
  // 모듈 변수에도 저장하여, 이후 새로 만드는 요소에도 같은 상태(disabled: busy)를 적용함.
  busy = value;
  // 쉼표로 이은 선택자는 폼 안의 입력·버튼과 모든 사진의 삭제 버튼을 한 번에 찾음.
  // 종류 필터와 크게 보기 버튼은 저장소를 바꾸지 않으므로 작업 중에도 그대로 둠.
  const controls = document.querySelectorAll('#archive-upload-form input, #archive-upload-form button, .archive-delete');
  // querySelectorAll의 결과(NodeList)도 for...of로 하나씩 꺼낼 수 있음.
  for (const control of controls) {
    control.disabled = value;
  }
}

/*
 * setStatus(text, isError): 폼 아래 안내 문장을 바꿈.
 * 값을 모듈 변수에도 기억하므로 화면을 다시 그려도 같은 문장이 다시 표시됨.
 * isError가 true이면 error 클래스를 붙여 archive.css가 왼쪽 굵은 막대와 굵은 글자로 오류를 구분함(색만으로 구분하지 않음).
 */
function setStatus(text, isError) {
  statusText = text;
  statusIsError = isError;
  // 현재 화면의 안내 문단을 찾음. 아직 폼을 그리기 전이면 null임.
  const status = document.getElementById('archive-status');
  if (status === null) {
    // 화면에 없으면 기억만 해 둠. 다음에 폼을 만들 때 statusText로 표시됨.
    return;
  }
  status.textContent = text;
  // className을 통째로 다시 지정해 이전의 error 클래스를 먼저 지움.
  status.className = 'archive-status';
  if (isError) {
    status.classList.add('error');
  }
}

/*
 * clearFormError(): 폼 아래에 오류 안내가 떠 있으면 지움. 파일·종류·영화를 새로 고를 때 호출함.
 * 예: 저장을 눌러 '사진 종류를 선택해 주세요.'가 떴는데 사용자가 티켓을 누름 → 안내가 사라짐.
 * 오류가 아닌 안내(예: '사진을 저장하는 중입니다.')는 그대로 둠.
 * 페이지 위쪽 알림(#messages)에도 같은 오류가 떠 있으면 함께 숨겨, 고친 뒤에도 오류가 남아 보이지 않게 함.
 */
function clearFormError() {
  // 오류가 아니면 지울 것이 없으므로 바로 끝냄.
  if (!statusIsError) {
    return;
  }
  // 빈 문장으로 바꾸면 archive.css의 .archive-status:empty 규칙으로 안내 상자도 사라짐.
  setStatus('', false);
  // #messages는 HTML의 상단 알림 영역이며, ui.js의 showMessage()가 'toast error' 클래스를 붙여 오류를 표시함.
  const messages = document.getElementById('messages');
  // classList.contains('error')로 지금 떠 있는 알림이 오류일 때만 숨김. 성공 알림(예: '… 저장했습니다.')은 그대로 둠.
  if (messages !== null && messages.classList.contains('error')) {
    // hidden을 true로 하면 알림이 사라짐. showMessage()가 다음 알림을 띄울 때 다시 false로 바꿈.
    messages.hidden = true;
  }
}

/*
 * clearSelectedFile(): 고른 파일과 미리보기 주소를 비움.
 * URL.createObjectURL()로 만든 주소는 직접 revokeObjectURL()로 해제해야 메모리에서 사라짐.
 * 저장소에 저장된 사진을 지우는 함수가 아님. 폼에서 고른 파일만 잊음.
 */
function clearSelectedFile() {
  if (previewUrl !== null) {
    // 미리보기 주소를 해제함. 해제한 뒤에는 이 주소로 이미지를 다시 불러올 수 없음.
    URL.revokeObjectURL(previewUrl);
  }
  previewUrl = null;
  selectedFile = null;
}

/*
 * rememberFile(file): 새로 고른 파일을 기억하고 미리보기 주소를 만듦.
 * file: 파일 입력의 files[0]에서 꺼낸 File 객체임.
 * 이전에 고른 파일이 있었다면 그 미리보기 주소를 먼저 해제함.
 */
function rememberFile(file) {
  // 이전 파일의 미리보기 주소가 남지 않도록 먼저 비움.
  clearSelectedFile();
  selectedFile = file;
  // createObjectURL은 파일을 서버에 올리지 않고 이 브라우저 안에서만 쓰는 'blob:' 주소를 만듦.
  // img의 src에 넣으면 저장 전에도 사진을 바로 미리 볼 수 있음.
  previewUrl = URL.createObjectURL(file);
}

/*
 * refreshArchive(refresh, focusId): 저장소를 다시 읽어 화면을 새로 그린 뒤 지정한 요소로 초점을 옮김.
 * refresh: boot()가 넘겨준 화면 갱신 함수, focusId: 새 화면에서 초점을 받을 요소의 id임.
 * 예: 사진 저장 후 'archive-file'(파일 입력), 삭제 후 'archive-gallery-title'('모아 보기' 제목)
 * refresh()는 본문 요소를 새로 만들기 때문에 이전 요소 객체가 아니라 id로 새 요소를 다시 찾음.
 * map.js의 refreshMap과 같은 방식임.
 */
async function refreshArchive(refresh, focusId) {
  try {
    // 저장소 읽기와 본문 교체가 모두 끝날 때까지 기다린 뒤 아래의 초점 이동으로 진행함.
    await refresh();
  } catch (error) {
    // ui.js의 refresh가 이미 오류 안내를 표시한 뒤 오류를 다시 전달함.
    // 여기서 받아 종료하여 처리되지 않은 Promise 오류가 남지 않게 함. 갱신이 실패했으므로 초점 이동도 하지 않음.
    return;
  }

  // 반드시 갱신이 끝난 뒤 찾아야 새로 생성된 요소를 얻을 수 있음.
  const target = document.getElementById(focusId);
  // null에 focus()를 호출하면 오류이므로 실제로 있는 경우에만 실행함.
  if (target !== null) {
    target.focus();
  }
}

/*
 * compareGroups(a, b): 영화별 사진 묶음을 영화 제목의 가나다순으로 정렬할 때 sort()에 넘기는 비교 함수임.
 * a, b: { title, movie_id, assets } 형태의 묶음 두 개임.
 * localeCompare는 음수(a가 앞)·0·양수(b가 앞)를 반환함. 예: '룩백', '기생충' → '기생충'이 앞(ㄱ이 ㄹ보다 앞)
 */
function compareGroups(a, b) {
  return a.title.localeCompare(b.title);
}

/*
 * buildUploadPanel(context): '사진 올리기' 영역(파일·미리보기·종류·영화 찾기·저장 버튼)을 만들어 반환함.
 * context: boot()가 renderArchive에 넘긴 객체를 그대로 받음.
 * 파일·종류·영화를 고를 때는 refresh()로 전체를 다시 그리지 않고 해당 부분만 바꿈.
 * → 아래 모아 보기의 사진들을 매번 다시 불러오지 않아 화면이 깜빡이지 않음.
 * 저장에 성공했을 때만 refresh()로 전체를 다시 그려 새 사진을 목록에 보여줌.
 */
function buildUploadPanel(context) {
  // catalog: 영화 기본 자료와 ID별 조회용 Map임.
  const catalog = context.catalog;
  // repo: 저장소 연결 객체임. manageMedia()에 그대로 넘김.
  const repo = context.repo;
  // snapshot: 저장소에서 방금 읽은 현재 프로필의 자료임. 감상 기록(logs)과 사진 목록(assets)이 들어 있음.
  const snapshot = context.snapshot;
  // refresh: 최신 자료를 다시 읽고 renderArchive를 재실행하는 함수임. ()를 붙이지 않아 여기서는 실행하지 않음.
  const refresh = context.refresh;

  // Set은 같은 값을 한 번만 저장하는 모음임. 감상 기록이 있는 영화 ID를 중복 없이 모음.
  // 영화 찾기 결과에 '감상한 영화' 표시를 붙여, 감상한 영화의 사진을 쉽게 연결하도록 도움.
  const watchedMovies = new Set();
  for (const log of snapshot.logs) {
    watchedMovies.add(log.movie_id);
  }

  // 파일 입력의 이름표임. htmlFor는 HTML의 for 속성으로, 이름표를 누르면 id가 같은 입력이 선택됨.
  const fileLabel = el('label', { htmlFor: 'archive-file' }, '사진 파일 · 필수');
  // type: 'file'은 컴퓨터의 파일을 고르는 입력임.
  const fileInput = el('input', {
    // 이름표 연결과 저장 후 초점 이동에 쓰는 id임.
    id: 'archive-file',
    name: 'file',
    type: 'file',
    // form-control은 Bootstrap의 입력칸 모양 클래스임. 파일 선택 버튼 모양도 함께 정리됨.
    className: 'form-control',
    // accept는 파일 선택 창에서 기본으로 보여줄 형식임. validateMedia()가 허용하는 세 형식과 맞춤.
    // 선택 창에서 다른 형식을 고를 수도 있으므로 실제 검사는 저장할 때 validateMedia()가 함.
    accept: 'image/jpeg,image/png,image/webp',
    // 작업 중에 화면을 다시 그리면 새 입력도 사용할 수 없는 상태로 만듦.
    disabled: busy
  });
  // aria-describedby는 입력의 보충 설명이 어느 요소인지 화면 읽기 프로그램에 알려줌.
  // aria-describedby는 다른 요소의 id를 가리키는 속성이라 ariaLive처럼 ariaDescribedBy라는 문자열 속성 이름으로 지정할 수 없음.
  // el()에 ariaDescribedBy로 넘기면 setAttribute로 넘어가 ariadescribedby라는 엉뚱한 속성이 생기므로 setAttribute로 직접 지정함.
  fileInput.setAttribute('aria-describedby', 'archive-file-help');
  // 허용 형식과 한 장 최대 용량 안내임. 5 MiB라는 숫자는 validation.js의 값을 나눠서 구함. 예: 5242880 / 1048576 → 5.
  const fileHelp = el('p', { id: 'archive-file-help', className: 'archive-help' }, `JPEG·PNG·WebP 사진, 한 장 ${MEDIA_MAX_FILE_BYTES / bytesPerMiB} MiB 이하`);
  // 화면을 다시 그리면 새 파일 입력은 비어 있음. 기억해 둔 파일이 있으면 입력에 다시 넣어 줌.
  if (selectedFile !== null) {
    // DataTransfer는 원래 끌어다 놓기에 쓰는 객체지만, 파일 목록(FileList)을 직접 만드는 용도로도 쓸 수 있음.
    const transfer = new DataTransfer();
    // 기억해 둔 File 객체를 목록에 추가함.
    transfer.items.add(selectedFile);
    // 파일 입력의 files에 만든 목록을 넣으면 '선택한 파일 이름'이 다시 표시됨. 이때 change 이벤트는 발생하지 않음.
    fileInput.files = transfer.files;
  }
  // 이름표·입력·설명을 세로로 쌓을 묶음임. 배치는 archive.css의 .archive-field가 정함.
  const fileField = el('div', { className: 'archive-field' });
  fileField.append(fileLabel, fileInput, fileHelp);

  // 미리보기를 넣을 상자임. 안의 내용은 showPreview()가 바꿈.
  const preview = el('div', { id: 'archive-preview', className: 'archive-preview' });

  /*
   * showPreview(): 고른 파일이 있으면 사진과 파일 정보를, 없으면 안내 문장을 미리보기 상자에 넣음.
   * replaceChildren은 상자 안의 기존 내용을 모두 지우고 새 요소로 교체함.
   * 사진으로 그릴 수 없는 파일이면(예: 글자 파일의 확장자만 .jpg로 바꾼 경우) 깨진 그림 대신 안내 문장을 보여줌.
   */
  function showPreview() {
    if (selectedFile === null) {
      const emptyText = el('p', {}, '선택한 사진이 없습니다. 파일을 고르면 여기에 미리 보여줍니다.');
      preview.replaceChildren(emptyText);
      // 안내만 넣고 함수를 끝냄. 아래 사진 표시는 실행하지 않음.
      return;
    }
    // previewUrl은 rememberFile()이 만든 'blob:' 주소임. alt는 이미지를 볼 수 없을 때 대신 전달되는 설명임.
    const image = el('img', { src: previewUrl, alt: '선택한 사진 미리보기' });
    // 파일 이름과 용량을 함께 보여줌. 예: 'ticket.jpg · 342 KiB'.
    const fileText = el('p', {}, `${selectedFile.name} · ${formatSize(selectedFile.size)}`);

    /*
     * showBrokenPreview(): 미리보기 img가 사진을 그리지 못했을 때(error 이벤트) 실행됨.
     * 사진 자리에 안내 문장을 넣어, 저장 버튼을 누르기 전에 잘못된 파일임을 알 수 있게 함.
     * 저장 여부는 여전히 validateMedia()가 판단함. 이 함수는 미리보기 표시만 바꿈.
     */
    function showBrokenPreview() {
      // 그사이 다른 파일을 골라 미리보기가 바뀌었으면, 이전 img의 늦은 오류이므로 무시함.
      // contains(요소)는 그 요소가 상자 안에 들어 있으면 true를 반환함.
      if (!preview.contains(image)) {
        return;
      }
      // archive-preview-error 클래스는 archive.css가 굵은 글자로 표시함.
      const brokenText = el('p', { className: 'archive-preview-error' }, '미리 볼 수 없는 파일입니다. JPEG·PNG·WebP 사진을 골라 주세요.');
      // 깨진 img를 안내 문장으로 바꾸고, 어떤 파일인지 알 수 있게 파일 정보는 그대로 남김.
      preview.replaceChildren(brokenText, fileText);
    }
    // img는 src의 파일을 그림으로 읽지 못하면 error 이벤트를 발생시킴. 이 이벤트는 나중에 발생하므로 지금 등록해도 늦지 않음.
    image.addEventListener('error', showBrokenPreview);
    preview.replaceChildren(image, fileText);
  }

  /*
   * chooseFile(): 파일 입력의 값이 바뀌었을 때(change 이벤트) 실행됨.
   * 파일을 골랐으면 기억하고 미리보기를 만들고, 선택을 비웠으면 기억한 파일도 비움.
   */
  function chooseFile() {
    // 파일을 새로 골랐으므로 이전 저장 시도의 오류 안내를 지움.
    clearFormError();
    // files는 고른 파일 목록(FileList)임. 이 입력은 multiple이 아니므로 최대 한 개임.
    if (fileInput.files.length === 0) {
      clearSelectedFile();
    } else {
      // files[0]은 첫 번째(유일한) 파일임.
      rememberFile(fileInput.files[0]);
    }
    // 바뀐 상태에 맞게 미리보기 상자만 다시 그림.
    showPreview();
  }
  // 이벤트가 발생할 때 실행할 함수를 등록함. chooseFile()처럼 ()를 붙이면 지금 바로 실행되므로 붙이지 않음.
  fileInput.addEventListener('change', chooseFile);
  // 처음 화면에도 현재 상태(안내 문장 또는 기억한 파일의 미리보기)를 보여줌.
  showPreview();

  // fieldset은 관련된 입력들을 묶는 요소이고, legend는 그 묶음의 제목임.
  // 화면 읽기 프로그램은 버튼에 초점이 가면 legend의 '사진 종류'를 함께 읽어 줌.
  const kindSet = el('fieldset', { className: 'archive-kind' });
  const kindLegend = el('legend', {}, '사진 종류 · 필수');
  // 종류 버튼 세 개를 가로로 놓을 묶음임.
  const kindButtons = el('div', { className: 'archive-kind-buttons' });

  /*
   * markKind(): 종류 버튼마다 지금 고른 종류인지를 aria-pressed로 표시함.
   * aria-pressed는 토글 버튼이 눌린(선택된) 상태인지 보조 기술에 알려주는 속성임.
   * archive.css는 [aria-pressed="true"]인 버튼의 테두리를 두껍게, 글자를 굵게 표시함.
   */
  function markKind() {
    // children은 kindButtons 안의 자식 요소 목록(HTMLCollection)이며 for...of로 꺼낼 수 있음.
    for (const button of kindButtons.children) {
      // dataset.kind는 HTML의 data-kind 속성 값임. 예: 'ticket'.
      // String(비교 결과)는 true/false를 문자열 'true'/'false'로 바꿈.
      button.setAttribute('aria-pressed', String(button.dataset.kind === selectedKind));
    }
  }

  // MEDIA_KINDS의 순서(티켓, 포스터, 기타)대로 버튼을 하나씩 만듦.
  for (const kind of MEDIA_KINDS) {
    const kindButton = el('button', {
      // 예: 'archive-kind-ticket'. 테스트나 이름표 연결에 쓸 수 있도록 종류마다 다른 id를 줌.
      id: 'archive-kind-' + kind,
      // type: 'button'은 폼 제출용이 아닌 일반 버튼임. 지정하지 않으면 폼 안의 버튼은 누를 때 폼을 제출함.
      type: 'button',
      // btn btn-link는 Bootstrap의 글자 버튼 모양임. aria-pressed가 붙으므로 map.js의 모드 버튼처럼 탭 모양이 됨.
      className: 'btn btn-link',
      // dataset에 넣은 값은 data-kind="ticket" 같은 속성이 됨. markKind()가 이 값으로 선택 여부를 비교함.
      dataset: { kind: kind },
      disabled: busy
    }, kindLabel(kind));

    // 반복마다 새로 만들어지는 클릭 함수임. 이번 반복의 kind를 기억함(클로저).
    // const 변수는 반복마다 따로 생기므로 각 버튼이 마지막 종류가 아닌 자기 종류를 선택함.
    function pickKind() {
      // 종류를 새로 골랐으므로 이전 저장 시도의 오류 안내를 지움.
      clearFormError();
      selectedKind = kind;
      // 전체를 다시 그리지 않고 버튼 세 개의 선택 표시만 바꿈. 초점도 누른 버튼에 그대로 남음.
      markKind();
    }
    kindButton.addEventListener('click', pickKind);
    kindButtons.append(kindButton);
  }
  // 처음 화면에도 기억한 종류(또는 아무것도 고르지 않은 상태)를 표시함.
  markKind();
  // 결과: kindSet(fieldset) → [kindLegend(legend), kindButtons(div)].
  kindSet.append(kindLegend, kindButtons);

  // 영화 찾기 입력의 이름표임.
  const searchLabel = el('label', { htmlFor: 'archive-movie-search' }, '영화 찾기 · 필수');
  // type: 'search'는 검색용 글자 입력임. 브라우저에 따라 오른쪽에 지우기(×) 버튼이 생김.
  const searchInput = el('input', {
    id: 'archive-movie-search',
    type: 'search',
    className: 'form-control',
    // 화면을 다시 그려도 적어 둔 검색어가 그대로 보이도록 기억한 값을 넣음.
    value: searchText,
    // 입력칸이 비어 있을 때 흐리게 보이는 예시임. movies.js의 검색창과 같은 예시를 사용함.
    placeholder: '예: 시달소',
    // 브라우저가 이전 입력값을 자동 완성 목록으로 띄우지 않게 함. 아래 결과 목록과 겹치지 않음.
    autocomplete: 'off',
    disabled: busy
  });
  // 보충 설명 문단과 연결함.
  searchInput.setAttribute('aria-describedby', 'archive-movie-help');
  // aria-controls는 이 입력이 내용을 바꾸는 요소(결과 목록)를 보조 기술에 알려줌.
  searchInput.setAttribute('aria-controls', 'archive-movie-results');
  const searchHelp = el('p', { id: 'archive-movie-help', className: 'archive-help' }, '제목·별칭·배우·감독 이름으로 찾은 뒤 아래 목록에서 영화를 누르세요.');
  const movieField = el('div', { className: 'archive-field' });
  movieField.append(searchLabel, searchInput, searchHelp);

  // 결과 개수 안내임. ariaLive: 'polite'라서 글자를 입력해 개수가 바뀌면 보조 기술이 알려줌.
  const resultCount = el('p', { className: 'archive-result-count', ariaLive: 'polite' });
  // 결과 버튼들을 담을 순서 없는 목록 ul임. 기본 글머리표는 archive.css에서 없앰.
  const resultList = el('ul', { id: 'archive-movie-results', className: 'archive-movie-results' });
  // '선택한 영화: 기생충 (2019)' 같은 안내임. 영화를 고를 때마다 글자가 바뀌고 보조 기술이 알려줌.
  const selectedText = el('p', { id: 'archive-selected-movie', className: 'archive-selected', ariaLive: 'polite' });

  /*
   * markMovie(): 결과 버튼의 선택 표시(aria-pressed)와 '선택한 영화' 안내를 현재 selectedMovieId에 맞춤.
   * 선택한 영화가 지금 결과 목록에 없더라도(검색어를 바꾼 경우) 안내 문장에는 계속 표시됨.
   */
  function markMovie() {
    // 결과 목록 안의 버튼을 모두 찾아 하나씩 비교함.
    for (const button of resultList.querySelectorAll('button')) {
      // dataset.movieId는 HTML의 data-movie-id 속성 값임. 이름의 하이픈 다음 글자가 대문자로 바뀌어 연결됨.
      button.setAttribute('aria-pressed', String(button.dataset.movieId === selectedMovieId));
    }
    if (selectedMovieId === null) {
      selectedText.textContent = '선택한 영화: 없음';
      return;
    }
    // selectedMovieId는 결과 목록에서 고른 값 또는 renderArchive에서 확인을 마친 주소의 값이므로 항상 찾을 수 있음.
    const movie = catalog.lookup.movieById.get(selectedMovieId);
    selectedText.textContent = '선택한 영화: ' + movieLabel(movie);
  }

  /*
   * showResults(): 현재 searchText로 영화를 찾아 결과 버튼 목록을 다시 만듦.
   * 검색 자체는 selectors.js의 searchMovies()가 하므로 영화 검색 페이지와 같은 결과가 나옴.
   * 예: '시달소' → 별칭이 '시달소'인 '시간을 달리는 소녀'
   */
  function showResults() {
    // 검색어가 비어 있으면 searchMovies가 등록된 영화 전체를 반환함.
    const results = searchMovies(catalog, searchText);
    // 인수 없이 replaceChildren()을 호출하면 기존 결과 버튼을 모두 지움.
    resultList.replaceChildren();
    // 지금까지 목록에 넣은 결과 수임.
    let shown = 0;
    for (const movie of results) {
      // resultLimit개를 채웠으면 break로 반복을 멈춤. 나머지 결과는 보여주지 않음.
      if (shown === resultLimit) {
        break;
      }
      // 결과 하나는 누를 수 있는 버튼임. 키보드 Tab과 Enter·Space로도 고를 수 있음.
      const resultButton = el('button', {
        type: 'button',
        // markMovie()가 비교할 영화 ID를 data-movie-id 속성으로 붙여 둠.
        dataset: { movieId: movie.movie_id },
        disabled: busy
      });
      // '제목 (연도)' 글자를 span에 넣어 버튼 안에 붙임.
      const name = el('span', {}, movieLabel(movie));
      resultButton.append(name);
      // 감상 기록이 있는 영화이면 오른쪽에 작은 글자로 표시함.
      if (watchedMovies.has(movie.movie_id)) {
        const watched = el('small', {}, '감상한 영화');
        resultButton.append(watched);
      }

      // 이번 반복의 movie를 기억하는 클릭 함수임(클로저). pickKind와 같은 방식임.
      function pickMovie() {
        // 영화를 새로 골랐으므로 이전 오류 안내(주소의 영화를 찾지 못한 안내 포함)를 지움.
        clearFormError();
        selectedMovieId = movie.movie_id;
        // 결과 목록을 다시 만들지 않고 선택 표시만 바꾸므로 초점이 누른 버튼에 그대로 남음.
        markMovie();
      }
      resultButton.addEventListener('click', pickMovie);

      // 목록 항목 li를 만들고 그 안에 버튼을 넣은 뒤 목록 맨 뒤에 붙임.
      const item = el('li');
      item.append(resultButton);
      resultList.append(item);
      // += 1은 기존 값에 1을 더해 다시 저장하는 줄임 표현임.
      shown += 1;
    }

    // 결과 개수 안내 문구를 정함. 기본은 검색했을 때의 문구임. 예: '검색 결과 1편'.
    let countText = `검색 결과 ${results.length}편`;
    // trim()은 앞뒤 공백을 지움. 공백만 적었으면 검색하지 않은 것과 같으므로 전체 영화 문구로 바꿈.
    if (searchText.trim() === '') {
      countText = `등록된 영화 ${results.length}편`;
    }
    // 보여준 것보다 결과가 많으면 일부만 보여준다는 안내를 덧붙임. 예: '검색 결과 12편 중 8편을 보여줍니다. …'
    if (results.length > resultLimit) {
      countText = countText + ` 중 ${resultLimit}편을 보여줍니다. 검색어를 더 자세히 입력해 보세요.`;
    }
    // 결과가 하나도 없으면 다른 검색어를 안내함. 위에서 정한 문구를 모두 덮어씀.
    if (results.length === 0) {
      countText = '검색 결과가 없습니다. 다른 제목·별칭·인물 이름으로 찾아 보세요.';
    }
    resultCount.textContent = countText;
    // 새로 만든 버튼에도 선택 표시를 맞추고 '선택한 영화' 안내를 갱신함.
    markMovie();
  }

  /*
   * searchMovieList(): 영화 찾기 입력에 글자를 넣거나 지울 때마다(input 이벤트) 실행됨.
   * 검색 버튼 없이 바로 결과 목록을 갱신함. 전체 화면을 다시 그리지 않으므로 입력 중인 글자와 초점이 유지됨.
   */
  function searchMovieList() {
    // 입력칸의 현재 글자를 모듈 변수에 기억해 두어 화면을 다시 그려도 유지되게 함.
    searchText = searchInput.value;
    showResults();
  }

  /*
   * blockEnterSubmit(event): 영화 찾기 입력에서 Enter 키를 눌러도 폼이 제출되지 않게 함.
   * 폼 안의 글자 입력에서 Enter를 누르면 브라우저가 폼을 제출하므로, 검색만 하려다 사진이 저장되는 일을 막음.
   * event.key는 누른 키의 이름임. 예: 'Enter', 'a'.
   */
  function blockEnterSubmit(event) {
    if (event.key === 'Enter') {
      // preventDefault()는 그 이벤트의 기본 동작(여기서는 폼 제출)을 취소함.
      event.preventDefault();
    }
  }
  searchInput.addEventListener('input', searchMovieList);
  searchInput.addEventListener('keydown', blockEnterSubmit);
  // 처음 화면에도 기억한 검색어(처음에는 빈 문자열 → 전체 영화)의 결과를 보여줌.
  showResults();

  // type: 'submit'은 누르면 폼의 submit 이벤트를 발생시키는 버튼임.
  // btn btn-primary는 채워진 주요 버튼 모양임. 사진 저장은 이 페이지의 핵심 동작이므로 이 모양을 씀.
  const saveButton = el('button', { id: 'archive-save', type: 'submit', className: 'btn btn-primary', disabled: busy }, '사진 저장');
  // 저장 버튼을 담는 줄임.
  const actions = el('div', { className: 'archive-form-actions' });
  actions.append(saveButton);
  // 저장 중 안내와 오류 문구를 보여줄 문단임. 기억해 둔 statusText로 시작함.
  const status = el('p', { id: 'archive-status', className: 'archive-status', ariaLive: 'polite' }, statusText);
  if (statusIsError) {
    status.classList.add('error');
  }

  /*
   * savePhoto(event): 폼을 제출하면(저장 버튼 또는 Enter) 실행됨.
   * 먼저 영화·종류·파일 중 비어 있는 칸을 모두 모아 한 번에 알려 줌.
   * 세 칸이 모두 채워졌으면 manageMedia(..., 'add', ...)에 넘겨 저장함.
   * 형식·용량처럼 파일 내용에 대한 검사는 manageMedia와 validateMedia가 하고, 그 오류 문구를 그대로 보여줌.
   * 예: 아무것도 고르지 않음 → '사진을 연결할 영화를 선택해 주세요. 사진 종류를 선택해 주세요. 사진 파일을 선택해 주세요.'
   * 예: 6 MiB 사진을 고름 → '사진 한 장은 5 MiB 이하여야 합니다.'
   */
  async function savePhoto(event) {
    // 폼 제출의 기본 동작(주소를 바꿔 페이지를 다시 여는 것)을 막고 JS로 저장함.
    event.preventDefault();
    // 이미 저장 중이면 아무것도 하지 않음. 버튼을 두 번 눌러 같은 사진이 두 장 저장되는 일을 막음.
    if (busy) {
      return;
    }
    // 비어 있는 칸의 안내 문장을 모을 배열임.
    // manageMedia()는 영화가 없으면 그 오류 하나만 내고 멈추므로, 여기서 세 칸을 미리 모두 확인함.
    const missing = [];
    if (selectedMovieId === null) {
      // validation.js의 다른 안내와 같은 '~해 주세요' 말투로 맞춤.
      missing.push('사진을 연결할 영화를 선택해 주세요.');
    }
    // 아래 두 문장은 validateMedia()가 같은 경우에 내는 문장과 같음.
    if (selectedKind === null) {
      missing.push('사진 종류를 선택해 주세요.');
    }
    if (selectedFile === null) {
      missing.push('사진 파일을 선택해 주세요.');
    }
    // 하나라도 비어 있으면 저장하지 않고 안내만 보여줌.
    if (missing.length > 0) {
      // join(' ')은 배열의 문장들을 공백 하나로 이어 한 문자열로 만듦. movie.js도 같은 방식으로 이름을 이음.
      const missingText = missing.join(' ');
      // 폼 아래 안내(오류 표시)와 페이지 위쪽 알림에 같은 문구를 보여줌.
      setStatus(missingText, true);
      showMessage(missingText, 'error');
      return;
    }
    // manageMedia의 add 작업이 요구하는 내용 형식임: { movie_id, kind, file }.
    const payload = { movie_id: selectedMovieId, kind: selectedKind, file: selectedFile };
    setBusy(true);
    setStatus('사진을 저장하는 중입니다.', false);
    try {
      // 검사 → 용량 합계 확인 → 사진 정보(MediaAsset)와 원본(MediaBlob) 저장이 모두 끝날 때까지 기다림.
      await manageMedia(repo, catalog, 'add', payload);
    } catch (error) {
      // 저장하지 못했으면 고른 값은 그대로 두어 사용자가 고쳐서 다시 저장할 수 있게 함.
      const message = errorText(error);
      setBusy(false);
      // 폼 아래 안내(오류 표시)와 페이지 위쪽 알림에 같은 문구를 보여줌. movie.js와 같은 방식임.
      setStatus(message, true);
      showMessage(message, 'error');
      // 아래의 성공 처리를 건너뛰고 함수를 끝냄.
      return;
    }

    // 여기부터는 저장에 성공했을 때만 실행됨.
    // 같은 사진을 다시 저장하지 않도록 고른 파일은 비움. 영화와 종류는 남겨 두어 같은 영화의 사진을 연달아 올리기 쉽게 함.
    clearSelectedFile();
    // 지금 필터가 새 사진의 종류를 가리고 있다면 '전체'로 바꿔 방금 저장한 사진이 보이게 함.
    if (kindFilter !== 'all' && kindFilter !== payload.kind) {
      kindFilter = 'all';
    }
    setBusy(false);
    setStatus('', false);
    // 예: '티켓 사진을 보관함에 저장했습니다.'
    showMessage(kindLabel(payload.kind) + ' 사진을 보관함에 저장했습니다.');
    // 저장소를 다시 읽어 모아 보기와 사용량을 갱신하고, 다음 사진을 고를 수 있게 파일 입력으로 초점을 옮김.
    await refreshArchive(refresh, 'archive-file');
  }

  // 폼을 만들고 submit 이벤트에 savePhoto를 등록함. 저장 버튼 클릭과 Enter 제출이 모두 이 함수로 들어옴.
  const form = el('form', { id: 'archive-upload-form' });
  form.addEventListener('submit', savePhoto);
  // 왼쪽 열: 파일 입력과 미리보기임.
  const fileColumn = el('div', { className: 'archive-form-column' });
  fileColumn.append(fileField, preview);
  // 오른쪽 열: 종류 선택과 영화 찾기임.
  const movieColumn = el('div', { className: 'archive-form-column' });
  movieColumn.append(kindSet, movieField, resultCount, resultList, selectedText);
  // 두 열을 나란히 놓을 묶음임. 가로 폭이 좁으면 archive.css의 flex-wrap으로 위아래로 쌓임.
  const formGrid = el('div', { className: 'archive-form-grid' });
  formGrid.append(fileColumn, movieColumn);
  // 결과: form → [formGrid(div), actions(div), status(p)].
  form.append(formGrid, actions, status);

  // '사진 올리기' 영역 전체를 담을 section임.
  const panel = el('section', { className: 'archive-upload-panel' });
  const panelTitle = el('h2', {}, '사진 올리기');
  panel.append(panelTitle, form);
  return panel;
}

/*
 * buildViewer(): 사진을 크게 보여줄 창(dialog 요소)을 만들어 반환함.
 * 처음에는 비어 있고 닫혀 있음. 사진을 누르면 openViewer()가 내용을 채우고 엶.
 * dialog를 showModal()로 열면 브라우저가 다음을 기본으로 처리함.
 * → 창 바깥 페이지는 누를 수 없게 되고, 키보드 초점은 창 안의 버튼으로 옮겨지며, Esc 키를 누르면 창이 닫힘.
 * 창 바깥의 어두운 부분(::backdrop)을 눌렀을 때 닫는 것은 브라우저가 해 주지 않으므로 closeOnBackdrop()이 처리함.
 */
function buildViewer() {
  const viewer = el('dialog', { id: 'archive-viewer', className: 'archive-viewer' });
  // aria-labelledby로 창의 제목(h2)을 창 이름으로 연결함. 창이 열리면 화면 읽기 프로그램이 이 제목을 읽음.
  viewer.setAttribute('aria-labelledby', 'archive-viewer-title');
  // 제목에는 openViewer()가 '영화 제목 · 종류'를 넣음.
  const viewerTitle = el('h2', { id: 'archive-viewer-title' });
  const closeButton = el('button', { type: 'button', className: 'btn btn-link' }, '닫기');
  // 제목은 왼쪽 끝, 닫기 버튼은 오른쪽 끝에 두는 줄임.
  const viewerHeading = el('div', { className: 'archive-viewer-heading' });
  viewerHeading.append(viewerTitle, closeButton);
  // 큰 사진과 저장 정보를 넣을 자리임. id로 openViewer()가 찾아서 채움.
  const viewerImage = el('img', { id: 'archive-viewer-image', alt: '' });
  const viewerInfo = el('p', { id: 'archive-viewer-info' });
  // 창의 내용을 한 묶음(div)에 넣음. 창 안쪽 여백은 archive.css가 이 묶음에 줌.
  // → 창 안쪽 어디를 눌러도 이 묶음 또는 그 안의 요소가 눌리므로, 창 자체가 눌린 경우는 바깥 클릭뿐임.
  const viewerBody = el('div', { className: 'archive-viewer-body' });
  viewerBody.append(viewerHeading, viewerImage, viewerInfo);
  // 결과: viewer(dialog) → viewerBody(div) → [viewerHeading(div), viewerImage(img), viewerInfo(p)].
  viewer.append(viewerBody);

  // 닫기 버튼을 누르면 창을 닫음. close()는 dialog를 닫고 close 이벤트를 발생시킴.
  function closeViewer() {
    viewer.close();
  }

  /*
   * closeOnBackdrop(event): 창(dialog)에서 클릭이 일어나면 실행되며, 창 바깥을 누른 경우에만 창을 닫음.
   * 바깥의 어두운 부분(::backdrop)을 누르면 event.target(실제로 눌린 요소)이 dialog 자체가 됨.
   * 사진·제목·닫기 버튼을 누르면 event.target은 그 요소이므로 창이 닫히지 않음.
   */
  function closeOnBackdrop(event) {
    if (event.target === viewer) {
      viewer.close();
    }
  }

  /*
   * returnFocus(): 창이 닫히면(닫기 버튼 또는 Esc) 실행됨.
   * 창을 열었던 사진 버튼으로 키보드 초점을 돌려놓아, 키보드 사용자가 보던 위치를 잃지 않게 함.
   */
  function returnFocus() {
    // 비우기 전에 어느 사진이었는지 id를 먼저 만들어 둠. 예: 'archive-view-3f2a…'.
    const focusId = 'archive-view-' + viewingAssetId;
    viewingAssetId = null;
    const target = document.getElementById(focusId);
    if (target !== null) {
      target.focus();
    }
  }
  closeButton.addEventListener('click', closeViewer);
  viewer.addEventListener('click', closeOnBackdrop);
  // Esc 키나 바깥 클릭으로 닫을 때도 close 이벤트가 발생하므로 모든 경우에 returnFocus가 실행됨.
  viewer.addEventListener('close', returnFocus);
  return viewer;
}

/*
 * openViewer(catalog, asset, url): 크게 보기 창에 사진 한 장을 채우고 창을 엶.
 * asset: 저장소의 사진 정보 한 줄(asset_id, movie_id, kind, byte_size, created_at 등)임.
 * url: renderArchive가 사진 원본으로 만든 'blob:' 주소임.
 * 창이 이미 화면(문서)에 붙어 있어야 showModal()을 쓸 수 있으므로 요소를 id로 찾아서 사용함.
 */
function openViewer(catalog, asset, url) {
  const viewer = document.getElementById('archive-viewer');
  const title = movieTitle(catalog, asset.movie_id);
  const kind = kindLabel(asset.kind);
  // 어떤 사진을 띄웠는지 기억함. 화면을 다시 그릴 때와 창을 닫을 때 사용함.
  viewingAssetId = asset.asset_id;
  // 예: '기생충 · 티켓'.
  document.getElementById('archive-viewer-title').textContent = `${title} · ${kind}`;
  const image = document.getElementById('archive-viewer-image');
  image.src = url;
  // 예: '기생충 티켓 사진'. 목록의 작은 사진과 같은 대체 설명을 사용함.
  image.alt = `${title} ${kind} 사진`;
  // 예: '저장일 2026. 10. 29. · 1.2 MiB'.
  document.getElementById('archive-viewer-info').textContent = `저장일 ${savedDateText(asset.created_at)} · ${formatSize(asset.byte_size)}`;
  // 이미 열려 있는 창에 showModal()을 다시 호출하면 오류이므로 닫혀 있을 때만 엶.
  // !는 참·거짓을 뒤집는 연산자임. viewer.open이 false일 때 조건이 참이 됨.
  if (!viewer.open) {
    viewer.showModal();
  }
}

/*
 * restoreViewer(catalog, assets, photoUrls): 크게 보기 창이 열린 채로 화면을 다시 그렸으면 같은 사진으로 다시 엶.
 * 예: 사진을 크게 띄운 채 다른 탭에 갔다 돌아오면 boot()가 화면을 새로 그림 → 창이 사라졌다가 다시 열림.
 * 그 사진이 그사이 삭제되었거나 원본을 읽지 못했으면 다시 열지 않고 기억도 지움.
 */
function restoreViewer(catalog, assets, photoUrls) {
  // 띄운 사진이 없으면 할 일이 없음.
  if (viewingAssetId === null) {
    return;
  }
  for (const asset of assets) {
    // 같은 ID의 사진을 찾고, 원본 주소도 있는 경우에만 다시 엶.
    if (asset.asset_id === viewingAssetId && photoUrls[asset.asset_id] !== null) {
      openViewer(catalog, asset, photoUrls[asset.asset_id]);
      return;
    }
  }
  // 반복문이 끝까지 돌았다면 다시 띄울 사진이 없다는 뜻임.
  viewingAssetId = null;
}

/*
 * buildPhotoCard(context, asset, url): 사진 한 장의 카드(li)를 만들어 반환함.
 * 카드 구성: 사진(누르면 크게 보기) → 종류와 저장일 → 삭제 버튼.
 * url이 null이면 원본을 읽지 못한 사진이므로 사진 대신 안내를 보여주고 삭제 버튼만 남김.
 * 카드 모양은 movie.html의 사진 목록과 같은 common.css의 media-card를 사용함.
 */
function buildPhotoCard(context, asset, url) {
  const catalog = context.catalog;
  const repo = context.repo;
  const refresh = context.refresh;
  // 대체 설명과 확인 문구에 함께 쓸 영화 제목과 종류 이름임.
  const title = movieTitle(catalog, asset.movie_id);
  const kind = kindLabel(asset.kind);

  // figure는 사진과 그 설명(figcaption)을 한 묶음으로 나타내는 요소임.
  const figure = el('figure', { className: 'archive-figure' });
  if (url === null) {
    // 사진 정보는 있지만 원본(MediaBlob)을 읽지 못한 경우임. 삭제한 뒤 다시 올리도록 안내함.
    const failed = el('p', { className: 'archive-photo-error' }, '사진 원본을 읽지 못했습니다. 삭제한 뒤 다시 올려 주세요.');
    figure.append(failed);
  } else {
    // 사진을 버튼 안에 넣어 마우스 클릭뿐 아니라 키보드 Tab·Enter로도 크게 볼 수 있게 함.
    const viewButton = el('button', {
      // 크게 보기 창을 닫은 뒤 초점을 돌려놓을 때 찾는 id임. 예: 'archive-view-3f2a…'.
      id: 'archive-view-' + asset.asset_id,
      type: 'button',
      className: 'archive-view',
      // 버튼 안에는 사진만 있으므로 무엇을 하는 버튼인지 이름을 따로 붙임. 예: '기생충 티켓 사진 크게 보기'.
      ariaLabel: `${title} ${kind} 사진 크게 보기`
    });
    // aria-haspopup="dialog"는 이 버튼이 창(dialog)을 연다는 것을 보조 기술에 알려줌.
    viewButton.setAttribute('aria-haspopup', 'dialog');
    // alt 예: '기생충 티켓 사진'. loading: 'lazy'는 화면 근처에 올 때까지 이미지 표시를 미루는 브라우저 기능임.
    const image = el('img', { src: url, alt: `${title} ${kind} 사진`, loading: 'lazy' });
    viewButton.append(image);

    // 이번 카드의 asset과 url을 기억하는 클릭 함수임(클로저).
    function viewPhoto() {
      openViewer(catalog, asset, url);
    }
    viewButton.addEventListener('click', viewPhoto);
    figure.append(viewButton);
  }
  // 사진 아래의 설명: 굵은 종류 이름과 작은 저장일임. 예: '티켓' / '저장일 2026. 10. 29.'.
  const kindText = el('strong', {}, kind);
  const savedText = el('small', {}, '저장일 ' + savedDateText(asset.created_at));
  const caption = el('figcaption');
  caption.append(kindText, savedText);
  // figcaption은 figure의 첫째 또는 마지막 자식이어야 하므로 사진(또는 안내) 다음에 붙임.
  figure.append(caption);

  // 삭제 버튼임. 눈에 보이는 글자는 '삭제'이고, 보조 기술에는 어떤 사진을 지우는지까지 알려줌.
  // btn btn-link text-danger는 빨간 글자 버튼이며 movie.js의 감상 기록 삭제 버튼과 같은 모양임.
  // archive-delete는 setBusy()가 작업 중에 삭제 버튼을 찾아 잠글 때 쓰는 이름임.
  const deleteButton = el('button', {
    type: 'button',
    className: 'btn btn-link text-danger archive-delete',
    ariaLabel: `${title} ${kind} 사진 삭제`,
    disabled: busy
  }, '삭제');

  /*
   * deletePhoto(): 삭제 버튼을 누르면 실행됨.
   * confirm()으로 한 번 더 확인을 받은 뒤 manageMedia(..., 'delete', ...)로 사진 정보와 원본을 함께 지움.
   * 지운 뒤에는 화면을 다시 그리고 '모아 보기' 제목으로 초점을 옮김(지운 카드는 더 이상 없기 때문임).
   */
  async function deletePhoto() {
    if (busy) {
      return;
    }
    // confirm()은 확인·취소 버튼이 있는 브라우저 기본 창을 띄우고, 확인을 누르면 true를 반환함.
    // movie.js의 감상 기록 삭제와 같은 확인 방식임.
    const accepted = confirm(`${title} ${kind} 사진을 삭제할까요? 삭제한 사진은 되돌릴 수 없습니다.`);
    // 취소를 눌렀으면 아무것도 하지 않음.
    if (!accepted) {
      return;
    }
    setBusy(true);
    try {
      // 삭제는 사진 ID만 있으면 됨. 다른 프로필의 사진이면 repository.js가 오류를 냄.
      await manageMedia(repo, catalog, 'delete', { asset_id: asset.asset_id });
    } catch (error) {
      setBusy(false);
      showMessage(errorText(error), 'error');
      return;
    }
    setBusy(false);
    // 예: '기생충 티켓 사진을 삭제했습니다.'
    showMessage(`${title} ${kind} 사진을 삭제했습니다.`);
    await refreshArchive(refresh, 'archive-gallery-title');
  }
  deleteButton.addEventListener('click', deletePhoto);

  // 카드 하나는 목록 항목 li임. data-kind 속성은 종류 필터가 카드를 숨길지 정할 때 사용함.
  const card = el('li', { className: 'media-card archive-card', dataset: { kind: asset.kind } });
  // 결과: card(li) → [figure(사진·설명), deleteButton(button)].
  card.append(figure, deleteButton);
  return card;
}

/*
 * buildGallery(context, photoUrls): '모아 보기' 영역(사용량·종류 필터·영화별 사진 묶음)을 만들어 반환함.
 * photoUrls: { 사진 ID: 'blob:' 주소 또는 null } 형태의 객체임. renderArchive가 미리 만들어 넘김.
 * 종류 필터를 누르면 저장소를 다시 읽지 않고 이미 만든 카드에 hidden만 켜고 끔.
 * → 사진을 다시 불러오지 않으므로 필터를 바꿔도 화면이 깜빡이지 않음.
 */
function buildGallery(context, photoUrls) {
  const catalog = context.catalog;
  // readSnapshot()이 최근에 저장한 사진부터 정렬해 둔 사진 정보 배열임.
  const assets = context.snapshot.assets;

  // 사진 용량 합계(바이트)임.
  let totalBytes = 0;
  // 종류별 사진 수임. 필터 버튼의 '티켓 3장' 같은 글자에 사용함. 'all'은 전체 수임.
  const kindCounts = { all: 0 };
  // 모든 종류를 0으로 먼저 만들어 두어야 아래에서 += 1을 해도 NaN(숫자 아님)이 되지 않음.
  for (const kind of MEDIA_KINDS) {
    kindCounts[kind] = 0;
  }
  for (const asset of assets) {
    // byte_size는 저장할 때 기록한 파일 크기(바이트)임.
    totalBytes += asset.byte_size;
    kindCounts.all += 1;
    // 대괄호 [asset.kind]는 변수에 담긴 종류 이름을 속성 이름으로 사용한다는 뜻임.
    kindCounts[asset.kind] += 1;
  }

  // page-section과 section-heading은 common.css의 공통 클래스라 다른 페이지의 구역 제목과 모양이 같음.
  const section = el('section', { className: 'page-section archive-gallery' });
  const heading = el('div', { className: 'section-heading' });
  // tabIndex: -1은 Tab 순서에는 넣지 않지만 코드로 초점을 줄 수 있게 함. 사진을 삭제한 뒤 이 제목으로 초점을 옮김.
  const title = el('h2', { id: 'archive-gallery-title', tabIndex: -1 }, '모아 보기');
  // 예: '사용량 3.2 MiB / 50 MiB · 사진 5장', 사진이 없으면 '사용량 0.0 MiB / 50 MiB · 사진 0장'.
  // 합계는 formatUsage로 항상 MiB 단위로 적어 뒤의 '/ 50 MiB'와 단위를 맞춤. 50이라는 숫자도 validation.js의 값에서 구함.
  const usage = el('p', { className: 'archive-usage' }, `사용량 ${formatUsage(totalBytes)} / ${MEDIA_MAX_TOTAL_BYTES / bytesPerMiB} MiB · 사진 ${assets.length}장`);
  heading.append(title, usage);
  section.append(heading);

  // 저장한 사진이 하나도 없으면 안내만 보여주고 끝냄. 필터와 사진 묶음은 만들지 않음.
  if (assets.length === 0) {
    // 띄울 사진이 없으므로 크게 보기 기억도 지움.
    viewingAssetId = null;
    // empty-state는 common.css의 옅은 회색 바탕 안내 상자임.
    const empty = el('p', { className: 'empty-state' }, '아직 보관한 사진이 없습니다. 위의 사진 올리기에서 감상한 영화의 티켓이나 특전 포스터 사진을 저장해 보세요.');
    section.append(empty);
    return section;
  }

  // 종류 필터 버튼 묶음임. role='group'과 ariaLabel로 무엇을 고르는 버튼들인지 보조 기술에 알려줌.
  const filter = el('div', { className: 'archive-filter', role: 'group', ariaLabel: '사진 종류로 거르기' });
  // 필터 순서: 전체 → 티켓 → 포스터 → 기타. 전개 문법 대신 push로 배열을 이어 붙임.
  const filterKinds = ['all'];
  for (const kind of MEDIA_KINDS) {
    filterKinds.push(kind);
  }
  // '티켓 사진 3장을 보여줍니다.' 같은 현재 필터 안내임. 필터를 바꾸면 보조 기술이 알려줌.
  const filterSummary = el('p', { className: 'archive-filter-summary', ariaLive: 'polite' });
  // 고른 종류의 사진이 하나도 없을 때만 보여줄 안내임. 숨김 여부는 applyFilter()가 정함.
  const filterEmpty = el('p', { className: 'empty-state' }, '선택한 종류의 사진이 없습니다. 다른 종류를 눌러 보세요.');
  // 영화별 묶음마다 { section, count, cards }를 담아 두는 배열임. applyFilter()가 이 배열을 보고 숨김을 정함.
  const groupEntries = [];

  /*
   * applyFilter(): 현재 kindFilter에 맞게 카드·묶음을 보이거나 숨기고, 버튼 표시와 안내 문장을 갱신함.
   * hidden 속성이 true인 요소는 화면에서 사라지고 Tab 순서에서도 빠짐. 요소 자체를 지우는 것은 아님.
   * 예: '포스터'를 누름 → 포스터 카드만 남고, 포스터가 없는 영화의 묶음은 제목까지 숨겨짐.
   */
  function applyFilter() {
    // 지금 화면에 보이는 사진의 총 수임.
    let visibleTotal = 0;
    for (const entry of groupEntries) {
      // 이 영화 묶음에서 보이는 사진 수임.
      let visible = 0;
      for (const card of entry.cards) {
        // 전체 필터이거나 카드의 data-kind가 고른 종류와 같으면 보여줌. ||는 둘 중 하나라도 참이면 참임.
        if (kindFilter === 'all' || card.dataset.kind === kindFilter) {
          card.hidden = false;
          visible += 1;
        } else {
          card.hidden = true;
        }
      }
      // 보이는 사진이 없으면 묶음(영화 제목 포함)을 통째로 숨김. 비교 결과 true/false가 그대로 대입됨.
      entry.section.hidden = visible === 0;
      // 묶음 제목 옆의 개수도 필터 결과에 맞춤. 예: '사진 2장'.
      entry.count.textContent = `사진 ${visible}장`;
      visibleTotal += visible;
    }
    // 필터 버튼의 선택 표시를 바꿈. 고른 버튼만 aria-pressed="true"가 됨.
    for (const button of filter.children) {
      button.setAttribute('aria-pressed', String(button.dataset.kind === kindFilter));
    }
    // 보이는 사진이 하나라도 있으면 '사진이 없습니다' 안내를 숨김.
    filterEmpty.hidden = visibleTotal > 0;
    // 예: '전체 사진 5장을 보여줍니다.', '포스터 사진 0장을 보여줍니다.'
    filterSummary.textContent = `${filterLabel(kindFilter)} 사진 ${visibleTotal}장을 보여줍니다.`;
  }

  // 필터 버튼을 전체·티켓·포스터·기타 순서로 만듦.
  for (const kind of filterKinds) {
    const filterButton = el('button', {
      // 예: 'archive-filter-poster'.
      id: 'archive-filter-' + kind,
      type: 'button',
      className: 'btn btn-link',
      // applyFilter()가 선택 표시를 비교할 종류 이름임.
      dataset: { kind: kind }
    }, `${filterLabel(kind)} ${kindCounts[kind]}장`);

    // 이번 반복의 kind를 기억하는 클릭 함수임(클로저).
    function pickFilter() {
      // 모듈 범위에 기억하므로 사진을 저장·삭제해 화면을 다시 그려도 같은 필터가 유지됨.
      kindFilter = kind;
      applyFilter();
    }
    filterButton.addEventListener('click', pickFilter);
    filter.append(filterButton);
  }

  // 영화별 묶음을 만듦. groups는 묶음 배열, groupByMovie는 영화 ID로 묶음을 빨리 찾기 위한 객체임.
  const groups = [];
  const groupByMovie = {};
  for (const asset of assets) {
    // 이 영화의 묶음이 아직 없으면 새로 만듦.
    if (groupByMovie[asset.movie_id] === undefined) {
      const group = { title: movieTitle(catalog, asset.movie_id), movie_id: asset.movie_id, assets: [] };
      groupByMovie[asset.movie_id] = group;
      groups.push(group);
    }
    // 묶음의 사진 배열에 추가함. assets가 최근 저장 순이므로 묶음 안에서도 최근 사진이 앞에 옴.
    groupByMovie[asset.movie_id].assets.push(asset);
  }
  // 묶음끼리는 영화 제목의 가나다순으로 정렬함. 이 함수가 새로 만든 배열이라 원본 자료에는 영향이 없음.
  groups.sort(compareGroups);

  // 영화별 묶음들을 세로로 쌓을 묶음임. 간격은 archive.css의 gap이 정함.
  const groupList = el('div', { className: 'archive-groups' });
  for (const group of groups) {
    // 영화 제목 h3임. 영화 정보가 있으면 상세 페이지로 가는 링크를 넣음.
    const groupTitle = el('h3');
    if (catalog.lookup.movieById.has(group.movie_id)) {
      // encodeURIComponent는 영화 ID의 특수문자가 URL 구분자로 잘못 해석되지 않도록 함.
      const movieLink = el('a', { href: `movie.html?id=${encodeURIComponent(group.movie_id)}` }, group.title);
      groupTitle.append(movieLink);
    } else {
      // catalog.json에서 빠진 영화이면 링크 없이 '영화 정보 없음'만 보여줌.
      groupTitle.textContent = group.title;
    }
    // 묶음의 사진 수임. 글자는 applyFilter()가 채움.
    const groupCount = el('p');
    const groupHeading = el('div', { className: 'archive-group-heading' });
    groupHeading.append(groupTitle, groupCount);

    // 사진 카드 목록임. media-grid는 common.css의 3열 격자이고, archive-photo-list가 목록 기호를 없앰.
    const photoList = el('ul', { className: 'media-grid archive-photo-list' });
    // 이 묶음의 카드들을 applyFilter()에서 다시 찾지 않도록 배열에 모아 둠.
    const cards = [];
    for (const asset of group.assets) {
      const card = buildPhotoCard(context, asset, photoUrls[asset.asset_id]);
      photoList.append(card);
      cards.push(card);
    }

    const groupSection = el('section', { className: 'archive-group' });
    groupSection.append(groupHeading, photoList);
    groupList.append(groupSection);
    // 필터에 필요한 요소들을 객체 하나로 묶어 기억함.
    groupEntries.push({ section: groupSection, count: groupCount, cards: cards });
  }

  // 결과: section → [heading, filter, filterSummary, groupList, filterEmpty].
  section.append(filter, filterSummary, groupList, filterEmpty);
  // 처음 화면에도 기억한 필터를 적용함. 함수 선언은 위에 있으므로 여기서 호출할 수 있음.
  applyFilter();
  return section;
}

/*
 * renderArchive(context): 사진 보관함 페이지 본문 전체를 만듦.
 * context는 ui.js의 boot()가 전달하는 객체임. 최초 실행과 refresh()를 호출했을 때 이 함수가 다시 실행됨.
 * 반환값: 이번 화면에서 만든 사진 주소를 해제하는 함수(releasePhotos)임.
 * → boot()는 다음 화면을 그리기 직전과 페이지를 떠날 때(pagehide) 이 함수를 호출함. movie.js와 같은 방식임.
 * async 함수이므로 사진 원본을 모두 읽을 때까지 기다린 뒤 화면을 한 번에 교체함.
 */
async function renderArchive(context) {
  // app: HTML의 <main id="app"> 요소. 완성한 본문을 넣을 자리임.
  const app = context.app;
  const catalog = context.catalog;
  const repo = context.repo;
  const snapshot = context.snapshot;

  // 주소로 넘어온 영화 ID가 catalog에 없는 값이면 선택을 비우고 안내함. 예: archive.html?movie_id=m999
  // 한 번 비우면 null이 되므로 화면을 다시 그려도 이 안내가 반복되지 않음.
  if (selectedMovieId !== null && !catalog.lookup.movieById.has(selectedMovieId)) {
    selectedMovieId = null;
    const notFoundText = '주소에 있는 영화를 찾지 못했습니다. 영화 찾기에서 다시 선택해 주세요.';
    // 폼 아래 안내는 저장 버튼 근처라 첫 화면에서 보이지 않을 수 있음.
    // 그래서 페이지 위쪽 알림에도 같은 문구를 띄워, 들어오자마자 '선택한 영화: 없음'인 이유를 알 수 있게 함.
    setStatus(notFoundText, true);
    showMessage(notFoundText, 'error');
  }

  // 이번 화면에서 만든 'blob:' 주소 목록임. 나중에 한꺼번에 해제하기 위해 모아 둠.
  const objectUrls = [];
  // 사진 ID → 주소(또는 읽기 실패 시 null)임. 카드와 크게 보기 창이 함께 사용함.
  const photoUrls = {};
  // 저장소의 사진 정보(MediaAsset)에는 원본이 없으므로 한 장씩 manageMedia의 read 작업으로 원본(Blob)을 꺼냄.
  for (const asset of snapshot.assets) {
    try {
      // await로 한 장씩 차례대로 읽음. 반환값은 이미지 파일 내용을 담은 Blob 객체임.
      const blob = await manageMedia(repo, catalog, 'read', { asset_id: asset.asset_id });
      // Blob을 img의 src에 넣을 수 있는 주소로 바꿈.
      const url = URL.createObjectURL(blob);
      objectUrls.push(url);
      photoUrls[asset.asset_id] = url;
    } catch (error) {
      // 한 장을 읽지 못해도 나머지 사진은 보여줌. 이 사진의 카드에는 안내와 삭제 버튼만 표시됨.
      photoUrls[asset.asset_id] = null;
    }
  }

  // 이번 화면의 사진 주소를 모두 해제하는 함수임. 아래에서 boot()에 반환함.
  function releasePhotos() {
    for (const url of objectUrls) {
      URL.revokeObjectURL(url);
    }
    // 배열의 길이를 0으로 만들면 내용이 모두 비워짐. 두 번 호출되어도 같은 주소를 다시 해제하지 않음.
    objectUrls.length = 0;
  }

  // 페이지 제목과 소개 문장을 담을 묶음임.
  const heading = el('div', { className: 'page-heading' });
  // 영화 상세 페이지에서 넘어왔으면(주소의 영화가 실제로 있으면) 그 상세 페이지로 돌아가는 링크를 맨 위에 둠.
  if (linkedMovieId !== null && catalog.lookup.movieById.has(linkedMovieId)) {
    // back-link는 common.css에서 movie.html의 '← 영화 목록' 링크에 쓰는 클래스임. 예: '← 기생충 상세 정보'.
    const backLink = el('a', { href: `movie.html?id=${encodeURIComponent(linkedMovieId)}`, className: 'back-link' }, '← ' + movieTitle(catalog, linkedMovieId) + ' 상세 정보');
    heading.append(backLink);
  }
  const pageTitle = el('h1', {}, '사진 보관함');
  const description = el('p', { className: 'muted' }, '감상한 영화의 티켓·특전 포스터 사진을 영화별로 모아 보관합니다. 사진은 현재 브라우저에만 저장됩니다.');
  heading.append(pageTitle, description);

  // 세 영역을 각각의 함수로 만듦.
  const uploadPanel = buildUploadPanel(context);
  const gallery = buildGallery(context, photoUrls);
  const viewer = buildViewer();
  // replaceChildren은 app 자체는 유지하고 기존 본문 자식만 새 요소들로 교체함.
  // 결과: app(main) → [heading, uploadPanel, gallery, viewer]. viewer(dialog)는 닫혀 있으면 화면에 보이지 않음.
  app.replaceChildren(heading, uploadPanel, gallery, viewer);
  // 창은 문서에 붙은 뒤에만 열 수 있으므로 교체가 끝난 다음에 다시 열기를 확인함.
  restoreViewer(catalog, snapshot.assets, photoUrls);
  // 함수 자체를 반환함. releasePhotos()처럼 ()를 붙이면 지금 바로 주소가 해제되어 사진이 보이지 않게 됨.
  return releasePhotos;
}

// 준비 함수에 화면을 그릴 함수의 이름을 전달함. renderArchive()로 즉시 호출하지 않음.
// boot가 데이터 준비를 마치면 renderArchive(context)를 호출하여 처음 화면을 만듦.
boot({
  // 공통 메뉴에서 '사진 보관함' 항목을 '현재'로 표시할 때 사용할 구분값임. ui.js의 메뉴 목록에 'archive'가 있음.
  page: 'archive',
  // 브라우저 탭에 표시할 제목임. 화면 h1은 renderArchive에서 별도로 만듦.
  title: '사진 보관함',
  // 자료 준비 후 실행할 함수 자체를 넘김. boot가 context를 전달해 호출함.
  render: renderArchive
});
