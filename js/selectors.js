/**
 * [이 파일의 역할: 이미 읽어 온 데이터에서 화면에 필요한 결과 계산]
 * selectors.js는 검색, 통계, 날짜별 기록, 시리즈 시청 여부를 계산합니다.
 * HTML 요소를 만들거나 IndexedDB에 접근하지 않습니다. catalog와 logs를
 * 전달받아 결과를 반환합니다. 현재 메인은 getHomeSummary(), 캘린더는
 * groupLogsByDay(), 영화 검색은 searchMovies()를 사용합니다. 통계 페이지에서도 계산을 재사용할 수 있습니다.
 *
 * catalog: 영화, 장르, 인물, 국가 등의 목록을 담은 객체입니다.
 * logs: 사용자가 저장한 감상 기록 객체들의 배열입니다.
 * 한 영화에 감상 기록이 여러 개 있을 수 있으므로 '본 영화 수'와 '본 횟수'를
 * 구분합니다. 사진 보관 정보는 이 파일의 통계 입력에 포함되지 않습니다.
 *
 * 화면에서 필요한 범위에 맞게 함수를 선택합니다.
 * searchMovies(): 대표 제목·검색 별칭·배우/감독 이름이 검색어를 포함하는 영화 목록을 돌려줍니다.
 * getHomeSummary(): 메인 화면에 필요한 영화 수·감상 횟수·시간만 계산합니다.
 * groupLogsByDay(): 캘린더 등에 사용할 날짜별 감상 기록을 만듭니다.
 * buildProjections(): 위 두 결과에 별점·장르·국가·업적 등을 더한 전체 집계입니다.
 *
 * export가 있는 함수는 다른 파일에서 import하여 사용할 수 있습니다.
 * export가 없는 함수는 이 파일 안에서만 직접 사용하는 보조 함수입니다.
 * 아래 함수들은 입력 배열이나 그 안의 객체를 수정하지 않습니다.
 * 다만 반환값의 일부에는 원본 영화·감상 기록 객체에 대한 참조가 들어갑니다.
 * 반환값 전체를 깊은 복사본으로 생각해서 객체 내용을 수정하면 안 됩니다.
 */

/**
 * normalizeSearch(text): 검색어·검색 대상의 비교 방식을 통일합니다.
 * 매개변수 text는 문자열이어야 하며, 정리한 새 문자열을 반환합니다.
 * 예: '  STAR   Wars  ' → 'star wars'. 원래 문자열은 바뀌지 않습니다.
 */
export function normalizeSearch(text) {
  // typeof로 자료형을 확인합니다. !==는 자료형까지 구분하여 '같지 않다'를 비교합니다.
  // 문자열이 아니면 throw로 실행을 중단하고 TypeError를 호출한 쪽에 전달합니다.
  if (typeof text !== 'string') throw new TypeError('검색어는 문자열이어야 합니다.');

  // 점(.)으로 메서드를 연결하면 앞에서 나온 결과에 다음 처리를 적용합니다.
  // trim(): 앞뒤 공백 제거 → replace(): 연속된 공백을 공백 한 칸으로 변경
  // → toLowerCase(): 영문 대문자를 소문자로 변경합니다.
  // /\s+/g는 정규식입니다. \s는 공백·탭·줄바꿈 같은 공백 문자,
  // +는 '하나 이상 연속', g는 문자열의 모든 해당 부분을 바꾸라는 뜻입니다.
  // 모든 공백을 없애는 기능은 아닙니다. '스타 워즈'와 '스타워즈'는 서로 다릅니다.
  // return은 계산한 값을 호출한 곳에 돌려주고 이 함수 실행을 끝냅니다.
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * lookup(catalog, name, table, id): ID로 객체를 찾는 Map을 준비합니다.
 * name: 미리 준비된 조회용 Map 이름(예: 'movieById').
 * table: 그 Map이 없을 때 사용할 배열 이름(예: 'Movie').
 * id: 배열 각 행에서 키로 사용할 속성 이름(예: 'movie_id').
 * 반환값 예: Map { 'm001' => 영화 객체, 'm002' => 영화 객체 }.
 */
function lookup(catalog, name, table, id) {
  // catalog.lookup?.[name]: lookup이 null/undefined이면 오류 대신 undefined입니다.
  // ?.는 선택적 연결, [name]은 변수 name에 들어 있는 이름의 속성을 읽는 문법입니다.
  // ??는 왼쪽 값이 null/undefined일 때만 오른쪽 식을 계산하여 사용합니다.
  // 이미 Map이 있으면 그것을 그대로 반환하고, 없으면 새 Map을 만듭니다.
  // map()은 각 row를 [키, 값] 쌍으로 바꾼 새 배열을 만들며 원본을 바꾸지 않습니다.
  // new Map(쌍의 배열)은 그 쌍들을 등록합니다. 새 Map을 catalog에 저장하지는 않습니다.
  return catalog.lookup?.[name] ?? new Map(catalog[table].map(row => [row[id], row]));
}

/**
 * searchMovies(catalog, query): 검색어가 포함된 영화들을 새 배열로 반환합니다.
 * 검색 대상은 대표 제목, MovieAlias의 별칭, MovieCredit으로 연결된 인물 이름입니다.
 * 현재 원제(original_title)는 검색하지 않습니다. 배우·감독도 별도 검색 방식이
 * 아니라, 영화와 연결된 인물의 이름을 후보 문자열에 추가하여 검색합니다.
 */
export function searchMovies(catalog, query) {
  // const는 변수에 다른 값을 다시 대입하지 못하게 합니다.
  // const로 만든 배열/객체의 내부까지 수정 불가능해지는 것은 아닙니다.
  // query는 검색 입력창에서 받은 원문이고, key는 공백·대소문자를 정리한 비교용 검색어입니다.
  // 같은 key를 모든 영화에 재사용하며, 검색할 때마다 영화 데이터 자체를 바꾸지 않습니다.
  const key = normalizeSearch(query);
  // 이미 준비된 catalog.lookup.personById가 있으면 사용합니다.
  // 없으면 catalog.Person 배열의 person_id를 키로 하는 Map을 만들어, 아래에서 출연/연출자의 이름을 찾습니다.
  const people = lookup(catalog, 'personById', 'Person', 'person_id');

  // filter(판정 함수)는 각 영화를 검사해서 true인 영화만 모은 새 배열을 만듭니다.
  // movie => { ... }는 movie를 매개변수로 받는 화살표 함수입니다.
  // 검색 결과의 순서는 원래 catalog.Movie의 순서를 따릅니다.
  return catalog.Movie.filter(movie => {
    // 빈 문자열 ''은 조건문에서 false로 취급됩니다. !는 참/거짓을 뒤집습니다.
    // 검색어가 비었다면 모든 영화에 대해 true를 반환하여 전체 목록을 보여줍니다.
    // 여기의 return은 filter에 전달한 함수의 종료이며 searchMovies 전체 종료가 아닙니다.
    if (!key) return true;

    // 한 영화에서 검색할 문구들을 담습니다. 먼저 대표 제목을 넣습니다.
    // candidates는 '현재 검사 중인 영화 한 편'의 검색 대상 문자열 배열입니다.
    // 영화별 filter 콜백이 실행될 때마다 새 배열을 만들므로 다른 영화의 제목/별칭과 섞이지 않습니다.
    const candidates = [movie.title];

    // for...of는 배열의 항목을 하나씩 꺼냅니다. 현재 영화와 연결된 별칭만 추가합니다.
    // ===는 자료형과 값이 모두 같은지 비교하고, push()는 배열 끝에 항목을 추가합니다.
    for (const alias of catalog.MovieAlias) {
      // alias.movie_id는 이 별칭이 가리키는 영화 번호, movie.movie_id는 지금 검사하는 영화 번호입니다.
      // 두 번호가 같을 때만 별칭 문자열(alias.alias)을 현재 영화의 후보 배열 끝에 붙입니다.
      if (alias.movie_id === movie.movie_id) candidates.push(alias.alias);
    }

    // 영화·인물 연결 목록을 따라 인물의 이름을 얻습니다. get(ID)는 Map의 값 조회입니다.
    // 사람이 조회되지 않으면 ?.name 결과는 undefined이며, 아래 문자열 검사에서 제외됩니다.
    for (const credit of catalog.MovieCredit) {
      // credit.person_id로 연결된 인물 객체를 찾고 그 객체의 name만 후보에 넣습니다.
      // 배우와 감독을 따로 구분해 검색하는 것이 아니라, 연결된 두 역할 모두 같은 이름 후보에 포함합니다.
      if (credit.movie_id === movie.movie_id) candidates.push(people.get(credit.person_id)?.name);
    }

    // some()은 후보 중 하나라도 조건을 만족하면 true를 반환하며 검사를 끝냅니다.
    // &&는 왼쪽이 참으로 평가될 때만 오른쪽을 실행하는 단락 평가 연산자입니다.
    // 따라서 undefined를 normalizeSearch에 넘기지 않습니다.
    // includes(key)는 문자열 안에 key가 들어 있는지 검사합니다. 오타 보정이나
    // 초성 검색은 하지 않으며, 저장된 normalized_alias 속성도 여기서는 사용하지 않습니다.
    // 이 return 값은 현재 영화 한 편을 결과에 포함할지(true), 제외할지(false)를 filter에 알려줍니다.
    // true가 된 영화 객체는 원본과 같은 객체입니다. 반환된 배열의 영화 속성을 바꾸면 원본에도 반영될 수 있습니다.
    return candidates.some(value => typeof value === 'string' && normalizeSearch(value).includes(key));
  });
}

/**
 * compareLogs(a, b): sort()에 전달할 감상 기록 정렬 기준입니다.
 * 반환값이 음수면 a를 먼저, 양수면 b를 먼저, 0이면 같은 순위로 취급합니다.
 * 1순위는 감상 날짜 내림차순, 2순위는 등록 시각 내림차순,
 * 마지막은 기록 ID 오름차순입니다. 같은 날짜·시각에도 순서를 일정하게 만듭니다.
 */
function compareLogs(a, b) {
  // localeCompare()는 두 문자열의 순서를 비교해 음수/0/양수를 반환합니다.
  // YYYY-MM-DD처럼 자릿수가 통일된 날짜는 문자열 비교로 날짜 순서를 정할 수 있습니다.
  // b와 a 순서로 비교하므로 최근 감상 날짜가 먼저 오는 내림차순입니다.
  const dateOrder = b.watched_on.localeCompare(a.watched_on);

  // 날짜가 다르면 이 결과만으로 순서를 정할 수 있습니다.
  // return하면 함수가 끝나므로 뒤의 등록 시각과 ID는 비교하지 않습니다.
  if (dateOrder !== 0) {
    return dateOrder;
  }

  // 여기까지 왔다는 것은 감상 날짜가 같다는 뜻입니다.
  // 이때 등록 시각이 더 최근인 기록을 먼저 놓습니다.
  const createdOrder = b.created_at.localeCompare(a.created_at);
  if (createdOrder !== 0) {
    return createdOrder;
  }

  // 감상 날짜와 등록 시각이 모두 같을 때만 기록 ID를 비교합니다.
  // 이번에는 a와 b 순서로 비교하여 ID 오름차순으로 일정한 순서를 만듭니다.
  return a.log_id.localeCompare(b.log_id);
}

/**
 * getHomeSummary(catalog, logs): 메인 화면의 요약 숫자 세 개만 계산합니다.
 * catalog는 영화 기본 정보, logs는 감상 기록 배열입니다.
 * 반환값:
 * - unique_movie_count: 한 번 이상 본 서로 다른 영화 수.
 * - watch_count: 재감상을 포함한 전체 감상 횟수.
 * - runtime_total: 각 감상 기록에 해당하는 상영 시간을 모두 더한 분 단위 값.
 *
 * 예를 들어 120분인 영화 A를 두 번 보고 90분인 영화 B를 한 번 봤다면
 * 영화 수 2편, 감상 횟수 3회, 감상 시간 330분이 됩니다.
 * 상영 시간이 null인 영화는 영화 수·감상 횟수에는 포함하고 시간 합계에서만 제외합니다.
 *
 * 메인 화면에 필요 없는 날짜 분류·별점·장르·국가·업적은 계산하지 않습니다.
 * 따라서 이 함수 자체가 별점이나 날짜를 검증하는 것도 아닙니다. 입력 검증은
 * validation.js 및 저장소의 역할이며, 여기서는 연결된 영화의 존재를 확인합니다.
 * 입력 배열을 정렬하거나 수정하지 않으며, 새 요약 객체를 반환합니다.
 */
export function getHomeSummary(catalog, logs) {
  // ID로 영화를 찾기 위한 Map을 준비합니다. get(ID)로 해당 영화 객체를 얻을 수 있습니다.
  const movies = lookup(catalog, 'movieById', 'Movie', 'movie_id');

  // Set에는 같은 영화 ID를 여러 번 넣어도 하나만 남습니다.
  // 이것으로 '여러 번 본 같은 영화'를 영화 수에 중복 반영하지 않습니다.
  const watched = new Set();

  // 기록을 하나씩 읽으며 시간을 더하므로 값을 바꿀 수 있는 let을 사용합니다.
  let runtime_total = 0;

  // for...of는 감상 기록 배열의 항목을 하나씩 log에 넣어 반복합니다.
  for (const log of logs) {
    const movie = movies.get(log.movie_id);

    // 없는 영화의 상영 시간을 읽으면 올바른 합계를 만들 수 없으므로 오류를 전달합니다.
    // 이 함수만 호출하는 메인 페이지에서도 잘못된 영화 연결을 조용히 무시하지 않습니다.
    if (!movie) {
      throw new Error(`기록이 참조하는 영화가 없습니다: ${log.movie_id}`);
    }

    // 이번 기록의 영화 ID를 감상한 영화 집합에 등록합니다. 이미 있던 ID는 중복 추가되지 않습니다.
    watched.add(log.movie_id);

    // null은 '상영 시간 정보 없음'입니다. !==는 자료형까지 포함하여 같지 않은지 비교합니다.
    // +=는 기존 합계에 오른쪽 값을 더해 다시 저장합니다.
    // 이 코드는 영화별로 한 번이 아니라 감상 기록마다 실행되므로 재감상 시간도 포함합니다.
    if (movie.runtime_min !== null) {
      runtime_total += movie.runtime_min;
    }
  }

  // Set.size는 중복을 제거한 영화 수, 배열.length는 모든 감상 기록 수입니다.
  // 값이 하나도 없으면 두 개수와 시간 합계가 모두 0인 객체를 반환합니다.
  return {
    // 속성 이름 unique_movie_count에 Set 원소 개수(재감상을 제외한 서로 다른 영화 수)를 넣습니다.
    unique_movie_count: watched.size,
    // 속성 이름 watch_count에는 기록 배열 길이를 넣습니다. 같은 영화의 재감상도 한 건씩 셉니다.
    watch_count: logs.length,
    // 속성 이름 runtime_total에 앞에서 누적한 분 단위 합계를 넣습니다. 시/분 문구 변환은 화면의 역할입니다.
    runtime_total: runtime_total
  };
}

/**
 * groupLogsByDay(logs): 감상 기록을 날짜별 배열로 묶습니다.
 * 반환값 예: { '2026-10-11': [기록1, 기록2], '2026-10-10': [기록3] }.
 * 기록이 없으면 빈 객체 {}를 반환합니다.
 *
 * 날짜별 기록은 compareLogs의 기준에 따라 최근 기록부터 들어갑니다.
 * 같은 날짜라면 등록 시각이 최신인 기록부터, 그마저 같으면 ID순입니다.
 * 날짜의 실제 존재 여부를 새로 검사하지는 않으며, 검증된 기록을 전달받는 함수입니다.
 * 원본 배열은 바꾸지 않지만, 결과 배열 안의 기록 객체는 원본과 같은 객체입니다.
 */
export function groupLogsByDay(logs) {
  // slice()에 인수를 주지 않으면 배열의 전체 항목을 복사한 새 배열이 됩니다.
  // 각 기록 객체까지 복사하는 깊은 복사는 아닙니다.
  const sortedLogs = logs.slice();

  // sort()는 대상 배열의 순서를 바꾸므로 위에서 만든 복사본에만 적용합니다.
  // 비교 규칙은 별도 함수에 두어 이 함수를 쓰는 모든 화면이 같은 기준을 사용합니다.
  sortedLogs.sort(compareLogs);

  // 날짜 문자열을 속성 이름으로 쓰는 객체입니다. 처음에는 아무 날짜도 없습니다.
  const by_day = {};
  for (const log of sortedLogs) {
    // '2026-10-12' 같은 감상 날짜 문자열을 객체의 속성 이름으로 쓰기 위해 꺼냅니다.
    const day = log.watched_on;

    // 해당 날짜의 배열이 없으면 먼저 빈 배열을 만듭니다.
    // undefined는 아직 속성이 없다는 뜻, null은 명시적으로 값이 없다는 뜻입니다.
    // ||는 둘 중 한 조건이라도 참이면 이 if 안으로 들어가게 합니다.
    if (by_day[day] === undefined || by_day[day] === null) {
      // 예: day가 '2026-10-12'이면 by_day['2026-10-12']에 기록을 담을 새 배열을 만듭니다.
      by_day[day] = [];
    }

    // push()는 배열 마지막에 항목을 추가합니다.
    // 먼저 정렬했으므로 날짜별 배열 안에서도 정해진 기록 순서가 유지됩니다.
    by_day[day].push(log);
  }

  // 날짜별 배열을 담은 결과 객체를 반환합니다. 캘린더에서는 by_day[선택날짜]로 해당 기록들을 꺼냅니다.
  return by_day;
}

/**
 * relationIndex(rows, valueKey): 연결 테이블을 영화별로 묶습니다.
 * rows에는 MovieGenre 또는 MovieCountry 배열이 들어오고,
 * valueKey에는 'genre_id' 또는 'country_code' 같은 속성 이름이 들어옵니다.
 * 반환값 예: Map { 'm001' => Set { 'g01', 'g02' } }.
 * Map은 영화 ID별 검색을, Set은 같은 영화에 같은 분류가 중복되는 것을 방지합니다.
 */
function relationIndex(rows, valueKey) {
  // 영화 ID별로 Set을 보관할 빈 Map입니다. 한 영화에 장르/국가가 여러 개 연결되는 관계를 담습니다.
  const result = new Map();
  for (const row of rows) {
    // has()는 키가 있는지 검사합니다. 처음 만난 영화에만 비어 있는 Set을 만듭니다.
    // set(키, 값)은 Map에 값을 넣고, add(값)는 Set에 값을 넣습니다.
    if (!result.has(row.movie_id)) result.set(row.movie_id, new Set());
    // get()으로 이 영화의 Set을 꺼내고, valueKey가 가리키는 genre_id 또는 country_code를 추가합니다.
    // Map에 새 키를 만드는 set()과, Set 내부에 값을 추가하는 add()를 구분해서 읽습니다.
    result.get(row.movie_id).add(row[valueKey]);
  }
  return result;
}

/**
 * buildProjections(catalog, logs): 화면 여러 곳에서 쓸 통계를 한 번에 계산합니다.
 * catalog는 검증된 기본 자료, logs는 검증된 감상 기록 배열을 기대합니다.
 * 결과 객체에는 총 감상 횟수, 서로 다른 영화 수, 시간 합계, 별점 평균,
 * 날짜별/월별/별점별/장르별/국가별 분류, 국가별 영화 목록, 업적 진행도가 있습니다.
 *
 * 같은 영화를 2번 봤으면 감상 횟수·상영 시간 합계에는 2번 반영하지만,
 * 서로 다른 영화 수·장르별 영화 수·국가별 영화 수에는 영화 1편으로 반영합니다.
 * ratio와 progress는 0~100 백분율 숫자입니다. 0~1 비율이 아닙니다.
 * 계산 결과를 DB에 저장하지 않으며, 호출할 때마다 새로 계산합니다.
 * 기본 요약은 getHomeSummary(), 날짜별 묶음은 groupLogsByDay()를 재사용합니다.
 * 메인 화면에서 이 전체 함수를 호출할 필요는 없으며, 전체 통계가 필요한 화면에서 사용합니다.
 */
export function buildProjections(catalog, logs) {
  // 아래에서 반복 조회할 영화 정보와 영화별 장르/국가 연결을 먼저 준비합니다.
  const movies = lookup(catalog, 'movieById', 'Movie', 'movie_id');
  // 영화 ID → 장르 ID 집합을 만듭니다. 같은 영화를 반복해서 볼 때 연결 배열을 매번 다시 검색하지 않게 합니다.
  const movieGenres = relationIndex(catalog.MovieGenre, 'genre_id');
  // 영화 ID → 제작 국가 코드 집합을 만듭니다. 공동 제작 영화는 집합에 국가 코드가 여러 개 들어갑니다.
  const movieCountries = relationIndex(catalog.MovieCountry, 'country_code');

  // {}는 빈 객체입니다. 나중에 by_month['2026-10']처럼 연월을 속성 이름으로 씁니다.
  // 속성 값에는 그달의 감상 횟수를 누적합니다. 날짜별 묶음은 아래의 공통 함수로 만듭니다.
  const by_month = {};

  // 별점별 통계를 넣을 빈 객체를 만들고, 0.5부터 5까지 열 구간을 준비합니다.
  const by_rating = {};

  // for(초기값; 반복 조건; 반복 후 처리)입니다. i가 1부터 10까지 하나씩 증가합니다.
  // i / 2는 0.5, 1, 1.5, ... 5가 되므로 0.5 단위 별점 구간을 만들 수 있습니다.
  for (let i = 1; i <= 10; i++) {
    const rating = i / 2;
    // 객체 속성 이름으로 사용할 '0.5', '1', '1.5' 같은 문자열을 만듭니다. 표시용 소수 자리수 지정은 아닙니다.
    const key = String(rating);

    // count는 이 별점을 준 기록 수, ratio는 별점 있는 기록 중 차지하는 비율입니다.
    // 예: by_rating['4.5'] = { count: 0, ratio: 0 }.
    by_rating[key] = { count: 0, ratio: 0 };
  }

  // 장르와 국가도 카탈로그의 모든 항목을 먼저 넣어 두어, 감상한 영화가 없어도 0을 표시합니다.
  // for...of로 장르 하나씩 읽고 해당 ID 이름의 속성에 초기값을 넣습니다.
  const by_genre = {};
  for (const genre of catalog.Genre) {
    // 이 장르의 영화 수(count)와 비율(ratio)을 각각 0으로 초기화합니다. 매 장르마다 새 객체를 만듭니다.
    by_genre[genre.genre_id] = { count: 0, ratio: 0 };
  }

  // 국가도 같은 방식입니다. country_code에는 KR, US 같은 문자열이 들어갑니다.
  const by_country = {};
  for (const country of catalog.Country) {
    // 이 국가의 영화 수와 비율도 각각 0에서 시작합니다. 아직 감상한 영화가 없는 국가도 결과에 남깁니다.
    by_country[country.country_code] = { count: 0, ratio: 0 };
  }

  // 국가별로 어떤 영화를 감상했는지 영화 ID 배열을 넣을 공간입니다.
  const country_movies = {};

  // Set은 같은 값을 여러 번 add()해도 하나만 보관합니다.
  // watched는 아래 장르·국가 집계에서 '본 영화인지' 확인하기 위한 영화 ID 모음입니다.
  // genres는 경험한 장르 ID의 중복을 제거합니다. 기본 영화 수·시간은 공통 함수에서 계산합니다.
  const watched = new Set();
  // 위의 by_genre와 달리 경험한 장르의 ID만 중복 없이 모읍니다. 나중에 장르 수 업적 계산에 사용합니다.
  const genres = new Set();

  // 합계를 계속 더해야 하므로 let으로 선언합니다.
  // rated_count는 별점을 매긴 감상 기록 수이고 ratingTotal은 그 별점들의 합입니다.
  let rated_count = 0;
  // 별점을 매긴 기록의 점수 합계를 모읍니다. 나중에 rated_count로 나누어 평균을 계산합니다.
  let ratingTotal = 0;

  // 원본 배열 순서를 바꾸지 않도록 복사한 뒤, 기록을 처리할 순서를 정합니다.
  // 전체 집계는 기존과 같이 최근 기록부터 확인하므로 오류를 확인하는 순서도 유지합니다.
  const sortedLogs = logs.slice();
  sortedLogs.sort(compareLogs);
  for (const log of sortedLogs) {
    const movie = movies.get(log.movie_id);
    // 연결된 영화가 없으면 잘못된 통계를 만들지 않고 오류를 전달합니다.
    // 백틱(`) 문자열의 ${...}는 표현식의 값을 문장 안에 끼워 넣습니다.
    if (!movie) throw new Error(`기록이 참조하는 영화가 없습니다: ${log.movie_id}`);
    // 이번 기록의 영화 ID를 감상한 영화 집합에 등록합니다. 이미 있던 ID는 중복 추가되지 않습니다.
    watched.add(log.movie_id);

    // slice(0, 7)는 문자열 인덱스 0부터 6까지를 잘라 '2026-10' 형태를 만듭니다.
    // 이 날짜를 해당 월의 감상 횟수에 포함합니다.
    const month = log.watched_on.slice(0, 7);
    // 처음 집계하는 월은 누적값이 없으므로 0으로 시작합니다.
    if (by_month[month] === undefined || by_month[month] === null) {
      by_month[month] = 0;
    }
    // 이번 감상 기록 한 건을 해당 월의 횟수에 더합니다. 같은 영화라도 다른 감상 기록이면 다시 1을 더합니다.
    by_month[month] += 1;

    // 별점이 없는 기록(null)은 평균과 별점 분포에서 제외합니다.
    // 이 코드는 입력 검증이 끝난 기록을 전제로 합니다. undefined를 null처럼 취급하지 않습니다.
    if (log.rating !== null) {
      // 예: 별점이 4.5이면 by_rating['4.5']에 이미 만든 집계 객체를 꺼냅니다.
      const bucket = by_rating[String(log.rating)];
      // bucket은 현재 별점 구간의 { count, ratio } 객체를 가리키는 변수입니다.
      // 0.5 단위가 아닌 별점 등 해당 구간이 없으면 오류로 처리합니다.
      if (!bucket) throw new Error(`기록의 평점이 올바르지 않습니다: ${log.log_id}`);
      // 해당 별점을 준 기록 수를 1 늘립니다. bucket은 원래 집계 객체를 가리키므로 by_rating에도 반영됩니다.
      bucket.count += 1;
      // 별점이 있는 전체 기록 수를 1 늘립니다. 별점 미입력 기록은 이 분기 밖이라 포함되지 않습니다.
      rated_count += 1;
      // 횟수 1이 아니라 실제 점수(예: 4.5)를 합계에 더합니다.
      ratingTotal += log.rating;
    }
  }

  // 기본 영화 수·감상 횟수·상영 시간의 계산법은 공통 함수 한 곳에 둡니다.
  // 정렬된 기록을 전달하여 전체 집계의 시간 합산 순서도 기존과 같게 유지합니다.
  const summary = getHomeSummary(catalog, sortedLogs);

  // 날짜별 기록 배열도 공통 함수를 사용합니다. 이 함수 안에서 복사·정렬하므로
  // 캘린더가 groupLogsByDay()만 단독 호출해도 동일한 순서를 얻을 수 있습니다.
  const by_day = groupLogsByDay(sortedLogs);

  // 앞에서는 '감상 기록 단위'로 세었고, 여기서는 '영화 단위'로 셉니다.
  // 카탈로그 순서대로 순회하여 국가별 영화 목록의 순서도 일정하게 유지합니다.
  for (const movie of catalog.Movie) {
    // continue는 현재 반복의 나머지를 건너뛰고 다음 영화로 넘어갑니다.
    // 감상 기록에 없는 영화는 장르·국가 통계에 포함하지 않습니다.
    if (!watched.has(movie.movie_id)) continue;

    // 연결 정보가 없으면 ?? []로 빈 배열을 사용해 반복을 0번 수행합니다.
    // Set과 배열은 모두 for...of로 순회할 수 있습니다.
    for (const genreId of movieGenres.get(movie.movie_id) ?? []) {
      // 감상 경험이 있는 장르로 등록합니다. 같은 장르 영화를 여러 편 봐도 Set의 장르 수는 한 번만 늘어납니다.
      genres.add(genreId);
      if (!by_genre[genreId]) throw new Error(`알 수 없는 장르입니다: ${genreId}`);
      // 이 장르에 속한 감상 영화 수를 1 늘립니다. 현재 반복은 로그가 아닌 영화 한 편 단위입니다.
      by_genre[genreId].count += 1;
    }

    // 공동 제작 영화는 각 제작 국가에 1편씩 반영합니다. 국가 하나를 대표로 고르지 않습니다.
    for (const code of movieCountries.get(movie.movie_id) ?? []) {
      if (!by_country[code]) throw new Error(`알 수 없는 국가입니다: ${code}`);
      // 해당 제작 국가의 영화 수를 1 늘립니다. 공동 제작 영화는 각 국가의 반복에서 각각 반영됩니다.
      by_country[code].count += 1;
      // 이 국가의 영화 목록을 처음 만들 때만 빈 배열을 준비합니다.
      // 다음에 같은 국가를 만나면 기존 배열에 영화 ID를 추가합니다.
      if (country_movies[code] === undefined || country_movies[code] === null) {
        country_movies[code] = [];
      }
      // 예: country_movies['KR'] 배열에 이 영화 ID를 추가해, 국가를 선택했을 때 영화 목록을 찾을 수 있게 합니다.
      country_movies[code].push(movie.movie_id);
    }
  }

  // 메인 화면과 전체 집계가 서로 다른 계산 규칙을 갖지 않도록 공통 결과를 사용합니다.
  // 공통 요약 객체에서 서로 다른 감상 영화 수를 꺼냅니다. 아래 장르/국가 비율의 분모로도 사용합니다.
  const unique_movie_count = summary.unique_movie_count;
  // 공통 요약에서 계산한 총 감상 시간(분)을 꺼내 결과와 업적 계산에 재사용합니다.
  const runtime_total = summary.runtime_total;

  // 조건 ? 참일_때_값 : 거짓일_때_값은 삼항 연산자입니다.
  // 전체 수가 0일 때 0으로 나누지 않고 0%를 반환하도록 합니다.
  const percent = (count, total) => total === 0 ? 0 : count / total * 100;

  // Object.values()는 객체의 속성 값들만 배열로 가져옵니다.
  // 별점 비율의 분모는 '별점 있는 기록 수', 장르·국가 비율의 분모는 '서로 다른 영화 수'입니다.
  // 한 영화에 여러 장르/국가가 있으므로 장르 또는 국가 비율의 합은 100%를 넘을 수 있습니다.
  // bucket.ratio를 바꾸면 위에서 새로 만든 통계 객체에 그 비율이 저장됩니다.
  // 각 별점 구간의 기록 수 ÷ 별점이 있는 전체 기록 수 × 100입니다.
  for (const bucket of Object.values(by_rating)) bucket.ratio = percent(bucket.count, rated_count);
  // 각 장르의 감상 영화 수 ÷ 서로 다른 감상 영화 수 × 100입니다. 재감상 횟수로 나누지 않습니다.
  for (const bucket of Object.values(by_genre)) bucket.ratio = percent(bucket.count, unique_movie_count);
  // 각 국가의 감상 영화 수 ÷ 서로 다른 감상 영화 수 × 100입니다.
  for (const bucket of Object.values(by_country)) bucket.ratio = percent(bucket.count, unique_movie_count);

  // 업적 규칙이 참조할 수 있는 지표 목록입니다. { unique_movie_count }는
  // { unique_movie_count: unique_movie_count }와 같은 '속성 이름 생략 표기'입니다.
  const metrics = { unique_movie_count, runtime_total, genre_count: genres.size };

  // 각 업적 규칙을 현재 진행도 객체로 바꿉니다. 규칙 원본은 변경하지 않습니다.
  const achievements = catalog.AchievementRule.map(rule => {
    // Object.hasOwn()은 metrics에 직접 정의된 속성인지 확인합니다.
    // 규칙에 모르는 지표 이름이 들어 있으면 엉뚱한 값으로 계산하지 않도록 중단합니다.
    if (!Object.hasOwn(metrics, rule.metric)) throw new Error(`지원하지 않는 업적 지표입니다: ${rule.metric}`);
    // 규칙의 metric이 'runtime_total'이면 시간 합계를, 'genre_count'이면 경험한 장르 수를 꺼냅니다.
    const current = metrics[rule.metric];
    return {
      // 원래 규칙의 고유 번호입니다. 어느 업적의 계산 결과인지 구분하는 데 사용합니다.
      rule_id: rule.rule_id,
      // 무엇을 집계하는 업적인지 나타내는 지표 이름을 함께 반환합니다.
      metric: rule.metric,
      // 업적 화면에서 보여줄 문구를 규칙 원본에서 그대로 가져옵니다.
      label: rule.label,
      // 목표값입니다. 예: 서로 다른 영화 10편을 목표로 하면 10입니다.
      target: rule.target,
      // current: current의 축약 표기입니다. 현재 달성한 편수/분/장르 수를 넣습니다.
      current,
      // Math.min으로 최대 100, Math.max로 최소 0을 지정하여 표시 진행도를 0~100에 맞춥니다.
      // target은 카탈로그 검사에서 양수인 것으로 보장되어야 합니다.
      progress: Math.max(0, Math.min(100, current / rule.target * 100)),
      // >= 비교 결과 true/false를 저장합니다. 목표 이상이면 업적 달성입니다.
      achieved: current >= rule.target
    };
  });

  // 한 객체에 모든 계산 결과를 담아 반환합니다. 각 화면은 필요한 속성만 읽으면 됩니다.
  // by_day 배열에는 원래 log 객체의 참조가 들어 있으나, 이 함수 자체는 log를 수정하지 않습니다.
  return {
    unique_movie_count,
    // 재감상을 포함한 감상 기록 수입니다. 공통 요약 함수의 결과를 그대로 사용합니다.
    watch_count: summary.watch_count,
    // 분 단위 총 감상 시간입니다. 원본 영화의 runtime_min이 없는 기록은 시간 합계에서 제외됩니다.
    runtime_total,
    // 별점을 실제 입력한 감상 기록 수입니다. 별점 평균과 분포의 기준 개수입니다.
    rated_count,
    // 별점이 전혀 없으면 평균을 0점으로 표시하지 않도록 null을 반환합니다.
    rating_average: rated_count === 0 ? null : ratingTotal / rated_count,
    // 감상 영화들에서 만난 서로 다른 장르 개수입니다.
    genre_count: genres.size,
    // 'YYYY-MM-DD' → 그 날짜의 감상 기록 배열입니다.
    by_day,
    // 'YYYY-MM' → 그달의 감상 횟수 숫자입니다. by_day와 달리 값이 배열이 아닙니다.
    by_month,
    // 별점 문자열 → { count, ratio } 집계 객체입니다.
    by_rating,
    // 장르 ID → { count, ratio } 집계 객체입니다.
    by_genre,
    // 국가 코드 → { count, ratio } 집계 객체입니다.
    by_country,
    // 국가 코드 → 감상한 영화 ID 배열입니다. 실제 영화 제목 등은 ID로 카탈로그에서 찾습니다.
    country_movies,
    // 규칙별 현재값·진행률·달성 여부를 계산한 배열입니다. 규칙 배열 원본과 별도의 새 배열입니다.
    achievements
  };
}

/**
 * getSeriesProgress(catalog, logs, series_id): 한 시리즈의 영화별 감상 여부를 반환합니다.
 * 반환값은 [{ movie_id, title, release_order, watched }, ...] 형태의 새 배열입니다.
 * 시리즈 전체 퍼센트를 반환하는 함수는 아닙니다. watched에는 true/false가 들어갑니다.
 */
export function getSeriesProgress(catalog, logs, series_id) {
  // 전달받은 series_id가 실제 시리즈 목록에 있는지 확인할 조회용 Map입니다.
  const series = lookup(catalog, 'seriesById', 'Series', 'series_id');
  if (!series.has(series_id)) throw new Error('존재하지 않는 시리즈입니다.');
  const movies = lookup(catalog, 'movieById', 'Movie', 'movie_id');

  // 모든 기록에서 영화 ID만 꺼내 Set에 넣습니다. 한 번이라도 본 영화는 watched에 있습니다.
  // 같은 영화에 기록이 여러 개 있어도 시리즈의 한 편을 여러 번 완료했다고 세지 않습니다.
  const watched = new Set(logs.map(log => log.movie_id));

  // filter → sort → map 순서로 실행합니다.
  // filter가 새 배열을 만들기 때문에 뒤의 sort가 원본 SeriesMovie 순서를 변경하지 않습니다.
  // release_order는 연결 데이터에 저장된 숫자이며 개봉 날짜로 여기서 다시 계산하지 않습니다.
  // map의 row => ({ ... })에서 괄호는 중괄호를 '함수 본문'이 아니라 '객체 값'으로 해석하게 합니다.
  return catalog.SeriesMovie
    .filter(row => row.series_id === series_id)
    .sort((a, b) => a.release_order - b.release_order)
    .map(row => ({
      // 이 시리즈 연결 행에 포함된 영화의 고유 번호입니다.
      movie_id: row.movie_id,
      // 영화 ID로 카탈로그의 영화 객체를 찾아 화면에 쓸 대표 제목만 가져옵니다.
      title: movies.get(row.movie_id).title,
      // 시리즈 안에서 정한 개봉 순서 번호를 그대로 전달합니다. 이야기 시간순 번호와는 별개입니다.
      release_order: row.release_order,
      // 감상 기록에 이 영화가 한 번이라도 있었는지 boolean으로 전달합니다. 특정 별점을 요구하지 않습니다.
      watched: watched.has(row.movie_id)
    }));
}
