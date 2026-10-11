/**
 * [이 파일의 역할] 영화 기본 자료를 읽고, 개인 감상 기록과 사진을 저장하는 공통 함수 모음임.
 *
 * 1. catalog.json: 프로젝트에 포함된 영화·인물·장르 등의 기본 자료임.
 *    loadCatalog()는 HTTP로 JSON을 읽어서 검사함. 이 파일에서 JSON을 수정하지는 않음.
 * 2. IndexedDB: 브라우저가 제공하는 비동기 데이터베이스임.
 *    아래 object store(객체 저장소)는 표와 비슷하지만 SQL CREATE TABLE 문으로 만드는 표는 아님.
 *    Profile에는 프로필, WatchLog에는 감상 기록, MediaAsset에는 사진 설명/크기,
 *    MediaBlob에는 사진 원본 데이터를 저장함. 서버의 MySQL에 저장하는 구조가 아님.
 *    브라우저/프로필/사이트 주소(프로토콜·호스트·포트)가 다르면 별도의 저장 공간을 사용함.
 *    브라우저 사이트 데이터를 삭제하면 기록도 사라질 수 있음.
 *
 * [외부에서 사용할 함수]
 * loadCatalog() → JSON 자료와 ID별 조회용 Map 준비
 * openRepository() → 데이터베이스 연결 및 기본 프로필 준비
 * readSnapshot() → 현재 프로필의 기록과 사진 정보를 읽기
 * mutateWatchLog() → 감상 기록 추가/수정/삭제
 * manageMedia() → 사진 추가/원본 읽기/삭제
 * 메인·검색・캘린더・영화 상세 화면은 이 공통 저장소를 사용함.
 * 감상 기록 입력·수정·삭제는 영화 상세 화면에서 제공하고, 사진 화면 등 나머지 메뉴는 별도 구현 대상임.
 *
 * [호출 흐름] ui.js의 초기 준비 함수는 loadCatalog(), openRepository()를 호출하고,
 * 화면을 갱신할 때 readSnapshot()을 호출함. 페이지는 필요에 따라 저장 함수를 호출함.
 * 페이지 코드가 직접 IndexedDB의 이벤트를 매번 처리하지 않도록 이 파일에서 묶어둠.
 *
 * [이 파일에서 반복되는 문법]
 * const는 같은 변수에 다른 값을 다시 대입하지 못하게 함. 배열/객체 내부 수정까지 막지는 않음.
 * let은 나중에 다른 값을 대입할 변수에 사용함. function은 다시 사용할 처리 과정을 정의함.
 * export가 붙은 함수는 다른 파일에서 import로 가져올 수 있음. 나머지는 이 파일 내부 도우미임.
 * async 함수의 반환값은 항상 Promise임. Promise는 나중에 끝날 작업의 성공/실패를 나타냄.
 * await는 Promise가 끝날 때까지 해당 async 함수의 다음 줄 실행을 기다림.
 * 브라우저 전체를 멈추는 것은 아님. 실패한 Promise를 await하면 오류가 발생해 catch로 전달됨.
 * throw new Error(...)는 오류를 만들어 현재 정상 처리 흐름을 중단함.
 * 오류 안내문을 실제 화면에 표시하는 일은 이 함수를 호출한 ui.js 또는 페이지 코드가 담당함.
 *
 * [관계] 감상 기록과 사진은 각각 영화 ID와 프로필 ID를 가짐.
 * 사진은 특정 감상 기록(log_id)이 아니라 영화(movie_id)에 연결되므로 기록 삭제와 사진 삭제는 별개임.
 * 아래 F01 등의 번호는 예전 설계에서 붙인 설명용 번호이며 JavaScript 문법이 아님.
 */
// import { 이름 } from '경로'는 해당 파일이 export한 함수를 이름으로 가져옴.
// normalizeSearch는 검색 문자열의 앞뒤 공백, 연속 공백, 대소문자를 정리하는 프로젝트 함수임.
// 여기서는 같은 영화에 사실상 같은 검색 별칭이 두 번 등록되었는지 검사할 때 사용함.
import { normalizeSearch } from './selectors.js';
// validateWatchLog: 영화·날짜·별점·감상평을 검사하고 정리된 기록 객체를 반환함.
// validateMedia: 사진 종류·용량·실제 파일 형식·이미지 읽기 가능 여부를 검사하는 async 함수임.
// MEDIA_MAX_TOTAL_BYTES: 사진 전체 크기 제한(50 MiB)을 바이트 단위로 나타낸 상수임.
import { validateWatchLog, validateMedia, MEDIA_MAX_TOTAL_BYTES } from './validation.js';

// 브라우저 개발자 도구의 IndexedDB에서 보이는 데이터베이스 이름임.
// 프로젝트 폴더나 JSON 파일 이름이 아님. 같은 사이트에서 이 이름으로 연결하면 기존 데이터를 읽음.
const DATABASE_NAME = 'movie_journal';
// IndexedDB의 구조 버전임. 저장소나 인덱스를 바꾸려면 별도의 업그레이드 처리가 필요함.
// 감상 기록 한 건의 version 속성과는 다른 값임.
const DATABASE_VERSION = 1;
// JSON 최상위 객체에 반드시 있어야 하는 배열 이름들임.
// 여기서 말하는 표는 JSON 배열이며 SQL 테이블이나 IndexedDB 저장소를 생성하는 명령은 아님.
// 데이터가 없는 항목도 [] 형태의 빈 배열로는 존재해야 아래 검사를 통과함.
const CATALOG_TABLES = [
  'Movie', 'MovieAlias', 'Person', 'MovieCredit', 'Genre', 'MovieGenre',
  'Country', 'MovieCountry', 'Series', 'SeriesMovie', 'AchievementRule'
];

// ---------- 읽기 전용 카탈로그 검증 ----------
/**
 * catalogError(message): 카탈로그 오류 앞에 공통 안내 문구를 붙여 예외를 발생시킴.
 * message는 구체적인 문제 설명 문자열임. 정상적인 반환값은 없고 호출 즉시 throw함.
 * 검증 도중 이 함수를 호출하면 이후 검사는 중단되고 loadCatalog()를 기다리던 쪽으로 오류가 전달됨.
 * `문자열 ${값}`은 템플릿 리터럴이며, ${...}의 계산 결과를 문자열 안에 삽입함.
 */
function catalogError(message) {
  throw new Error(`영화 자료를 확인해 주세요: ${message}`);
}

/**
 * requireText(row, key, location, allowEmpty=false): 객체 속성이 올바른 문자열인지 검사함.
 * row는 검사할 객체, key는 속성 이름, location은 오류 메시지에 넣을 표 이름임.
 * allowEmpty는 빈 문자열/공백뿐인 문자열도 허용할지 정함. 인수를 생략하면 false임.
 * 통과하면 값을 반환하지 않고 다음 코드로 진행함. 실패하면 catalogError()를 호출함.
 * 이 함수는 문자열을 검사할 뿐 row 안의 원래 문자열을 trim한 값으로 바꾸지는 않음.
 */
function requireText(row, key, location, allowEmpty = false) {
  // row[key]는 key 변수에 적힌 이름의 속성을 읽음. key가 'title'이면 row.title과 같음.
  const value = row[key];
  // typeof는 자료형을 확인하고 !==는 자료형 변환 없이 서로 다른지 비교함.
  // ||는 조건 중 하나라도 참이면 참, &&는 두 조건이 모두 참이면 참, !는 참/거짓을 반대로 바꿈.
  // trim()은 앞뒤 공백을 제거함. 빈 문자열은 조건문에서 거짓이므로 !value.trim()은 참이 됨.
  // ||와 &&는 앞에서 결론이 나면 뒤를 실행하지 않음. 문자열이 아닌 값에 trim()을 호출하지 않게 됨.
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) {
    // 조건 ? A : B는 조건이 참이면 A, 거짓이면 B를 선택하는 삼항 연산자임.
    // 빈 문자열 허용 여부에 맞춰 오류 안내 문구만 다르게 만듦.
    catalogError(`${location}.${key}는 ${allowEmpty ? '' : '비어 있지 않은 '}문자열이어야 합니다.`);
  }
}

/**
 * validDate(value): 카탈로그의 개봉일이 실제 YYYY-MM-DD 날짜인지 검사해 boolean을 반환함.
 * 예: '2026-10-11'은 true, '2026-02-30'이나 '2026-1-1'은 false임.
 * 감상 기록 날짜 검사는 validation.js의 별도 함수가 맡고, 여기서는 영화 개봉일을 검사함.
 */
function validDate(value) {
  // /.../는 정규 표현식임. ^와 $는 문자열 처음과 끝, \d는 숫자, {4}/{2}는 반복 횟수임.
  // test(value)는 형식이 맞는지 true/false로 반환함. 먼저 글자 모양을 확인하고 틀리면 즉시 종료함.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  // 입력 날짜를 UTC 자정의 Date 객체로 만듦. 마지막 Z는 UTC 기준이라는 뜻임.
  // 지역 시간대 때문에 날짜가 하루 바뀌는 상황을 피하도록 검사 기준을 UTC로 통일함.
  const date = new Date(`${value}T00:00:00.000Z`);
  // getTime()은 기준 시각부터의 밀리초 수를 반환하며, 잘못된 날짜이면 NaN임.
  // Number.isFinite()로 정상 숫자인지 확인한 뒤에만 toISOString()을 호출함.
  // ISO 문자열의 앞 10글자(YYYY-MM-DD)를 원본과 비교함. 2월 30일이 3월로 보정되면 불일치로 거부함.
  // ===는 자료형 변환 없이 같은지 비교함. && 덕분에 앞의 검사가 실패하면 뒤의 변환은 실행하지 않음.
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * uniqueKey(set, parts, location): 여러 속성으로 이루어진 조합이 이미 나왔는지 검사함.
 * set은 지금까지 본 키를 담은 Set, parts는 [영화ID, 장르ID] 같은 배열, location은 안내용 이름임.
 * Set은 같은 값을 중복해서 담지 않는 자료구조임. 통과하면 set에 이번 키를 추가함.
 * 예: 같은 영화+같은 장르 연결을 두 번 넣는 것은 거부하지만, 같은 영화+다른 장르는 허용함.
 */
function uniqueKey(set, parts, location) {
  // JSON 배열 직렬화는 문자열 구분자가 ID에 들어가더라도 충돌하지 않음.
  // 배열을 JSON 문자열로 바꿔 Set에서 비교 가능한 하나의 값으로 만듦.
  // ['a/b', 'c']와 ['a', 'b/c']를 단순히 '/'로 이어 붙이면 같은 문자열이 되지만 JSON 배열은 구분됨.
  const key = JSON.stringify(parts);
  // has()는 포함 여부를 확인함. join(' / ')은 오류 안내용으로 배열 값을 ' / ' 사이에 이어 붙임.
  if (set.has(key)) catalogError(`${location}의 키가 중복되었습니다: ${parts.join(' / ')}`);
  // 아직 없던 조합이라면 등록해, 이후 반복에서 같은 조합이 나왔을 때 감지하도록 함.
  set.add(key);
}

/**
 * makeLookup(rows, key, location): 배열을 'ID → 원래 객체' 형태의 Map으로 만들어 반환함.
 * rows는 행 객체 배열, key는 ID 속성 이름, location은 표 이름임.
 * Map.get('m001')처럼 ID로 바로 찾을 수 있어 매번 배열 전체를 검색하지 않아도 됨.
 * ID가 없거나 중복이면 오류를 발생시킴. 반환한 Map의 값은 원래 행 객체이며 복제본이 아님.
 */
function makeLookup(rows, key, location) {
  // new는 객체를 생성하는 문법임. 빈 Map을 만들고 아래 반복에서 채움.
  const map = new Map();
  // for...of는 배열의 각 값을 하나씩 꺼냄. 이 반복이 끝날 때까지 모든 행을 확인함.
  for (const row of rows) {
    // 현재 행의 ID가 비어 있지 않은 문자열인지 먼저 검사함. 같은 ID가 있는지 확인하기 전 단계임.
    requireText(row, key, location);
    // Map에 이미 이 ID가 들어 있다면 다른 행도 같은 ID를 사용한 것임. 기존 값을 덮어쓰지 않고 중단함.
    if (map.has(row[key])) catalogError(`${location}.${key}가 중복되었습니다: ${row[key]}`);
    // set(키, 값)은 Map에 저장함. 예: movie_id가 'm001'인 행 전체를 'm001' 키에 연결함.
    map.set(row[key], row);
  }
  return map;
}

/**
 * requireReference(map, id, location): 연결할 대상 ID가 실제로 있는지 검사함.
 * 예: MovieGenre.movie_id가 영화 목록의 movieById에 없으면 잘못된 연결임.
 * SQL의 외래 키와 비슷한 유효성 검사를 JavaScript로 하는 것임. 데이터베이스가 자동으로 강제하는 것은 아님.
 * 정상일 때 별도 반환값은 없으며 실패하면 예외를 발생시킴.
 */
function requireReference(map, id, location) {
  if (typeof id !== 'string' || !map.has(id)) {
    // String(id)는 undefined나 숫자 같은 잘못된 입력도 오류 안내에 넣을 수 있도록 문자열로 바꿈.
    catalogError(`${location}가 존재하지 않는 항목을 참조합니다: ${String(id)}`);
  }
}

/**
 * validateCatalog(raw): 읽어온 JSON 자료의 형태, 필수 속성, ID 중복, 표 사이 연결을 검사함.
 * raw는 response.json()으로 얻은 JavaScript 값임. 처음에는 올바른 자료라고 가정하지 않음.
 * 모든 검사를 통과하면 원래 표 배열들과 lookup(Map 모음)이 들어 있는 객체를 반환함.
 * 검사 결과를 저장소에 쓰지 않음. 예상한 자료 형식과 다른 항목을 일찍 발견하는 함수임.
 */
function validateCatalog(raw) {
  // JSON 전체는 { Movie: [...], Person: [...], ... } 형태여야 함.
  // null도 typeof로는 'object'이므로 !raw로 제외하고, 배열도 객체이므로 Array.isArray()로 따로 제외함.
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) catalogError('최상위 자료는 객체여야 합니다.');
  // 위에 적어둔 필수 배열 이름을 차례로 확인함. 빈 배열은 허용하지만 속성 자체가 없으면 거부함.
  for (const name of CATALOG_TABLES) {
    if (!Array.isArray(raw[name])) catalogError(`${name} 배열이 없습니다.`);
    // forEach()는 배열의 각 항목에 콜백 함수를 실행함.
    // row는 현재 항목, index는 0부터 시작하는 위치임. 화살표 함수 (...) => {...}가 검사 내용을 담음.
    raw[name].forEach((row, index) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        catalogError(`${name}[${index}]는 객체여야 합니다.`);
      }
    });
  }

  // 여러 화면에서 사용할 ID 조회표를 한 객체에 모음.
  // movieById 같은 이름은 우리가 정한 객체 속성 이름이고, 값은 makeLookup()이 만든 Map임.
  const lookup = {
    // movieById: 영화 번호를 키로 삼아 대표 제목·상영 시간 등이 들어 있는 영화 객체를 찾는 Map임.
    movieById: makeLookup(raw.Movie, 'movie_id', 'Movie'),
    // personById: 배우/감독 같은 인물 번호로 그 인물의 이름을 찾는 Map임.
    personById: makeLookup(raw.Person, 'person_id', 'Person'),
    // genreById: 장르 번호로 장르 이름을 찾는 Map임.
    genreById: makeLookup(raw.Genre, 'genre_id', 'Genre'),
    // countryByCode: KR 같은 국가 코드로 국가 이름·지도 좌표를 찾는 Map임.
    countryByCode: makeLookup(raw.Country, 'country_code', 'Country'),
    // seriesById: 시리즈 번호로 시리즈 이름·소개를 찾는 Map임.
    seriesById: makeLookup(raw.Series, 'series_id', 'Series')
  };
  // 이 두 표는 ID 중복 검사만 필요하므로 Map 반환값은 별도로 보관하지 않음.
  // 검색 별칭은 normalized_alias 필드가 없어도 되지만, alias_id 필드는 현재 검사에서 요구함.
  makeLookup(raw.MovieAlias, 'alias_id', 'MovieAlias');
  makeLookup(raw.AchievementRule, 'rule_id', 'AchievementRule');

  // 각 영화의 화면 표시 정보와 개봉일/상영 시간/포스터 경로를 검사함.
  // original_title은 현재 필수 검사 대상에서 제거되어 있으므로 없어도 이 함수를 통과할 수 있음.
  for (const movie of raw.Movie) {
    requireText(movie, 'title', 'Movie');
    // true를 전달했으므로 줄거리는 빈 문자열 ''을 허용함. 속성 누락(undefined)이나 null은 허용하지 않음.
    requireText(movie, 'overview', 'Movie', true);
    // null은 '정보 없음'으로 허용함. 그 외 값은 실제 날짜여야 함.
    // undefined는 null과 다르므로 속성을 아예 빼는 것은 이 검사에서 허용되지 않음.
    if (movie.release_date !== null && !validDate(movie.release_date)) {
      catalogError(`Movie(${movie.movie_id}).release_date는 실제 YYYY-MM-DD 날짜 또는 null이어야 합니다.`);
    }
    // Number.isInteger()는 숫자 자료형의 정수인지 확인함. '120'이라는 문자열은 정수가 아님.
    // 상영 시간은 null 또는 1 이상의 정수(분 단위)만 허용함.
    if (movie.runtime_min !== null && (!Number.isInteger(movie.runtime_min) || movie.runtime_min <= 0)) {
      catalogError(`Movie(${movie.movie_id}).runtime_min은 양의 정수 또는 null이어야 합니다.`);
    }
    // 포스터 정보가 null이면 검사하지 않음. 경로가 있다면 비어 있지 않은 문자열이어야 함.
    if (movie.poster_url !== null) {
      requireText(movie, 'poster_url', 'Movie');
      // URL(주소, 기준주소)은 상대 경로를 절대 주소로 해석함. 여기서 실제 이미지를 다운로드하지는 않음.
      // globalThis는 현재 실행 환경의 전역 객체임. 브라우저에서는 location.href가 현재 페이지 주소임.
      // ?.는 앞의 값이 null/undefined이면 오류 없이 undefined를 반환함(선택적 연결 연산자).
      // ||는 왼쪽 값이 비어 있으면 오른쪽 기본값을 선택하므로, location이 없는 검사 환경에서도 해석할 수 있음.
      const url = new URL(movie.poster_url, globalThis.location?.href || 'http://localhost/');
      // includes()는 배열에 특정 값이 있는지 검사함. 웹 주소 방식만 허용하고 다른 프로토콜은 거부함.
      // 주소 형식 검사이므로 파일이 실제 있는지, 이미지인지, 같은 사이트인지까지 확인하는 것은 아님.
      if (!['http:', 'https:'].includes(url.protocol)) catalogError('poster_url에는 웹 주소 또는 상대 경로를 사용하세요.');
    }
  }
  // [name, rows]는 배열 구조 분해임. ['Person', raw.Person]을 각각 name과 rows에 나눠 담음.
  // 이름이 필요한 네 표에 같은 검사를 적용함. 모두 name이 공백만 있는 문자열이어서는 안 됨.
  for (const [name, rows] of [['Person', raw.Person], ['Genre', raw.Genre], ['Country', raw.Country], ['Series', raw.Series]]) {
    for (const row of rows) requireText(row, 'name', name);
  }
  // 시리즈 소개는 빈 문자열을 허용하지만 문자열 속성 자체는 있어야 함.
  for (const row of raw.Series) requireText(row, 'description', 'Series', true);
  // 국가 코드는 대문자 두 글자 형식, 지도 핀 좌표는 위도/경도 범위를 확인함.
  // 두 글자라는 모양만 검사하므로 실제 국가 코드 목록에 등재되어 있는지까지 확인하지는 않음.
  for (const country of raw.Country) {
    if (!/^[A-Z]{2}$/.test(country.country_code)) catalogError('Country.country_code는 영문 대문자 두 자리여야 합니다.');
    // Number.isFinite()는 NaN/Infinity와 숫자가 아닌 값을 거부함.
    // Math.abs()는 절댓값임. 위도 -90~90, 경도 -180~180 범위만 허용함.
    // 여러 줄에 적혀 있지만 다음 줄까지 하나의 if 조건임.
    if (!Number.isFinite(country.pin_lat) || Math.abs(country.pin_lat) > 90 ||
        !Number.isFinite(country.pin_lng) || Math.abs(country.pin_lng) > 180) {
      catalogError(`Country(${country.country_code})의 위도·경도가 유효하지 않습니다.`);
    }
  }

  // 지금까지 본 '영화 ID + 정리한 검색 별칭' 조합을 기억할 Set임.
  const aliasKeys = new Set();
  for (const alias of raw.MovieAlias) {
    // 별칭에 적힌 영화 ID가 Movie 목록에 있어야 검색 결과를 올바른 영화로 연결할 수 있음.
    requireReference(lookup.movieById, alias.movie_id, 'MovieAlias.movie_id');
    // 검색 별칭 문자열 자체가 빈 값인지 검사함. 실제 검색어와의 비교는 selectors.js가 담당함.
    requireText(alias, 'alias', 'MovieAlias');
    // 별도의 normalized_alias 속성 없이 검색용 값을 계산해 중복을 검사함.
    // 같은 영화에서 대소문자/앞뒤 공백만 다른 별칭은 중복으로 봄.
    // 서로 다른 영화가 같은 별칭을 쓰는 것은 영화 ID가 다르므로 허용함.
    // 정리한 값은 검사할 때 계산할 뿐 raw.MovieAlias에 새 속성을 쓰지 않음.
    uniqueKey(aliasKeys, [alias.movie_id, normalizeSearch(alias.alias)], 'MovieAlias');
  }
  // '영화 ID + 인물 ID + 역할'의 조합으로 출연/연출 연결 중복을 검사함.
  // 같은 사람이 같은 영화에서 배우와 감독을 겸하면 role이 달라 각각 한 행씩 허용함.
  const creditKeys = new Set();
  for (const credit of raw.MovieCredit) {
    // 배우/감독 연결이 가리키는 영화가 실제 목록에 있는지 확인함.
    requireReference(lookup.movieById, credit.movie_id, 'MovieCredit.movie_id');
    // 같은 연결의 인물도 실제 목록에 있어야 이름을 찾아 검색하거나 상세 화면에 표시할 수 있음.
    requireReference(lookup.personById, credit.person_id, 'MovieCredit.person_id');
    // role은 이 영화에 참여한 역할임. actor는 배우, director는 감독이며 다른 문자열은 현재 허용하지 않음.
    if (!['actor', 'director'].includes(credit.role)) catalogError('MovieCredit.role은 actor 또는 director여야 합니다.');
    // 같은 영화·같은 인물·같은 역할의 연결이 두 번 들어 있는지 검사함.
    uniqueKey(creditKeys, [credit.movie_id, credit.person_id, credit.role], 'MovieCredit');
  }
  // 영화·장르 연결과 영화·국가 연결은 검사 방식이 같으므로 하나의 반복문으로 처리함.
  // 세 칸짜리 배열을 표 이름(name), 연결 속성 이름(key), 대상 조회표(parentMap)로 분해함.
  for (const [name, key, parentMap] of [
    ['MovieGenre', 'genre_id', lookup.genreById],
    ['MovieCountry', 'country_code', lookup.countryByCode]
  ]) {
    // 각 연결 표마다 새 Set을 만들어 그 표 안에서만 중복 조합을 확인함.
    const keys = new Set();
    for (const row of raw[name]) {
      requireReference(lookup.movieById, row.movie_id, `${name}.movie_id`);
      requireReference(parentMap, row[key], `${name}.${key}`);
      uniqueKey(keys, [row.movie_id, row[key]], name);
    }
  }
  // 시리즈에는 같은 영화를 두 번 넣을 수 없고, 같은 순서 번호도 중복해서 쓸 수 없음.
  // 두 종류의 중복 규칙을 별도 Set으로 검사함.
  const seriesMovies = new Set();
  const seriesOrders = new Set();
  for (const row of raw.SeriesMovie) {
    requireReference(lookup.movieById, row.movie_id, 'SeriesMovie.movie_id');
    requireReference(lookup.seriesById, row.series_id, 'SeriesMovie.series_id');
    if (!Number.isInteger(row.release_order) || row.release_order < 1) catalogError('시리즈 순서는 양의 정수여야 합니다.');
    uniqueKey(seriesMovies, [row.series_id, row.movie_id], 'SeriesMovie');
    // 예: 같은 시리즈의 1번은 하나만 허용하지만, 다른 시리즈도 각각 1번을 가질 수 있음.
    // 번호가 1, 3처럼 건너뛰는지 또는 실제 개봉일 순서와 일치하는지까지 검사하는 것은 아님.
    uniqueKey(seriesOrders, [row.series_id, row.release_order], '시리즈 개봉 순서');
  }
  // 업적 규칙은 문구(label), 지원하는 집계 항목(metric), 양의 정수 목표(target)를 요구함.
  // 규칙을 읽고 검사하는 단계이며 업적 달성 여부 계산이나 화면 표시는 이 함수에서 하지 않음.
  for (const rule of raw.AchievementRule) {
    requireText(rule, 'label', 'AchievementRule');
    if (!['unique_movie_count', 'runtime_total', 'genre_count'].includes(rule.metric)) {
      catalogError(`지원하지 않는 업적 지표입니다: ${String(rule.metric)}`);
    }
    if (!Number.isInteger(rule.target) || rule.target <= 0) catalogError('업적 목표는 양의 정수여야 합니다.');
  }
  // ...raw는 raw의 속성들을 새 객체에 펼쳐 복사하는 전개 문법임.
  // lookup을 추가해서 반환함. 배열과 그 안의 객체까지 깊게 복사하는 것은 아님.
  return { ...raw, lookup };
}

/** F01. 정적 JSON을 읽고 모든 키·참조·규칙을 확인한 뒤 Map과 함께 반환함. */
/**
 * loadCatalog(url): 영화 카탈로그를 가져옴. url 생략 시 data/catalog.json을 사용함.
 * 반환: 검증된 카탈로그와 lookup을 성공값으로 갖는 Promise.
 * 실패: 통신 실패, HTTP 실패, JSON 문법 오류, 카탈로그 내용 오류 중 해당 오류로 Promise가 실패함.
 * 파일 더블클릭(file://)보다 프로젝트를 제공하는 HTTP 서버 주소에서 실행하도록 구성되어 있음.
 */
export async function loadCatalog(url = 'data/catalog.json') {
  // fetch 결과를 try 바깥에서도 쓰기 위해 먼저 선언함. 이후 응답 객체를 대입함.
  let response;
  try {
    // fetch()는 URL로 HTTP 요청을 보내고 Response 객체를 담은 Promise를 반환함.
    // 상대 URL은 현재 페이지 주소를 기준으로 해석됨. await로 응답을 받은 뒤 다음 줄로 진행함.
    response = await fetch(url);
  } catch {
    throw new Error('영화 자료를 불러오지 못했습니다. 실행 안내에 따라 HTTP 서버를 열고 다시 시도하세요.');
  }
  // fetch는 404 같은 HTTP 오류에서도 응답 객체를 반환할 수 있으므로 ok를 별도로 확인함.
  // ok는 HTTP 성공 상태인지, status는 200/404 같은 응답 번호인지 알려줌.
  if (!response.ok) throw new Error(`영화 자료를 불러오지 못했습니다. 응답 코드: ${response.status}`);
  // JSON 본문을 JavaScript 값으로 변환한 결과를 담을 변수임.
  let raw;
  // json()도 비동기임. 본문을 읽고 JSON 문법대로 해석한 값이 준비될 때까지 기다림.
  // catch에 오류 변수 이름을 쓰지 않으면 오류 객체 자체는 받지 않고 공통 안내만 만들 수 있음.
  try { raw = await response.json(); }
  catch { throw new Error('catalog.json의 JSON 문법을 확인해 주세요.'); }
  // 통신과 JSON 해석에 성공했어도 자료 내용이 잘못될 수 있으므로 최종 검사를 거침.
  // async 함수이므로 반환한 객체는 호출 쪽에서 await loadCatalog()로 받음.
  return validateCatalog(raw);
}

// ---------- IndexedDB 공통 도우미 ----------
/**
 * storageError(error): IndexedDB 오류를 화면에 안내하기 쉬운 Error 객체로 바꿈.
 * 반환값은 Error이며 이 함수 자체는 throw하지 않음. 호출한 쪽에서 reject 또는 throw에 사용함.
 * error?.name은 오류가 없을 때도 안전하게 이름을 읽음.
 * 알 수 있는 저장소 오류는 한국어 안내로 바꾸고, 이미 만들어진 일반 Error는 그대로 돌려줌.
 * 안내문을 실제로 화면에 표시하는 함수는 아님.
 */
function storageError(error) {
  // 저장 용량 부족임. 문구의 '입력 내용 유지'는 이 함수가 폼을 복원한다는 뜻이 아님.
  // 이 함수는 메시지만 만들며, 입력란을 지우지 않는 것은 호출한 화면 코드가 처리해야 함.
  if (error?.name === 'QuotaExceededError') return new Error('브라우저 저장 공간이 부족합니다. 사진을 정리한 뒤 다시 저장하세요. 입력 내용은 유지됩니다.');
  // 기본 키 또는 unique 인덱스 값이 기존 데이터와 겹칠 때 발생하는 오류를 설명함.
  if (error?.name === 'ConstraintError') return new Error('이미 존재하는 데이터와 키가 겹칩니다. 새로고침 후 다시 시도하세요.');
  // 저장소 연결 등이 작업 가능한 상태가 아닐 때의 안내임.
  if (error?.name === 'InvalidStateError') return new Error('저장소 연결이 닫혔습니다. 페이지를 새로고침해 주세요.');
  // instanceof는 특정 클래스의 객체인지 확인함. Error라면 원래 구체적인 메시지를 유지함.
  // 그렇지 않으면 공통 Error를 새로 만들어, 호출한 코드에서 같은 형태로 오류를 처리하게 함.
  return error instanceof Error ? error : new Error('저장소 작업을 완료하지 못했습니다. 다시 시도해 주세요.');
}

/**
 * executor의 요청 성공 콜백에서만 후속 IndexedDB 요청을 등록함.
 * 트랜잭션 안에 이미지 디코딩·fetch·타이머 같은 await를 넣으면 자동 종료될 수 있음.
 * finish는 반환할 값을 준비할 뿐, 실제 Promise는 oncomplete에서만 해결함.
 */
/**
 * transaction(db, storeNames, mode, executor): IndexedDB의 이벤트 처리를 Promise 형태로 감싸는 도우미임.
 * db는 열린 데이터베이스 연결, storeNames는 이번 작업에 쓸 저장소 이름 배열임.
 * mode는 읽기 전용 'readonly' 또는 읽고 쓰는 'readwrite'임.
 * executor는 실제 요청들을 등록하는 콜백 함수이며 (tx, request, finish)를 전달받음.
 *   tx: 이번 트랜잭션. tx.objectStore('WatchLog')처럼 저장소를 얻음.
 *   request: 읽기/쓰기 요청의 성공과 실패를 연결하는 아래 내부 함수임.
 *   finish: 작업 완료 후 돌려줄 값을 정하는 콜백임. 이름과 달리 트랜잭션 종료 명령은 아님.
 * 반환값은 Promise임. 전체 트랜잭션이 성공적으로 끝나야 finish에 넘긴 값으로 성공 처리함.
 *
 * 트랜잭션은 여러 저장 작업을 한 묶음으로 처리함. 하나가 실패해 취소되면 같은 묶음의 변경도 취소됨.
 * 예: 사진 설명은 저장됐지만 원본은 저장되지 않는 불완전한 상태를 피하는 데 사용함.
 * '요청 하나 성공(onsuccess)'과 '전체 저장 완료(oncomplete)'를 반드시 구분해야 함.
 * 요청 사이에 네트워크/이미지 처리 같은 별도 비동기 작업을 기다리면 트랜잭션이 먼저 종료될 수 있으므로,
 * 필요한 자료 준비는 바깥에서 끝내고 요청 성공 콜백 안에서 후속 IndexedDB 요청을 바로 등록함.
 */
function transaction(db, storeNames, mode, executor) {
  // Promise 생성 함수에 resolve(성공값), reject(실패 이유)가 전달됨.
  // 아직 여기서는 저장이 끝난 것이 아님. 아래 이벤트에서 resolve/reject를 호출해야 결과가 정해짐.
  return new Promise((resolve, reject) => {
    // try 안에서 만든 트랜잭션을 다른 콜백들도 사용하도록 바깥 범위에 변수를 둠.
    let tx;
    // 지정한 저장소들에 대해 하나의 트랜잭션을 엶.
    // 닫힌 연결이나 존재하지 않는 저장소 등은 즉시 예외가 날 수 있어 try/catch로 처리함.
    try { tx = db.transaction(storeNames, mode); }
    // 시작 자체가 실패했으면 Promise를 실패시키고 return으로 나머지 준비를 중단함.
    catch (error) { reject(storageError(error)); return; }
    // result는 finish()가 정하는 성공 반환값, failure는 실패 원인임.
    // 선언 직후에는 둘 다 undefined임. 여러 이벤트 콜백이 이 변수들을 공유함.
    let result;
    let failure;
    // 검증 실패나 콜백 내부 예외를 처리하는 내부 함수임.
    // 오류를 먼저 기억한 뒤 트랜잭션 전체를 취소해 일부 변경만 남지 않도록 함.
    const abort = error => {
      // 트랜잭션 취소 이벤트가 나중에 발생해도 구체적인 원인을 전달할 수 있도록 바깥 변수에 보관함.
      failure = error;
      // abort()는 명시적 취소임. 취소 이벤트(onabort)가 발생하면 아래에서 reject함.
      try { tx.abort(); }
      // 이미 종료된 트랜잭션 등은 abort 자체도 실패할 수 있으므로 이 경우 즉시 Promise를 실패시킴.
      catch { reject(storageError(error)); }
    };
    // idbRequest는 store.get()/add()/put()/delete() 등이 돌려준 IDBRequest 객체임.
    // onSuccess는 성공 결과를 받아 다음 처리를 할 선택적 콜백임. 저장만 할 때는 생략할 수 있음.
    // 이 도우미는 요청을 새로 시작하지 않음. 인수로 전달하기 전에 만들어진 요청에 이벤트를 붙임.
    const request = (idbRequest, onSuccess) => {
      // IndexedDB가 해당 요청을 마치면 브라우저가 이 함수를 실행함.
      // 요청별 result는 get이면 객체/undefined, getAll이면 배열, add이면 키 등 작업에 따라 달라짐.
      idbRequest.onsuccess = () => {
        // onSuccess?.(...)는 콜백이 있을 때만 호출함.
        // 콜백 안에서 검사 실패로 throw해도 아래 catch가 받아 전체 트랜잭션을 취소함.
        try { onSuccess?.(idbRequest.result); }
        catch (error) { abort(error); }
      };
      // preventDefault를 호출하지 않아 요청 실패가 전체 트랜잭션을 취소하게 함.
      // 오류 원인을 저장함. 이벤트의 기본 동작을 막지 않아 요청 실패가 트랜잭션 취소로 이어짐.
      // 최종 reject는 tx.onabort에서 처리하므로 실패한 요청 한 개만 놓고 성공을 확정하지 않음.
      idbRequest.onerror = () => { failure = idbRequest.error; };
      // 같은 요청 객체를 돌려줌. Promise가 아니므로 이 반환값을 await한다고 요청 완료를 기다리지는 않음.
      return idbRequest;
    };
    // 모든 요청과 저장이 정상 종료되었을 때만 성공으로 확정함. finish가 미리 정한 result를 전달함.
    // 여기서 result는 호출자가 finish(값)로 정한 값임. 감상 기록 저장이라면 log_id 문자열임.
    // Promise를 await하던 movie.js는 이 시점 이후에만 성공 메시지와 화면 갱신을 진행할 수 있음.
    tx.oncomplete = () => resolve(result);
    // 취소되면 우리가 기록한 구체적인 오류를 우선 사용하고, 없으면 트랜잭션 자체 오류를 사용함.
    tx.onabort = () => reject(storageError(failure || tx.error));
    // ||=는 왼쪽이 거짓으로 취급되는 값일 때만 오른쪽 값을 대입하는 연산자임.
    // 이미 자세한 실패 원인이 있다면 덮어쓰지 않고, 없을 때만 트랜잭션 오류를 보관함.
    tx.onerror = () => { failure ||= tx.error; };
    // 호출자가 넘긴 작업 함수를 실행함. 마지막 화살표 함수가 호출자에게는 finish라는 이름으로 전달됨.
    // finish(value)는 result를 정할 뿐 resolve하지 않음. 실제 성공은 위의 oncomplete를 기다림.
    // result에 객체를 넣고 나중에 요청 콜백이 그 객체의 속성을 채워도 같은 객체를 참조하므로 반영됨.
    try { executor(tx, request, value => { result = value; }); }
    catch (error) { abort(error); }
  });
}

/**
 * ensureRepository(repo): 저장소 연결과 현재 프로필 ID가 준비되었는지 확인함.
 * repo는 openRepository()가 반환한 { db, profile } 객체임. 통과하면 별도 반환값은 없음.
 * 연결 객체가 있는지만 검사하므로 실제 연결이 이미 닫혔다면 이후 트랜잭션 생성에서 추가 오류가 남.
 */
function ensureRepository(repo) {
  if (!repo?.db || !repo?.profile?.profile_id) throw new Error('저장소가 준비되지 않았습니다. 페이지를 새로고침해 주세요.');
}

/** 저장소에서 읽은 프로필이 존재하는지 검사함. get()이 못 찾으면 undefined이므로 오류를 발생시킴. */
function ensureProfile(profile) {
  if (!profile) throw new Error('현재 프로필을 찾지 못했습니다. 페이지를 새로고침해 주세요.');
}

/**
 * requireOwner(row, profileId, label): 대상 데이터가 있고 현재 프로필의 소유인지 검사함.
 * row는 읽어온 기록/사진 정보, profileId는 현재 프로필 ID, label은 오류 안내용 '감상 기록'/'사진'임.
 * 현재 브라우저 안의 데이터 구분 검사이며, 서버 로그인 인증이나 보안 권한 검증을 구현한 것은 아님.
 */
function requireOwner(row, profileId, label) {
  if (!row) throw new Error(`${label}을 찾지 못했습니다. 새로고침 후 다시 확인하세요.`);
  if (row.profile_id !== profileId) throw new Error(`현재 프로필의 ${label}만 사용할 수 있습니다.`);
}

/** payload(호출자가 넘긴 입력 객체)가 null/배열 등 잘못된 형태인지 검사함. 개별 입력값은 이후에 검사함. */
function requirePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('입력 내용을 확인해 주세요.');
}

/** ID가 공백만 있는 문자열이 아닌지 검사함. 실제 데이터 존재 여부는 이후 store.get() 결과로 확인함. */
function requireId(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}이 없습니다.`);
}

/**
 * makeId(): 새 감상 기록/사진에 사용할 UUID 형태의 문자열을 반환함. 비동기 함수가 아님.
 * 예시 형태는 'xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx'이며 영화 ID와는 별도로 새로 만듦.
 * 난수 기반이라 충돌 가능성이 매우 낮지만 수학적으로 중복이 절대 불가능한 번호는 아님.
 * 실제 키가 겹치면 IndexedDB add()가 오류를 내므로 기존 데이터를 덮어쓰지 않음.
 */
function makeId() {
  // 브라우저가 제공하는 UUID 생성 함수를 사용할 수 있으면 바로 그 결과를 반환함.
  // 여기의 crypto는 브라우저 표준 객체이며 별도로 설치한 라이브러리가 아님.
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // 일부 HTTP 환경에도 안전한 난수 API가 있으면 UUID를 만들 수 있음.
  if (!globalThis.crypto?.getRandomValues) throw new Error('이 브라우저에서 식별자를 만들 수 없습니다. localhost 주소로 실행해 주세요.');
  // 대체 방식: Uint8Array(16)는 0~255 정수 16개를 담는 배열임.
  // getRandomValues()가 이를 난수로 채움. 16바이트는 128비트임.
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  // 아래 두 줄은 UUID의 버전과 형식 표시 비트를 맞춤. 앱 기능을 위한 일반 산술 계산과는 다름.
  // &와 |는 비트 단위 AND/OR이고, 조건문에서 쓴 &&/||와 다른 연산자임.
  // & 15로 아래 4비트만 남긴 뒤 | 64로 버전 4를 나타내는 비트를 설정함.
  bytes[6] = (bytes[6] & 15) | 64;
  // & 63으로 아래 6비트를 남기고 | 128로 UUID 형식에 맞는 상위 비트를 설정함.
  bytes[8] = (bytes[8] & 63) | 128;
  // Array.from(대상, 변환함수)은 각 바이트를 변환해 새 배열을 만듦.
  // toString(16)은 16진수 문자열로, padStart(2, '0')은 한 자리 앞에 0을 붙여 두 자리로 만듦.
  // join('')으로 16개 결과를 구분자 없이 이어 붙이면 32글자의 16진수 문자열이 됨.
  const hex = Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
  // slice(시작, 끝)은 끝 위치를 제외한 구간을 잘라냄. 끝을 생략하면 마지막까지임.
  // 8-4-4-4-12글자로 나누고 하이픈을 넣어 UUID 표시 형태를 완성함.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * ensureVersion(row, expectedVersion): 사용자가 화면에서 본 기록 버전과 현재 저장된 버전이 같은지 확인함.
 * expectedVersion은 수정/삭제를 요청한 페이지가 넘겨야 하는 양의 정수임.
 * 두 탭이 같은 기록을 열었을 때 먼저 저장한 변경을 나중의 오래된 화면이 덮어쓰지 않도록 검사함.
 * 실제 요청이 다른 탭에서 왔는지 추적하지는 않으며, 버전 불일치를 오류로 알리는 방식임.
 */
function ensureVersion(row, expectedVersion) {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error('기록 버전이 없습니다. 새로고침 후 다시 시도하세요.');
  // 과거 기록에 version이 없거나 거짓으로 취급되는 값이면 1로 간주함.
  // version은 데이터베이스 구조 버전이 아니라 이 감상 기록을 몇 번 갱신했는지 나타내는 값임.
  if ((row.version || 1) !== expectedVersion) throw new Error('다른 탭에서 이 기록을 변경했습니다. 새로고침으로 최신 내용을 확인한 뒤 다시 시도하세요.');
}

/** F02. 저장소·인덱스를 준비하고 최초 한 번만 demo 프로필을 생성함. */
/**
 * openRepository(options={}): 데이터베이스에 연결하고 'demo' 프로필을 준비함.
 * options.name/options.version을 주면 기본 이름/버전 대신 사용할 수 있음(예: 별도 검사용 DB).
 * 반환: { db: 열린 IDBDatabase, profile: 프로필 객체 }로 성공하는 Promise.
 * 처음에는 저장소를 만들고, 다음 방문에는 같은 DB의 기존 프로필과 기록을 계속 사용함.
 * 회원가입/로그인을 구현한 것은 아니며 현재는 'demo'라는 한 프로필을 사용함.
 */
export async function openRepository(options = {}) {
  // 브라우저가 IndexedDB API를 제공하는지 확인함. 제공하더라도 설정/저장 상태로 실제 열기가 실패할 수 있음.
  if (!globalThis.indexedDB) throw new Error('이 브라우저는 IndexedDB 저장을 지원하지 않습니다. 최신 브라우저로 실행하세요.');
  // || 기본값 선택: 옵션에 사용 가능한 값이 없으면 위에서 정한 기본 DB 이름과 버전을 사용함.
  const name = options.name || DATABASE_NAME;
  const version = options.version || DATABASE_VERSION;
  // indexedDB.open() 자체는 Promise를 반환하지 않음.
  // open 요청의 이벤트를 Promise로 감싸고 await하여 연결 완료 후 아래 프로필 준비를 진행함.
  const db = await new Promise((resolve, reject) => {
    // 다른 탭 때문에 업그레이드가 막혀 이미 실패 안내를 했는지 기록함.
    // 이후 늦게 연결이 성공하더라도 사용하지 않을 연결은 닫기 위한 상태임.
    let failed = false;
    // 이름과 버전으로 열기 요청을 시작함. 반환값은 DB 연결 자체가 아니라 IDBOpenDBRequest임.
    const open = indexedDB.open(name, version);
    // 처음 생성하거나 기존 버전보다 높은 버전으로 열 때 호출됨.
    // object store와 index의 구조 변경은 이 업그레이드 트랜잭션에서 수행함.
    // 같은 버전으로 다시 열 때마다 실행되는 초기화 코드가 아님.
    open.onupgradeneeded = () => {
      // result는 이번에 열린 데이터베이스 연결이고, transaction은 구조 변경용 트랜잭션임.
      const database = open.result;
      // 구조 변경용 트랜잭션 객체임. 이미 있는 저장소를 가져올 때 upgrade.objectStore()를 사용함.
      const upgrade = open.transaction;
      // 저장소가 이미 있으면 가져오고, 없으면 새로 만듦. 삼항 연산자의 두 갈래임.
      // keyPath는 각 객체에서 기본 키로 사용할 속성 이름임. 예: WatchLog는 log_id로 한 행을 구분함.
      // 기존 저장소의 keyPath를 변경하거나 옛 데이터를 새 형식으로 바꾸는 마이그레이션은 이 함수에 없음.
      const ensureStore = (storeName, keyPath) => database.objectStoreNames.contains(storeName)
        ? upgrade.objectStore(storeName)
        : database.createObjectStore(storeName, { keyPath });
      // 네 저장소의 역할:
      // Profile = 사용자 프로필 / WatchLog = 감상 기록
      // MediaAsset = 사진 종류·용량·영화 ID 등의 정보 / MediaBlob = 원본 파일 데이터
      // Blob은 파일의 바이너리 데이터를 다루는 브라우저 객체이며 JSON 문자열로 변환하지 않고 저장함.
      ensureStore('Profile', 'profile_id');
      // WatchLog 저장소를 준비하고 변수 logs에 담음. 여기서 logs는 감상 기록 배열이 아니라 저장소 조작 객체임.
      const logs = ensureStore('WatchLog', 'log_id');
      // MediaAsset 저장소 조작 객체임. 사진마다 asset_id를 기본 키로 사용함.
      const assets = ensureStore('MediaAsset', 'asset_id');
      // 실제 사진 원본을 담을 저장소도 준비함. 원본 행은 storage_key로 구분함.
      ensureStore('MediaBlob', 'storage_key');
      // 로그와 사진 정보 둘 다 프로필별/영화별로 조회할 수 있도록 인덱스를 만듦.
      // 인덱스는 저장된 특정 속성으로 데이터를 찾기 위한 보조 조회 구조임.
      // 아래 createIndex('인덱스 이름', '대상 속성')은 이름과 속성을 같게 정한 것임.
      // unique 옵션을 주지 않아 같은 프로필/같은 영화에 여러 기록과 사진을 저장할 수 있음.
      for (const store of [logs, assets]) {
        // 프로필별로 기록/사진을 모아서 읽을 수 있도록 profile_id 속성의 인덱스를 없을 때만 만듦.
        if (!store.indexNames.contains('profile_id')) store.createIndex('profile_id', 'profile_id');
        // 영화별 조회용 movie_id 인덱스도 같은 방식으로 준비함. 같은 영화가 여러 행에 나와도 허용함.
        if (!store.indexNames.contains('movie_id')) store.createIndex('movie_id', 'movie_id');
      }
      // 사진 원본 키는 두 사진 정보가 공유하지 못하도록 unique 인덱스로 만듦.
      // 이 옵션만으로 MediaBlob에 원본이 반드시 존재하는지까지 검사하지는 않음.
      // 정보/원본을 함께 저장·삭제하는 것은 manageMedia()의 트랜잭션 코드가 담당함.
      if (!assets.indexNames.contains('storage_key')) assets.createIndex('storage_key', 'storage_key', { unique: true });
    };
    // 보통 다른 탭의 기존 연결 때문에 요청한 버전 업그레이드를 진행하지 못할 때 호출됨.
    // 단순히 같은 버전 DB를 다른 탭에서 쓰고 있다는 이유만으로 항상 차단되는 것은 아님.
    open.onblocked = () => {
      // 이미 열기 실패를 알렸다는 표시를 남겨, 나중에 onsuccess가 발생해도 그 연결을 사용하지 않게 함.
      failed = true;
      reject(new Error('다른 탭에서 같은 저장소를 사용 중입니다. 다른 FILMLOG 탭을 닫고 새로고침하세요.'));
    };
    // 데이터베이스 열기에 실패하면 Promise를 실패시키고 호출한 화면으로 오류를 전달함.
    open.onerror = () => reject(storageError(open.error));
    // 열기와 필요한 업그레이드가 성공했을 때 실행됨. 이 시점에 open.result를 사용함.
    open.onsuccess = () => {
      // blocked 처리로 이미 실패시킨 요청이면 뒤늦게 생긴 연결을 닫고 종료함.
      if (failed) { open.result.close(); return; }
      // 다른 탭에서 DB 버전을 바꾸거나 삭제하려고 하면 이 연결을 닫아 진행을 방해하지 않게 함.
      // 이후 이 페이지에서 저장하려 하면 닫힌 연결 오류가 날 수 있어 새로고침 안내가 필요함.
      open.result.onversionchange = () => open.result.close();
      // 열린 DB 연결 객체를 Promise의 성공값으로 전달함. 위의 await가 이 객체를 db에 넣고 다음 처리를 시작함.
      resolve(open.result);
    };
  });
  try {
    // 연결 후 프로필을 읽고, 없다면 추가함. 추가 가능성이 있어 읽기 전용이 아닌 readwrite를 사용함.
    // 한 트랜잭션으로 조회/추가하여 여러 탭이 동시에 최초 프로필을 만들 때 중복 생성하지 않도록 함.
    const profile = await transaction(db, ['Profile'], 'readwrite', (tx, request, finish) => {
      // 이번 트랜잭션에서 Profile 저장소를 다룰 수 있는 객체를 얻음.
      const store = tx.objectStore('Profile');
      // 기본 키가 'demo'인 프로필을 읽음. get()은 요청 객체를 반환하므로 request()에 결과 콜백을 붙임.
      // 찾으면 existing에 객체가, 없으면 undefined가 들어옴.
      request(store.get('demo'), existing => {
        // 기존 프로필을 그대로 쓰거나 새 프로필 객체를 준비함.
        // toISOString()은 현재 시각을 UTC ISO 문자열로 저장함. 예: 2026-10-11T01:23:45.000Z
        // 새 프로필의 profile_id는 고정 문자열 'demo'로, 기록마다 누구의 기록인지 연결하는 기준임.
        // display_name은 프로필 표시 이름, created_at은 처음 만든 시각임. 현재 화면에서 이 두 값의 별도 편집은 제공하지 않음.
        const row = existing || { profile_id: 'demo', display_name: '나의 필름로그', created_at: new Date().toISOString() };
        // 없을 때만 add()로 새로 넣음. 기존 프로필의 이름/등록 시각을 매번 초기화하지 않음.
        if (!existing) request(store.add(row));
        // Promise로 돌려줄 프로필을 정함. 추가 요청까지 정상 완료되어야 실제로 반환됨.
        finish(row);
      });
    });
    // 객체 속성 이름과 변수 이름이 같으면 { db: db, profile: profile }를 이렇게 줄여 쓸 수 있음.
    return { db, profile };
  // 프로필 준비에 실패한 경우 열린 DB 연결을 정리한 뒤 같은 오류를 다시 전달함.
  // 실패했는데 쓰지 않는 연결만 남는 상황을 방지함.
  } catch (error) { db.close(); throw error; }
}

/** F05. 같은 readonly 트랜잭션에서 프로필·기록·사진 메타데이터만 읽음. */
/**
 * readSnapshot(repo): 현재 프로필의 자료를 한 번에 읽어 화면용 묶음으로 반환함.
 * 입력 repo는 openRepository()의 반환값임.
 * 반환 Promise의 성공값: { profile: 프로필, logs: 감상 기록 배열, assets: 사진 정보 배열 }.
 * 여기의 snapshot(스냅샷)은 이 조회에서 읽은 결과라는 뜻임. 이후 저장소 변경을 자동 반영하는 객체는 아님.
 * 화면을 갱신하려면 다시 readSnapshot()을 호출해야 함.
 * 원본 사진은 용량이 크므로 이 함수에서 읽지 않고 manageMedia(..., 'read', ...)로 필요할 때 가져옴.
 */
export async function readSnapshot(repo) {
  ensureRepository(repo);
  // 열린 저장소 객체가 기억하는 현재 프로필 ID임. 조회와 저장을 이 프로필 기준으로 수행함.
  const profileId = repo.profile.profile_id;
  // 세 저장소를 같은 readonly 트랜잭션에서 읽음. 여기서는 저장된 값을 변경할 수 없음.
  // 읽기 도중 다른 작업의 수정이 일부만 섞이지 않도록 관련 조회를 한 묶음으로 처리함.
  const result = await transaction(repo.db, ['Profile', 'WatchLog', 'MediaAsset'], 'readonly', (tx, request, finish) => {
    // 각 요청의 성공 콜백이 채울 결과 객체임. 처음에는 프로필 없음과 빈 배열을 넣어둠.
    const snapshot = { profile: null, logs: [], assets: [] };
    // 기본 키 profile_id로 프로필 한 건을 조회함.
    // 콜백에서 존재 여부를 확인한 뒤 결과 객체에 넣음. 프로필이 사라졌으면 전체 조회가 실패함.
    // 프로필·기록·사진 정보 조회 요청을 같은 실행 구간에서 등록하고, 각 성공 콜백이 결과 객체를 채움.
    request(tx.objectStore('Profile').get(profileId), profile => { ensureProfile(profile); snapshot.profile = profile; });
    // index('profile_id')는 앞에서 만든 프로필 인덱스를 선택함.
    // getAll(profileId)는 그 값에 해당하는 모든 감상 기록을 배열로 가져옴. 없으면 []임.
    request(tx.objectStore('WatchLog').index('profile_id').getAll(profileId), rows => { snapshot.logs = rows; });
    // 같은 방법으로 현재 프로필의 사진 정보만 읽음. MediaBlob 원본 데이터는 포함하지 않음.
    request(tx.objectStore('MediaAsset').index('profile_id').getAll(profileId), rows => { snapshot.assets = rows; });
    // 이 줄은 각 조회 요청이 끝나기 전에 실행될 수 있음. 하지만 아직 Promise가 성공하는 것은 아님.
    // result와 snapshot이 같은 객체를 가리키므로, 성공 콜백들이 채운 최종 내용을 oncomplete에서 반환함.
    finish(snapshot);
  });
  // sort(비교함수)는 배열 자체의 순서를 바꿈. 이번에 읽은 결과 배열을 정렬할 뿐 DB의 저장 순서를 바꾸지 않음.
  // localeCompare()는 문자열 순서 비교 결과(음수/0/양수)를 반환함.
  // YYYY-MM-DD 형식이 통일되어 있으므로 문자열 순서로 감상 날짜를 비교할 수 있음.
  // b와 a를 비교해 최신 감상일 먼저 → 같은 날이면 최신 등록 시각 먼저 → 둘 다 같으면 기록 ID 순으로 정렬함.
  // 비교 결과 0은 거짓으로 취급되므로 || 뒤의 다음 비교로 넘어감.
  result.logs.sort((a, b) => b.watched_on.localeCompare(a.watched_on) || b.created_at.localeCompare(a.created_at) || a.log_id.localeCompare(b.log_id));
  // 사진 정보는 최신 등록 시각부터 보여주도록 정렬하고, 같은 시각이면 사진 ID로 순서를 정함.
  result.assets.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.asset_id.localeCompare(b.asset_id));
  // profile 객체·정렬된 logs 배열·정렬된 assets 배열을 가진 결과를 호출한 ui.js에 전달함.
  // ui.js는 이 값을 snapshot이라는 이름으로 각 페이지의 render에 넘김.
  return result;
}

/** F07. 기록 CRUD. 완료 시 log_id 반환. 재감상은 별도의 log_id를 발급함. */
/**
 * mutateWatchLog(repo, catalog, action, payload): 감상 기록을 추가/수정/삭제함.
 * repo: 연결 및 현재 프로필, catalog: 영화 ID 확인에 쓸 검증된 카탈로그.
 * action: 'create'(추가), 'update'(수정), 'delete'(삭제) 중 하나.
 * payload: 입력 객체임.
 *   create: movie_id, watched_on, rating, review_text 등 검사에 필요한 입력값.
 *   update: 위 입력값 + log_id + expected_version(화면에서 읽었던 기록 버전).
 *   delete: log_id + expected_version. 날짜/별점 같은 새 내용은 필요하지 않음.
 * 반환: 작업한 log_id 문자열로 성공하는 Promise. 삭제도 삭제한 ID를 반환함.
 * 사진은 영화에 별도로 연결되어 있으므로 감상 기록을 삭제해도 사진을 삭제하지 않음.
 * 같은 영화를 같은 날 여러 번 기록하는 것을 막는 제약은 없으며, 추가할 때마다 새 log_id를 만듦.
 */
export async function mutateWatchLog(repo, catalog, action, payload) {
  ensureRepository(repo);
  // payload가 입력 항목을 담은 객체인지 확인함. 올바른 객체 형태여도 내부 값 검사는 아래에서 추가로 수행함.
  requirePayload(payload);
  // 허용한 세 작업만 실행함. 잘못된 action이면 저장소를 건드리기 전에 중단함.
  if (!['create', 'update', 'delete'].includes(action)) throw new Error('지원하지 않는 감상 기록 작업입니다.');
  // 동기 검증도 트랜잭션 밖에서 끝내어 저장 과정과 분리함.
  // 삭제는 새 감상 내용이 필요 없으므로 검사 결과를 null로 둠.
  // 추가/수정은 validation.js에서 날짜·별점 등을 검사하고 허용한 속성만 담은 객체를 받음.
  // 임의의 payload 전체를 DB에 바로 넣지 않음. 검사 실패의 throw는 async 함수의 실패로 전달됨.
  const valid = action === 'delete' ? null : validateWatchLog(payload, catalog);
  // 추가는 ID를 새로 만들지만 수정/삭제는 기존 기록을 지정해야 하므로 log_id가 필요함.
  if (action !== 'create') requireId(payload.log_id, '감상 기록 ID');
  // 열린 저장소 객체가 기억하는 현재 프로필 ID임. 조회와 저장을 이 프로필 기준으로 수행함.
  const profileId = repo.profile.profile_id;
  // 프로필 확인과 기록 저장을 같은 쓰기 트랜잭션으로 처리함.
  // async 함수에서 Promise를 return하면 호출자는 이 내부 Promise가 끝날 때까지 await할 수 있음.
  return transaction(repo.db, ['Profile', 'WatchLog'], 'readwrite', (tx, request, finish) => {
    // 저장된 프로필이 여전히 존재하는지 먼저 읽은 뒤, 성공 콜백 안에서 후속 요청을 등록함.
    request(tx.objectStore('Profile').get(profileId), profile => {
      ensureProfile(profile);
      // 현재 프로필이 저장소에 존재하는 것을 확인한 뒤 감상 기록 저장소를 사용함.
      const store = tx.objectStore('WatchLog');
      // 추가 처리임. 아래 분기가 끝나면 return하여 수정/삭제 코드로 내려가지 않음.
      if (action === 'create') {
        // 등록 시각과 최초 수정 시각은 같은 현재 시각으로 맞춤.
        // 실제 영화를 본 날짜(watched_on)와 사이트에 기록한 시각(created_at)은 다른 값임.
        const now = new Date().toISOString();
        // 검증된 입력을 펼쳐 넣고, 식별자/소유자/시각/버전은 여기서 정한 값으로 채움.
        // 객체에 같은 속성이 여러 번 있으면 뒤쪽 값이 우선하므로 사용자 입력으로 이 관리 값을 덮어쓸 수 없음.
        // 최초 버전은 1이고 이후 수정할 때 증가함.
        // ...valid에는 movie_id(영화), watched_on(감상일), rating(별점 또는 null), review_text(감상평 또는 null)가 들어 있음.
        // log_id는 새 기록 한 건의 고유 번호임. 같은 영화를 다시 봐도 새 log_id를 만들므로 별개의 기록으로 남음.
        // profile_id는 현재 프로필, created_at은 등록 시각, updated_at은 마지막 저장 시각임.
        // version은 기록 수정 횟수를 추적하는 초기값 1임. DB 구조 버전 DATABASE_VERSION과 구분함.
        const row = { ...valid, log_id: makeId(), profile_id: profileId, created_at: now, updated_at: now, version: 1 };
        // add()는 새 기본 키일 때만 추가함. 같은 키가 이미 있으면 덮어쓰지 않고 실패함.
        request(store.add(row));
        // 성공 반환값으로 새 기록 ID를 예약함. 실제 저장 완료까지는 transaction()이 기다림.
        finish(row.log_id);
        // 신규 추가 요청을 등록했으므로 이 프로필 조회 콜백을 끝냄.
        // 여기서 return해도 트랜잭션 완료를 기다리는 바깥 Promise는 계속 진행됨.
        return;
      }
      // 수정/삭제 요청은 기존 기록을 먼저 읽음. current는 현재 DB에 저장된 최신 객체임.
      request(store.get(payload.log_id), current => {
        // 존재하지 않는 기록이나 다른 프로필의 기록을 수정/삭제하지 못하도록 확인함.
        requireOwner(current, profileId, '감상 기록');
        // 화면을 본 뒤 다른 작업이 기록을 바꿨으면 오래된 내용으로 수정/삭제하는 것을 중단함.
        // 조회·버전 검사·저장이 같은 readwrite 트랜잭션 안에서 이어짐.
        // current.version은 저장소의 현재 버전, payload.expected_version은 상세 화면이 편집을 시작할 때 읽었던 버전임.
        // 예: 화면은 1번 버전을 편집 중인데 다른 탭이 2로 바꿨다면 저장을 거부함.
        // expected_version은 비교용 입력값이며 새 DB 속성으로 저장하지 않음.
        ensureVersion(current, payload.expected_version);
        // 삭제는 이 기본 키의 기록 한 건만 제거함. else는 수정 작업에 해당함.
        if (action === 'delete') request(store.delete(current.log_id));
        else {
          // 기록의 날짜/별점/감상평은 수정 가능하지만 연결 영화 자체를 바꾸는 것은 현재 규칙상 금지함.
          if (current.movie_id !== valid.movie_id) throw new Error('기록의 영화는 변경할 수 없습니다. 다른 영화는 새 기록으로 추가하세요.');
          // Date.now()는 현재 시각의 밀리초 수, Date.parse()는 저장된 시각 문자열을 밀리초 수로 변환함.
          // 두 시각 중 큰 값(Math.max)을 골라, 새 수정 시각이 이전보다 최소 1밀리초 뒤가 되게 함.
          // 같은 밀리초에 연속 저장하거나 시스템 시간이 뒤로 바뀌어도 수정 시각이 역행하지 않도록 함.
          // 기존 updated_at이 유효한 ISO 시각이라는 전제임. 손상된 기존 데이터의 시각 복구 기능은 아님.
          const updatedAt = new Date(Math.max(Date.now(), Date.parse(current.updated_at) + 1)).toISOString();
          // put()은 같은 기본 키가 있으면 객체 전체를 교체하고, 없으면 추가하는 명령임.
          // 여기서는 먼저 기존 기록을 읽었으므로 수정 용도로 사용함.
          // ...current로 기존 속성 유지 → ...valid로 새 입력 반영 → 관리 속성을 명시하여 ID/소유자/등록 시각 고정 순서임.
          request(store.put({
            // 기존 객체의 다른 관리값은 ...current로 유지하고, 입력 항목은 ...valid로 덮어씀.
            // log_id를 기존 값으로 다시 지정하므로 수정이 새 기록 추가로 바뀌지 않음.
            // profile_id 역시 입력값을 사용하지 않고 현재 프로필 ID로 유지함.
            ...current, ...valid, log_id: current.log_id, profile_id: profileId,
            // 최초 등록 시각은 유지하고 수정 시각만 바꿈. 버전은 1 올려 다음 수정 때 충돌을 검사함.
            // created_at: 처음 등록한 시각은 수정하지 않음.
            // updated_at: 방금 계산한 새 저장 시각으로 교체함.
            // version: 기존 버전(없으면 1)에 1을 더함. 다음 수정/삭제 요청은 이 새 버전을 전달해야 함.
            created_at: current.created_at, updated_at: updatedAt, version: (current.version || 1) + 1
          }));
        }
        // 수정 또는 삭제한 기존 기록 ID를 반환할 값으로 정함.
        finish(current.log_id);
      });
    });
  });
}

/**
 * F10. 사진 추가·원본 읽기·삭제. Blob과 메타데이터는 항상 같은 트랜잭션에 포함함.
 * 사진 총량 검사는 모든 프로필의 메타데이터를 readwrite 범위 안에서 읽음.
 * 두 탭에서 동시에 추가해도 쓰기 트랜잭션이 직렬화되어 한도를 넘기지 않음.
 */
/**
 * manageMedia(repo, catalog, action, payload): 사진 정보와 원본을 함께 관리함.
 * action은 'add'(추가), 'read'(원본 읽기), 'delete'(정보 및 원본 삭제)임.
 * 추가 payload: { movie_id, kind, file }. file은 파일 입력창 등에서 얻은 File 객체이며 Blob의 한 종류임.
 * 읽기/삭제 payload: { asset_id }. 이 ID로 정보를 찾은 후 storage_key로 원본을 찾음.
 * 반환 Promise의 성공값: 추가/삭제는 asset_id 문자열, 읽기는 Blob(사진 원본 데이터)임.
 * 이 함수는 업로드 서버로 파일을 전송하지 않음. 현재 브라우저의 IndexedDB에 저장함.
 * 사진을 화면에 표시하려면 호출자가 반환된 Blob을 이미지 주소 등으로 연결해야 함.
 */
export async function manageMedia(repo, catalog, action, payload) {
  ensureRepository(repo);
  // payload가 입력 항목을 담은 객체인지 확인함. 올바른 객체 형태여도 내부 값 검사는 아래에서 추가로 수행함.
  requirePayload(payload);
  // 허용된 작업만 받음. 잘못된 작업 이름은 저장을 시작하기 전에 거부함.
  if (!['add', 'read', 'delete'].includes(action)) throw new Error('지원하지 않는 사진 작업입니다.');
  // 추가 작업에서 검증된 사진 정보가 준비되면 대입함. 읽기/삭제에는 사용하지 않음.
  let validated;
  if (action === 'add') {
    // 사진이 가리키는 영화가 카탈로그에 있는지 확인함. 사진은 특정 감상 기록이 아니라 영화에 연결됨.
    if (!catalog.lookup.movieById.has(payload.movie_id)) throw new Error('사진을 연결할 영화를 선택하세요.');
    // 디코딩에는 시간이 걸릴 수 있으므로 반드시 트랜잭션을 열기 전에 기다림.
    // 파일 종류/용량/파일 내용과 실제 이미지 읽기 가능 여부를 비동기로 검사함.
    // 반환값은 { blob, mime_type, byte_size, kind }임. 이후 저장에는 이 검증 결과를 사용함.
    // 이미지 디코딩을 기다리는 동안 열린 트랜잭션이 자동 종료되지 않도록 DB 트랜잭션을 아직 만들지 않음.
    validated = await validateMedia(payload.file, payload.kind);
  // 읽기/삭제는 새 파일 검사가 필요 없고, 대상 사진 ID가 있어야 함.
  } else requireId(payload.asset_id, '사진 ID');
  // 열린 저장소 객체가 기억하는 현재 프로필 ID임. 조회와 저장을 이 프로필 기준으로 수행함.
  const profileId = repo.profile.profile_id;
  // 읽기 작업은 readonly, 추가/삭제는 readwrite로 요청하여 필요한 접근 범위를 정함.
  const mode = action === 'read' ? 'readonly' : 'readwrite';
  // 프로필 확인 + 사진 정보 + 원본을 하나의 트랜잭션에 포함함.
  // 추가/삭제 중 어느 요청 하나가 실패하면 정보와 원본의 변경이 함께 취소됨.
  return transaction(repo.db, ['Profile', 'MediaAsset', 'MediaBlob'], mode, (tx, request, finish) => {
    // 저장된 프로필이 여전히 존재하는지 먼저 읽은 뒤, 성공 콜백 안에서 후속 요청을 등록함.
    request(tx.objectStore('Profile').get(profileId), profile => {
      ensureProfile(profile);
      // assets는 사진 정보 저장소, blobs는 원본 파일 저장소를 다루는 객체임.
      // 이름에 복수형을 썼지만 아직 사진 배열을 불러온 것은 아님.
      const assets = tx.objectStore('MediaAsset');
      // 같은 트랜잭션 안에서 원본 저장소도 가져옴. assets와 blobs의 변경을 하나의 성공/실패로 묶음.
      const blobs = tx.objectStore('MediaBlob');
      if (action === 'add') {
        // 용량 제한은 현재 프로필만이 아니라 이 DB에 저장된 모든 사진에 대해 적용함.
        // 프로필 인덱스로 제한하지 않고 메타데이터 전체를 읽음. 큰 원본 Blob을 전부 읽을 필요는 없음.
        // 쓰기 트랜잭션 안에서 합계를 읽고 저장하므로, 겹치는 저장소를 쓰는 다른 탭 작업과 순서가 조정됨.
        request(assets.getAll(), rows => {
          // 기존 사진 크기의 합계를 0에서 시작함. 반복하면서 값을 바꾸므로 const 대신 let을 씀.
          let total = 0;
          // 배열 위치 i는 0부터 시작함. rows.length는 사진 정보의 개수임.
          // i < rows.length인 동안 반복하고, 한 번 처리할 때마다 i++로 다음 위치로 이동함.
          for (let i = 0; i < rows.length; i++) {
            // rows[i]는 현재 사진 정보, byte_size는 그 사진의 바이트 크기임.
            // 지금까지의 합계에 이번 사진 크기를 더한 값을 total에 다시 넣음.
            // 기존 메타데이터의 byte_size가 올바른 숫자로 저장되어 있다는 전제임.
            total = total + rows[i].byte_size;
          }
          // 사진이 없으면 반복문을 한 번도 실행하지 않아 total은 0으로 남음.
          // 현재 합계에 새 사진을 더했을 때 50 MiB를 넘으면 throw함.
          // 이 예외는 request()의 성공 콜백 안에서 발생하므로 transaction()이 잡아 전체 저장을 취소함.
          // 앱 자체 제한이며, 브라우저가 실제로 제공하는 저장 용량과 동일한 값이라는 뜻은 아님.
          if (total + validated.byte_size > MEDIA_MAX_TOTAL_BYTES) {
            throw new Error('사진 합계 50 MiB 제한을 넘습니다. 보관함에서 일부 사진을 삭제한 뒤 다시 저장하세요.');
          }
          // 사진 정보의 기본 키와 원본의 기본 키를 각각 만듦.
          // 현재 설계는 asset_id와 storage_key를 별개의 값으로 사용하며 서로 같다고 가정하면 안 됨.
          const assetId = makeId();
          // 원본 Blob에 붙일 별도 고유 번호임. 사진 정보의 storage_key와 원본 행의 기본 키가 같은 값을 사용함.
          const storageKey = makeId();
          // 먼저 원본을 찾을 키와 사진 설명 정보를 등록하는 요청을 만듦.
          // profile_id는 소유자, movie_id는 관련 영화, kind는 ticket/poster/other 분류임.
          // mime_type은 image/jpeg 같은 형식, byte_size는 원본 크기, created_at은 보관함에 등록한 시각임.
          request(assets.add({
            // asset_id: 사진 정보의 고유 번호 / profile_id: 보관한 프로필 / movie_id: 연결할 영화 번호임.
            asset_id: assetId, profile_id: profileId, movie_id: payload.movie_id,
            // kind: 티켓/포스터/기타 구분 / storage_key: 원본을 찾을 키 / mime_type: 검증을 통과한 사진 형식임.
            kind: validated.kind, storage_key: storageKey, mime_type: validated.mime_type,
            // byte_size는 파일 크기(바이트)로 전체 용량 계산에 쓰며, created_at은 사진 보관함에 등록한 시각임.
            byte_size: validated.byte_size, created_at: new Date().toISOString()
          }));
          // 같은 storageKey에 원본 Blob을 저장하는 요청도 등록함.
          // 이미지 파일을 프로젝트 폴더에 생성하지 않으며, catalog.json에 사진 데이터를 써넣지도 않음.
          request(blobs.add({ storage_key: storageKey, blob: validated.blob }));
          // 두 저장 요청 모두 성공한 후 전달할 사진 ID를 정함.
          finish(assetId);
        });
        return;
      }
      // 읽기/삭제에서는 사진 정보를 먼저 찾아, 소유 프로필과 원본 저장 키를 확인함.
      request(assets.get(payload.asset_id), current => {
        // 사진이 없거나 현재 프로필 소유가 아니면 읽기/삭제를 중단함.
        requireOwner(current, profileId, '사진');
        if (action === 'delete') {
          // 사진 설명 정보와 실제 원본을 함께 삭제함. 하나만 남지 않도록 같은 트랜잭션으로 묶여 있음.
          request(assets.delete(current.asset_id));
          // 사진 정보의 키 asset_id가 아니라 그 정보에 연결된 storage_key로 실제 원본을 삭제함.
          request(blobs.delete(current.storage_key));
          // 원본/정보 삭제가 모두 완료되면 삭제한 사진 ID를 반환함.
          finish(current.asset_id);
        } else {
          // 원본 읽기: 사진 정보가 가진 storage_key로 MediaBlob의 한 행을 읽음.
          request(blobs.get(current.storage_key), row => {
            // 원본 행이 존재하고 blob 속성이 실제 Blob인지 확인함.
            // 정보만 남았거나 데이터가 손상되었으면 잘못된 값을 이미지로 넘기지 않고 오류를 알림.
            if (!row || !(row.blob instanceof Blob)) throw new Error('사진 원본을 찾지 못했습니다. 저장소 상태를 확인해 주세요.');
            // 호출자에게 원본 데이터를 전달할 값으로 정함.
            // 이 파일은 img 요소를 만들거나 URL.createObjectURL()로 화면용 주소를 만들지는 않음.
            finish(row.blob);
          });
        }
      });
    });
  });
}
