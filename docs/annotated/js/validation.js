/**
 * [이 파일의 역할: 저장하기 전에 입력값이 규칙에 맞는지 검사]
 * validation.js는 감상 날짜·별점·감상평과 사진 파일을 검사함.
 * 검사 성공 시 저장하기 알맞게 정리한 데이터를 반환하고, 실패 시 오류를 던짐.
 * 이 파일에서 HTML을 바꾸거나 IndexedDB에 저장하지는 않음.
 * 호출한 화면/저장소 코드가 반환값을 저장하거나 오류 메시지를 표시함.
 * 영화 상세 화면에서 받은 입력은 repository.js의 mutateWatchLog()를 거쳐 validateWatchLog()로 전달됨.
 * 사진 검사 함수도 준비되어 있지만 현재 사진 보관함 화면 자체는 별도 구현 대상임.
 *
 * export는 다른 파일이 import하여 사용할 수 있게 내보내는 문법임.
 * 함수 이름에 validate가 붙었다고 JavaScript가 자동으로 검사하는 것은 아님.
 * 아래에 작성된 조건들이 이 프로젝트의 구체적인 검사 규칙임.
 */

// 사진 한 장의 제한 크기임. 1 MiB = 1024 × 1024바이트이므로 5 MiB를 뜻함.
// const는 변수 재대입을 금지함. 대문자+밑줄 이름은 상수에 자주 사용하는 관례임.
export const MEDIA_MAX_FILE_BYTES = 5 * 1024 * 1024;

// 사진 전체 제한 50 MiB임. 이 파일은 그 기준만 내보냄.
// 기존에 저장된 사진 크기까지 더하는 실제 전체 용량 검사는 repository.js가 담당함.
export const MEDIA_MAX_TOTAL_BYTES = 50 * 1024 * 1024;

// 사진 종류에 허용하는 값: ticket(티켓), poster(포스터), other(기타).
// Object.freeze()는 배열 항목을 추가·삭제·교체하지 못하도록 얕게 동결함.
// const만으로는 배열 내용 변경을 막지 못하므로 freeze를 함께 사용함.
export const MEDIA_KINDS = Object.freeze(['ticket', 'poster', 'other']);

/**
 * fieldError(fields): 항목별 오류 문구를 Error 객체 하나로 묶음.
 * fields 예: { rating: '별점 안내', watched_on: '날짜 안내' }.
 * 반환 객체에는 전체 문장 message, 오류 종류 name, 항목별 상세 fields가 있음.
 * 이 함수 자체는 throw하지 않음. 호출한 곳에서 throw fieldError(...)로 던짐.
 */
function fieldError(fields) {
  // Object.values()는 속성 값인 안내 문구들만 꺼내 배열로 만듦.
  // join(' ')은 그 문구들을 공백 한 칸으로 이어 하나의 문자열로 만듦.
  // new Error(문구)는 message에 문구를 담은 오류 객체를 만듦.
  const error = new Error(Object.values(fields).join(' '));

  // 이름만 'ValidationError'로 지정한 Error 객체임. 별도 클래스를 선언한 것은 아님.
  // fields는 사용자 정의 속성으로, 화면에서 어떤 입력란에 문제가 있는지 알 수 있게 함.
  // Error의 기본 이름을 바꿔, 호출한 코드가 일반 오류와 입력 검증 오류를 이름으로 구분할 수 있게 함.
  error.name = 'ValidationError';
  // 전체 문장뿐 아니라 { watched_on: '...', rating: '...' } 같은 항목별 안내도 함께 전달함.
  // 객체를 깊게 복사하지 않고 전달받은 fields 객체를 그대로 가리키게 함.
  error.fields = fields;
  // 만들어진 오류 객체를 반환함. 이 줄만으로 예외가 발생하지는 않으며, 호출자가 throw할 때 흐름이 중단됨.
  return error;
}

/**
 * isValidCalendarDate(value): 'YYYY-MM-DD' 형식이며 실제 존재하는 날짜인지 검사함.
 * 결과는 true 또는 false임. 저장값을 Date 객체나 UTC 시각으로 바꾸지 않음.
 * 예: '2026-10-11'은 true, '2026-2-3'은 형식 오류로 false,
 * '2026-02-30'은 존재하지 않는 날짜이므로 false임.
 */
export function isValidCalendarDate(value) {
  // typeof는 자료형을 문자열로 반환함. ||는 앞 조건이 참이면 뒤 조건을 실행하지 않음.
  // 따라서 문자열이 아닌 입력은 정규식을 검사하기 전에 바로 false가 됨.
  // /^\d{4}-\d{2}-\d{2}$/는 날짜 모양을 검사하는 정규식임.
  // ^는 처음, $는 끝, \d는 숫자 한 자리, {4}/{2}는 정확한 반복 횟수임.
  // test(value)는 문자열이 정규식에 맞는지 true/false로 반환함.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  // split('-')는 '2026-10-11'을 ['2026', '10', '11']로 나누고, 그 배열을 parts에 넣음.
  // 위에서 YYYY-MM-DD 형식을 확인했으므로 연도·월·일 세 부분을 각각 읽을 수 있음.
  const parts = value.split('-');
  // 배열 위치는 0부터 시작함. parts[0]은 연도, parts[1]은 월, parts[2]는 일 문자열임.
  // Number()로 각각 숫자로 바꿔 아래 범위 검사와 Date 객체의 날짜 지정에 사용함.
  // 첫 번째 문자열(예: '2026')을 숫자 연도 2026으로 바꿈.
  const year = Number(parts[0]);
  // 두 번째 문자열(예: '10')을 숫자 월 10으로 바꿈. 여기서는 아직 사람 기준 1~12를 사용함.
  const month = Number(parts[1]);
  // 세 번째 문자열(예: '12')을 숫자 날짜 12로 바꿈.
  const day = Number(parts[2]);

  // 먼저 넓은 범위를 검사함. 이 단계만으로는 2월 30일 같은 날짜를 걸러낼 수 없음.
  // 입력 형식이 네 자리 연도이므로 이 함수에서 허용하는 연도는 0001~9999임.
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false;

  // 실제 존재 여부는 임시 Date 객체에 날짜를 넣고 다시 꺼내어 확인함.
  // new Date(0)은 기준 시각(Unix epoch)의 객체를 만들며, 곧 원하는 날짜로 바꿈.
  // setHours(0, 0, 0, 0)은 로컬 시각의 시/분/초/밀리초를 0으로 맞춤.
  const date = new Date(0);
  // 위에서 만든 임시 Date 객체의 시각 부분만 로컬 자정으로 맞춤. 사용자 기록을 저장하거나 변경하는 명령은 아님.
  date.setHours(0, 0, 0, 0);

  // JavaScript의 월 번호는 0~11이므로 입력 월에서 1을 뺌.
  // setFullYear()는 1~99년을 의도한 그대로 지정할 수 있음.
  // new Date(year, ...)를 쓰면 0~99년을 1900년대로 해석하는 특성이 있어 이 방식을 씀.
  // Date는 2월 30일 등을 다음 달로 자동 보정하므로 아래에서 원래 값과 다시 비교함.
  date.setFullYear(year, month - 1, day);

  // ===는 값과 자료형이 같은지 비교하고, &&는 세 조건 모두 참이어야 true가 됨.
  // 이 함수는 로컬 달력 필드를 확인할 뿐, YYYY-MM-DD를 ISO 시각으로 변환해 저장하지 않음.
  // getFullYear(): 보정 후 연도가 입력 연도와 같은지 확인함.
  // getMonth(): 보정 후 0부터 시작하는 월이 입력 월-1과 같은지 확인함.
  // getDate(): 보정 후 일이 입력 일과 같은지 확인함. 세 개 중 하나라도 다르면 false임.
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/**
 * validateWatchLog(payload, catalog): 감상 기록 입력을 검사하고 정리함.
 * payload: 화면에서 받은 movie_id, watched_on, rating, review_text를 담은 객체.
 * catalog: 영화 ID가 실제 목록에 있는지 확인할 영화 자료.
 * 반환값: { movie_id, watched_on, rating, review_text }.
 * 별점/감상평은 비워 둘 수 있으며, 빈 값은 null로 통일함.
 * 입력 객체 자체를 수정하지 않고 새 객체를 반환함.
 * 기록 ID·프로필 ID·생성/수정 시각 등은 저장소 코드에서 처리함.
 */
export function validateWatchLog(payload, catalog) {
  // 첫 오류에서 바로 끝내지 않고 여러 입력란의 오류를 모으는 객체임.
  // 오류 항목 이름(예: rating 또는 file)을 속성으로, 해당 안내 문장을 값으로 모으는 빈 객체임.
  const fields = {};

  // ??는 왼쪽이 null/undefined이면 오른쪽 값을 사용함.
  // payload가 빠졌을 때도 빈 객체의 속성을 검사하여 안내 오류를 만들 수 있게 함.
  const input = payload ?? {};

  // 먼저 영화 ID가 문자열인지 검사함. &&의 왼쪽이 false면 뒤 조회는 하지 않음.
  // ?.는 조회용 객체나 Map이 없을 때 undefined를 반환하도록 함.
  // Map.has(ID)가 사용 가능하면 그 결과를 쓰고, 없으면 Movie 배열의 some()으로 검색함.
  // ??는 false를 바꾸지 않으므로 Map에 ID가 없다는 false가 나오면 그대로 실패임.
  // some()은 조건을 만족하는 항목이 하나라도 있으면 true임.
  const movieExists = typeof input.movie_id === 'string'
    && (catalog.lookup?.movieById?.has(input.movie_id) ?? catalog.Movie.some(movie => movie.movie_id === input.movie_id));
  // 영화가 없으면 movie_id 항목의 오류를 기록함. 아직 throw하지 않아 날짜·별점 오류도 함께 모을 수 있음.
  if (!movieExists) fields.movie_id = '목록에 있는 영화를 선택해 주세요.';

  // 날짜가 실제 존재하는지 위 함수를 호출함. 미래 날짜 금지 등의 추가 제한은 없음.
  if (!isValidCalendarDate(input.watched_on)) fields.watched_on = '실제 존재하는 감상 날짜를 입력해 주세요.';

  // 별점의 초기값 null은 '아직 별점을 입력하지 않음'임. 0점과 구분함.
  // let은 아래에서 숫자로 다시 대입할 수 있는 변수, const는 재대입하지 않을 변수임.
  let rating = null;
  // HTML select의 value는 보통 '4.5' 같은 문자열임. 숫자로 바꾸기 전 원래 입력값을 보관함.
  const rawRating = input.rating;

  // null, undefined, 빈 문자열, 공백만 있는 문자열은 모두 미입력으로 인정함.
  // trim()은 앞뒤 공백을 지움. 문자열일 때만 trim을 실행하도록 &&로 연결함.
  const blankRating = rawRating === null || rawRating === undefined
    || (typeof rawRating === 'string' && rawRating.trim() === '');
  // 입력된 값이 있을 때만 별점 수치 검사를 함. 미입력이면 위의 rating=null을 그대로 사용함.
  if (!blankRating) {
    // 숫자와 문자열 이외 값(예: true, 배열, 객체)은 별점으로 받지 않음.
    // !== 조건을 &&로 연결했으므로 두 자료형 모두 아닐 때 오류가 됨.
    if (typeof rawRating !== 'number' && typeof rawRating !== 'string') {
      // rating 속성에 안내를 모음. 입력이 잘못됐다는 뜻이며, 사용자 별점을 이 문장으로 저장하는 것은 아님.
      fields.rating = '별점은 0.5부터 5까지 0.5 단위로 입력해 주세요.';
    } else {
      // HTML 입력 요소의 value는 보통 문자열이므로 Number('4.5')처럼 숫자로 바꿈.
      // 숫자로 해석할 수 없는 문자열은 NaN이 되며 다음 검사에서 거절함.
      rating = Number(rawRating);

      // Number.isFinite(): NaN·Infinity가 아닌 유한한 숫자인지 검사함.
      // 0.5 <= 별점 <= 5여야 하며, 두 배 했을 때 정수이면 0.5 단위임.
      // 예: 4.5 × 2 = 9(통과), 4.3 × 2 = 8.6(실패).
      if (!Number.isFinite(rating) || rating < 0.5 || rating > 5 || !Number.isInteger(rating * 2)) {
        fields.rating = '별점은 0.5부터 5까지 0.5 단위로 입력해 주세요.';
      }
    }
  }

  // 감상평은 선택 입력임. 입력한 경우에는 문자열이어야 함.
  let review_text = null;
  // 감상평 항목이 들어 있을 때만 검사함. 항목이 없거나 null이면 review_text 초기값 null을 유지함.
  if (input.review_text !== undefined && input.review_text !== null) {
    // 문자열이어야 trim()으로 다룰 수 있음. 숫자·배열·객체 등은 자동 문자열 변환 대신 입력 오류로 기록함.
    if (typeof input.review_text !== 'string') fields.review_text = '감상평은 글자로 입력해 주세요.';

    // ||는 항상 true/false를 반환하는 연산자가 아님.
    // trim 결과가 비어 있지 않으면 그 문자열을, 빈 문자열이면 오른쪽 null을 반환함.
    // 글 중간의 공백·줄바꿈은 유지하고 앞뒤 공백만 정리함.
    // 이 단계는 HTML 처리/보안 필터가 아니므로 화면 출력 시에는 textContent 등으로 표시함.
    else review_text = input.review_text.trim() || null;
  }

  // Object.keys()는 속성 이름 배열임. length가 0이 아니면 오류 항목이 있다는 뜻임.
  // throw는 정상 반환을 중단하고 호출한 쪽의 try/catch로 오류를 전달함.
  if (Object.keys(fields).length) throw fieldError(fields);

  // rating, review_text는 같은 이름의 변수를 값으로 넣는 축약 표기임.
  // 입력에 다른 속성이 있어도 아래 네 속성만 정리하여 반환함.
  // movie_id는 검사한 영화 번호, watched_on은 실제 날짜인지 확인한 YYYY-MM-DD 문자열임.
  // rating은 정리한 숫자 또는 null, review_text는 앞뒤 공백을 정리한 문자열 또는 null임.
  // expected_version이나 log_id가 입력에 있어도 여기서 복사하지 않음. 저장소 코드가 별도로 검사·관리함.
  return { movie_id: input.movie_id, watched_on: input.watched_on, rating, review_text };
}

/**
 * detectImageMime(bytes): 파일 앞부분 바이트에서 이미지 형식의 서명을 찾음.
 * bytes는 Uint8Array이며 원소 하나가 0~255의 바이트 값임.
 * 반환값은 'image/png', 'image/jpeg', 'image/webp' 또는 판별 불가를 뜻하는 null임.
 * MIME은 데이터 종류를 나타내는 표준 문자열임. 확장자(.jpg 등)만 보고 판단하지 않음.
 * 단, 시작 서명이 맞는다고 전체 파일이 정상이라는 뜻은 아니므로 이후 디코딩도 검사함.
 */
function detectImageMime(bytes) {
  // PNG의 고정된 앞 8바이트와 비교함.
  // every()는 모든 원소가 조건을 만족해야 true이며, 하나라도 다르면 검사를 끝냄.
  // (value, index)에서 value는 기대하는 숫자, index는 그 숫자의 위치임.
  // bytes.length 확인을 먼저 하여 필요한 바이트가 실제 존재하는지 확인함.
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return 'image/png';

  // JPEG 파일 시작의 FF D8 FF를 십진수 255, 216, 255로 비교함.
  // 여기서 일치하면 즉시 반환하므로 아래 WebP 검사는 실행하지 않음.
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';

  // WebP는 앞 네 바이트가 ASCII 'RIFF', 8~11번째 바이트가 'WEBP'인 형식을 사용함.
  // [82, 73, 70, 70]과 [87, 69, 66, 80]은 그 글자들의 바이트 값임.
  // 가운데 4~7번 위치는 길이 정보이므로 이 간단한 형식 판별에서는 비교하지 않음.
  if (bytes.length >= 12
    && [82, 73, 70, 70].every((value, index) => bytes[index] === value)
    && [87, 69, 66, 80].every((value, index) => bytes[index + 8] === value)) return 'image/webp';
  // 허용한 세 형식 어느 것에도 해당하지 않으면 null을 반환함.
  return null;
}

/**
 * verifyImageDecodes(blob): 브라우저가 실제 이미지로 읽을 수 있는지 확인함.
 * Blob은 파일 내용 같은 바이너리 데이터를 보관하는 객체이며 File도 Blob의 하위 형식임.
 * async 함수는 Promise를 반환함. 성공하면 값 없이 완료되고, 실패하면 거부됨.
 * await는 작업 완료를 기다리지만 브라우저 전체를 멈추지는 않음.
 * 이미지가 열리는지 검사할 뿐 업로드·저장·서버 전송을 하지는 않음.
 */
async function verifyImageDecodes(blob) {
  // createImageBitmap을 사용할 수 있는 브라우저에서는 그 함수로 이미지 데이터를 해석함.
  // typeof 검사는 해당 전역 이름이 없는 환경에서도 참조 오류 없이 지원 여부를 확인함.
  if (typeof createImageBitmap === 'function') {
    // Blob 전체를 해석해 ImageBitmap 객체가 준비될 때까지 기다림.
    // 해석 실패로 Promise가 거부되면 이 줄에서 오류가 나며 호출자 validateMedia()의 catch로 전달됨.
    const bitmap = await createImageBitmap(blob);
    try {
      // 가로·세로가 0인 이미지는 정상 이미지로 인정하지 않음.
      // !0은 true이므로 둘 중 하나라도 0이면 오류를 던짐.
      if (!bitmap.width || !bitmap.height) throw new Error('이미지 크기가 없습니다.');
    } finally {
      // finally는 try가 성공해도 오류가 나도 실행됨.
      // 확인이 끝난 ImageBitmap의 자원을 close()로 해제함.
      bitmap.close();
    }

    // 이 경로에서 성공했다면 함수 종료. 아래의 대체 방식은 실행하지 않음.
    return;
  }

  // createImageBitmap이 없으면 Image 객체로 로딩하여 확인함.
  // 둘 다 없는 환경에서는 검사를 수행할 수 없으므로 실패로 처리함.
  if (typeof Image !== 'function') throw new Error('이 환경에서는 이미지 내용을 확인할 수 없습니다.');

  // createObjectURL()은 메모리의 Blob을 가리키는 임시 blob: 주소를 만듦.
  // 서버의 공개 URL이 아니며, IndexedDB에 저장할 영구 파일 경로로 사용하면 안 됨.
  const objectUrl = URL.createObjectURL(blob);
  try {

    // Image의 이벤트 방식 작업을 Promise로 감싸 await로 기다릴 수 있게 함.
    // resolve()는 성공 완료, reject(오류)는 실패 완료를 알림.
    await new Promise((resolve, reject) => {
      // 아직 DOM에 붙지 않은 이미지 요소 객체를 만듦. 아래 이벤트로 로딩 결과만 확인함.
      const image = new Image();

      // onload: 이미지가 읽힌 뒤 실행함. naturalWidth/Height는 원본 이미지 크기임.
      // 조건 ? resolve() : reject(...)는 크기가 있으면 성공, 없으면 실패시키는 삼항 연산임.
      image.onload = () => image.naturalWidth > 0 && image.naturalHeight > 0 ? resolve() : reject(new Error('이미지 크기가 없습니다.'));

      // onerror: 이미지 로딩 또는 해석이 실패했을 때 실행함.
      image.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.'));

      // 핸들러를 먼저 등록한 뒤 src를 지정하여 읽기를 시작함.
      // DOM에 image를 붙이지 않으므로 검사 중 화면에 사진이 나타나지는 않음.
      image.src = objectUrl;
    });
  } finally {

    // 성공/실패에 관계없이 임시 주소를 해제함. 원본 파일/Blob 자체를 삭제하는 것은 아님.
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * validateMedia(file, kind): 사진 하나를 저장할 수 있는지 비동기로 검사함.
 * file은 파일 입력 등으로 받은 File 객체를 기대하고 kind는 사진 종류 문자열임.
 * 성공 시 { blob, mime_type, byte_size, kind }를 담은 Promise를 반환함.
 * 호출한 곳에서는 const media = await validateMedia(file, kind)처럼 결과를 받음.
 *
 * 검사 순서: 종류/파일 여부/크기 → 파일 시작 서명과 MIME 일치 → 이미지 디코딩.
 * 바이러스 검사나 모든 악성 파일에 대한 안전 보장은 아님.
 * 사진 총용량, 사진을 연결할 영화, 사용자 권한 등의 검사는 이 함수의 역할이 아님.
 */
export async function validateMedia(file, kind) {
  // 오류 항목 이름(예: rating 또는 file)을 속성으로, 해당 안내 문장을 값으로 모으는 빈 객체임.
  const fields = {};

  // 배열의 includes()는 지정한 값이 허용 목록 안에 있는지 검사함.
  // kind가 ticket/poster/other 중 하나가 아니면 종류 입력의 오류를 기록함.
  if (!MEDIA_KINDS.includes(kind)) fields.kind = '사진 종류를 선택해 주세요.';

  // instanceof는 객체가 Blob 종류인지 확인함. File은 Blob을 상속하므로 통과함.
  // 또한 name이 문자열인지 검사하지만, 이 조건만으로 반드시 File 객체라고 증명하지는 않음.
  // 앞 조건이 실패하면 ||가 뒤 검사를 생략하여 file.name을 잘못 읽는 것을 방지함.
  // else if이므로 파일 종류가 정상일 때만 size를 검사함. size의 단위는 바이트임.
  if (!(file instanceof Blob) || typeof file.name !== 'string') fields.file = '사진 파일을 선택해 주세요.';
  // 파일처럼 보이는 객체라도 내용이 0바이트면 처리하지 않음. 앞의 파일 여부 검사를 통과했을 때만 실행함.
  else if (file.size === 0) fields.file = '빈 파일은 저장할 수 없습니다.';
  // 한 장의 크기가 상수로 정한 5 MiB를 초과하는지 확인함. 정확히 같은 크기는 허용함.
  else if (file.size > MEDIA_MAX_FILE_BYTES) fields.file = '사진 한 장은 5 MiB 이하여야 합니다.';

  // 간단한 검사에서 오류가 있으면 파일 내용을 읽기 전에 종료함.
  // async 안에서 throw하면 반환한 Promise가 거부되므로 호출부에서 await와 try/catch로 처리함.
  if (Object.keys(fields).length) throw fieldError(fields);

  // file.slice(0, 12)는 원본의 앞 12바이트 구간을 담은 Blob을 만듦. 원본을 잘라내지 않음.
  // arrayBuffer()는 그 내용을 비동기로 읽고 await는 읽기 완료를 기다림.
  // Uint8Array는 ArrayBuffer를 바이트 단위 숫자로 읽을 수 있는 뷰임.
  // 서명 판별에는 앞부분만 필요하지만 뒤 디코딩 검사에서는 전체 이미지를 읽음.
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  // 앞에서 읽은 바이트 배열을 서명 검사 함수에 전달해 'image/png' 등의 문자열 또는 null을 받음.
  const mime_type = detectImageMime(bytes);

  // 실제 시작 서명으로 판단한 형식과 브라우저가 알려준 file.type이 같아야 함.
  // toLowerCase()는 대소문자를 통일함. file.type이 비어 있거나 형식이 다르면 거절함.
  // 파일 이름을 .png로 바꾸는 것만으로는 통과하지 못함.
  if (!mime_type || file.type.toLowerCase() !== mime_type) {
    throw fieldError({ file: '실제 형식이 일치하는 JPEG, PNG 또는 WebP 사진을 선택해 주세요.' });
  }
  try {
    // 서명은 맞아도 뒤쪽 데이터가 손상될 수 있으므로 실제 해석 가능 여부를 추가 확인함.
    await verifyImageDecodes(file);
  } catch {
    // catch 뒤에 오류 변수를 적지 않아도 됨. 내부 원인 대신 사용자가 이해할 문구로 바꿈.
    throw fieldError({ file: '사진이 손상되었거나 브라우저에서 읽을 수 없습니다. 다른 사진을 선택해 주세요.' });
  }

  // 성공하면 파일과 메타데이터를 묶어 반환함. blob은 원본 file 객체의 참조임.
  // 복사·압축·크기 변경·영구 저장은 하지 않음. 저장은 repository.js에서 이어서 처리함.
  // blob: 원본 파일 객체, mime_type: 검증한 형식 문자열, byte_size: 파일의 바이트 크기, kind: 검증한 사진 종류임.
  // async 함수이므로 호출자는 이 객체를 바로 받는 것이 아니라 Promise를 await해서 받음.
  return { blob: file, mime_type, byte_size: file.size, kind };
}
