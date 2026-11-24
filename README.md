# FILMLOG · 영화 리뷰 및 감상 아카이브

웹프로그래밍 4인 팀 프로젝트입니다. 영화를 검색하고 감상 날짜·별점·관람평을 기록하며, 개인 캘린더·통계·업적·사진 보관함으로 감상 이력을 관리합니다. 영화 상세 화면에서는 여러 사용자의 평균 별점과 공개 관람평을 함께 확인할 수 있습니다.

- **배포 사이트:** [FILMLOG](https://ssutest.pythonanywhere.com/)
- **실행·배포 안내:** [SERVER_GUIDE.md](SERVER_GUIDE.md)
- **외부 코드·이미지·글꼴 출처:** [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

현재 `main`은 **Flask + MySQL 서버 버전**입니다. 영화 기본 자료는 프로젝트의 JSON 파일을 사용하며, 계정과 감상 기록은 서버에 저장합니다. PythonAnywhere에서 운영하므로 개발자의 컴퓨터가 꺼져 있어도 배포 사이트를 이용할 수 있습니다.

## 주요 기능

| 화면 | 구현 기능 | 파일 |
| --- | --- | --- |
| 회원가입·로그인 | 아이디·닉네임·비밀번호로 가입, 로그인·로그아웃·계정 변경 | [login.html](login.html) |
| 메인 | 개인 감상 요약, 최근 감상 기록, 영화 검색, 예시 기록 추가 | [index.html](index.html) |
| 영화 검색 | 제목·별칭·배우·감독으로 검색하고 영화 상세로 이동 | [movies.html](movies.html) |
| 영화 상세 | 영화 정보, 감상 기록 추가·수정·삭제, 나의 별점, 전체 평균 별점, 다른 사용자의 공개 관람평, 보관 사진 조회 | [movie.html](movie.html) |
| 영화 뽑기 | 등록된 영화 중 한 편을 무작위로 선택하고 상세 화면으로 이동 | [pick.html](pick.html) |
| 감상 캘린더 | 월별 감상 기록과 선택한 날짜의 기록 확인 | [calendar.html](calendar.html) |
| 통계 | 개인 감상 편수·시간·별점과 장르·국가·기간별 감상 현황 확인 | [stats.html](stats.html) |
| 업적 | 감상 영화 수·누적 감상 시간·감상 장르 수에 따른 업적과 진행도 표시 | [achievements.html](achievements.html) |
| 사진 보관함 | 영화별 티켓·포스터·기타 사진 저장, 종류별 조회, 확대 보기·삭제 | [archive.html](archive.html) |
| 시리즈 | 시리즈별 개봉 순서와 본인의 감상 현황 확인 | [series.html](series.html) |
| 지도 | 제작 국가별 영화와 본인의 감상 현황을 지도에서 확인 | [map.html](map.html) |

영화 뽑기는 현재 영화 목록 전체를 대상으로 하며, 두 편 이상이면 바로 직전에 뽑은 영화만 제외합니다. 이미 감상한 영화도 나올 수 있고, 뽑기만으로 감상 기록이 추가되지는 않습니다.

## 개인 기록과 공유 정보

- **개인 영역:** 감상 날짜와 회차별 기록, 캘린더·통계·업적·시리즈 감상 현황은 로그인한 계정의 기록을 사용합니다. 감상 기록의 수정·삭제는 작성한 계정만 할 수 있습니다.
- **전체 평균 별점:** 영화별로 각 사용자가 가장 최근에 저장·수정한 **별점이 있는 기록 1개**를 반영합니다. 본인의 별점도 포함하며, 관람평 공개 여부와 관계없이 익명으로 집계합니다. 별점이 없는 기록은 제외합니다.
- **공개 관람평:** 작성·수정 화면에서 ‘다른 사용자에게 관람평 공개’를 선택한 글만 다른 로그인 사용자에게 표시합니다. 기본값은 비공개이며, 공개 해제·삭제 후에는 이후 조회에서 제외됩니다.
- **표시 범위:** 공개 목록에는 닉네임·별점·관람평만 표시하고, 로그인 아이디·계정 ID·감상 날짜·사진은 전달하지 않습니다. 다른 사람의 글을 20개씩 불러오며, 본인의 글은 ‘나의 감상 기록’에서 확인합니다.

같은 영화의 감상 기록을 여러 번 남길 수 있지만, 전체 평균에는 사용자당 별점 하나만 반영하므로 관람평 수와 평균 별점 참여 인원은 다를 수 있습니다.

## 기술 구성과 저장 위치

| 구분 | 사용 기술·역할 |
| --- | --- |
| 화면 | HTML5, CSS3, JavaScript ES Modules, Bootstrap 5.3.3 CSS |
| 서버 | Python, Flask, SQLAlchemy, PyMySQL |
| 사용자 데이터 | MySQL |
| 영화 기본 자료 | [data/catalog.json](data/catalog.json) |
| 사진 보관 | 브라우저 IndexedDB |
| 실행·배포 | 로컬 Waitress 서버, PythonAnywhere WSGI·MySQL·HTTPS |

| 자료 | 저장 위치 | 이용 범위 |
| --- | --- | --- |
| 영화·별칭·인물·장르·국가·시리즈·업적 규칙 | `data/catalog.json` | 모든 사용자가 같은 자료 사용 |
| 회원 정보·비밀번호 해시·로그인 세션 | 서버 MySQL | 계정별 인증·관리 |
| 감상 날짜·별점·관람평·공개 여부 | 서버 MySQL | 같은 서버의 같은 계정으로 다른 기기에서도 조회 |
| 사진 원본·사진 정보 | 해당 사이트를 이용한 브라우저의 IndexedDB | 화면에서 계정별 구분, 서버 전송·기기 간 동기화 없음 |

사진은 서버에 저장되지 않으므로 브라우저의 사이트 데이터를 삭제하면 함께 지워질 수 있습니다. 사진을 보관한 브라우저에서 다시 같은 계정으로 로그인해야 기존 사진을 볼 수 있습니다. 로컬 개발 사이트와 배포 사이트의 계정·기록·사진은 각각 별개입니다.

## 데이터 구성

### MySQL 테이블

실제 서버 테이블은 다음 세 개이며, 정의와 초기화·기존 DB 갱신 코드는 [server/database.py](server/database.py)에 있습니다.

| 테이블 | 주요 필드와 역할 |
| --- | --- |
| `profiles` | `profile_id`(기본키), `username`(고유 아이디), `display_name`, `password_hash`, `created_at` |
| `auth_sessions` | `token_hash`(기본키), `profile_id`(회원 참조), `expires_at` — 로그인 상태와 만료 시간 관리 |
| `watch_logs` | `log_id`(기본키), `profile_id`(회원 참조), `movie_id`, `watched_on`, `rating`, `review_text`, `is_public`, `created_at`, `updated_at`, `version` — 감상 기록과 공개 여부, 동시 수정 확인 |

`watch_logs.movie_id`는 JSON의 `Movie.movie_id`를 참조하며 서버에서 유효성을 확인합니다. 영화 자료 자체는 MySQL 테이블로 복사하지 않습니다. 세션 만료 조회, 사용자별 기록 조회, 영화·사용자별 조회를 위한 인덱스를 둡니다.

### 영화 카탈로그 JSON

현재 시연용 영화 **18편**, 시리즈 **3개**, 업적 규칙 **7개**를 포함합니다. 실시간 영화 검색 API를 호출하는 구조가 아니라 프로젝트에 포함된 자료를 검색합니다.

| 배열 | 내용 |
| --- | --- |
| `Movie` | 영화 ID, 제목, 개봉일, 상영 시간, 포스터 주소, 줄거리 |
| `MovieAlias` | 영화별 검색 별칭 |
| `Person`, `MovieCredit` | 인물과 영화의 배우·감독 연결 |
| `Genre`, `MovieGenre` | 장르와 영화의 연결 |
| `Country`, `MovieCountry` | 제작 국가, 지도 좌표와 영화의 연결 |
| `Series`, `SeriesMovie` | 시리즈 정보, 소속 영화와 개봉 순서 |
| `AchievementRule` | 업적 이름, 집계 기준과 달성 목표 |

[js/repository.js](js/repository.js)의 `loadCatalog()`가 JSON을 읽고 필수 항목·중복 키·참조 관계를 검사합니다. 영화를 추가할 때는 ID와 연결 자료의 일관성을 유지해야 하며, 영화 ID 변경은 서버를 다시 시작해야 입력 검증에 반영됩니다.

### 브라우저 사진 저장소

IndexedDB `movie_journal_server_photos`에서 `MediaAsset`에 사진 정보, `MediaBlob`에 원본을 보관합니다. `MediaAsset`은 `asset_id`, `profile_id`, `movie_id`, `kind`, `storage_key`, `mime_type`, `byte_size`, `created_at`으로 구성되며, `kind`는 `ticket`·`poster`·`other`입니다.

현재 감상 기록의 저장·조회는 서버 API를 사용합니다. 초기 구현에서 사용한 브라우저의 감상 기록·사진을 새 계정으로 자동 이전하지 않습니다.

## 실행 방법

### 배포 사이트 이용

1. [FILMLOG](https://ssutest.pythonanywhere.com/)에 접속합니다.
2. 회원가입에서 아이디·닉네임·비밀번호를 등록합니다. 가입 후 바로 로그인됩니다.
3. 영화 상세에서 감상 기록을 작성하고, 필요한 경우 관람평 공개를 선택합니다.
4. 다른 계정을 사용하려면 상단의 ‘로그아웃 / 계정 변경’을 누릅니다.

### Windows에서 로컬 실행

준비 사항은 Python(개발·검증 환경: 3.12), MySQL 서버 실행 파일, 패키지 설치와 외부 자원을 불러올 인터넷 연결입니다. 실행 스크립트는 기존 MySQL 서버 프로그램을 이용해 별도의 개발 DB를 구성합니다.

1. 저장소를 내려받고 프로젝트 폴더의 **[start-local.cmd](start-local.cmd)** 를 실행합니다.
2. 패키지와 개발 DB 준비가 끝나면 [로컬 로그인 화면](http://127.0.0.1:58801/login.html)에 접속합니다.
3. 로컬 사이트에서 새 계정을 만들어 사용합니다.
4. 웹서버를 멈추려면 실행 창에서 `Ctrl+C`를 누르거나 **[stop-local.cmd](stop-local.cmd)** 를 실행합니다.

MySQL 기본 탐색 위치는 `C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe`입니다. 설치 위치가 다르면 `MYSQLD_PATH`를 지정합니다. 개발 DB는 기본 `127.0.0.1:43316`에서 별도로 실행하며, 기존 MySQL80 서비스의 데이터는 사용하지 않습니다. 로컬 DB 파일은 `%LOCALAPPDATA%/FilmLogServer/` 아래에 보관합니다. 웹서버를 멈춰도 저장 데이터와 개발 DB는 유지됩니다.

HTML 파일을 직접 열거나 정적 서버만 실행하면 로그인과 감상 기록 기능이 동작하지 않습니다. 상세 설정, 수동 배포, 환경 변수와 검증 절차는 [서버 실행 안내](SERVER_GUIDE.md)를 참고하세요.

## 주요 파일

| 경로 | 역할 |
| --- | --- |
| `*.html`, `js/pages/`, `css/` | 각 화면의 구조·동작·스타일 |
| `js/ui.js` | 공통 메뉴, 영화 카드, 알림, 화면 초기화·갱신 |
| `js/repository.js` | JSON 로딩, 서버 API를 통한 감상 기록 관리, 브라우저 사진 관리 |
| `js/selectors.js` | 영화 검색, 개인 통계·업적·시리즈 현황 계산 |
| `js/validation.js` | 감상 날짜·별점·관람평·사진 입력 검사 |
| `js/account.js`, `js/server-session.js` | 회원가입·로그인, 계정 표시, 세션 확인·계정 변경 처리 |
| `server/app.py` | 인증, 개인 기록·공개 평가 API, 허용된 정적 파일 제공 |
| `server/database.py` | 서버 테이블·인덱스 정의와 DB 초기화·갱신 |
| `server/__main__.py`, `wsgi.py` | 로컬 서버와 호스팅의 실행 진입점 |
| `scripts/local_setup.py`, `start-local.*`, `stop-local.*` | Windows 개발 환경 준비와 실행·중지 |
| `requirements-lock.txt` | 재현 가능한 Python 패키지 버전 목록 |
| `tests/` | 서버·MySQL·브라우저 검증 코드 |
| `docs/annotated/` | 초기 구현의 주석 자료와 [회의록](docs/annotated/회의록/) |

## 검증과 구현 범위

- 비밀번호는 Werkzeug의 **scrypt 해시**로 저장하고 로그인할 때 일치 여부를 검사합니다.
- 서버가 로그인 계정의 기록 소유권을 확인합니다. 변경 요청에는 CSRF 검사를 적용하며, 운영 환경은 HTTPS와 보안 세션 쿠키 설정을 요구합니다.
- 감상 날짜는 **1900년 1월 1일부터 오늘까지** 허용합니다. 브라우저와 서버 모두 검사하며, 서버의 ‘오늘’은 한국 시간(KST) 기준입니다.
- 비밀번호 재설정·변경, 이메일 인증, 소셜 로그인, 사진의 서버 업로드·동기화는 구현되어 있지 않습니다.

서버 검증은 `tests/test_server.py`, `tests/test_community.py`, MySQL 검증은 `tests/run_mysql_tests.py`, 화면 검증은 `tests/browser-smoke.cjs`, `tests/browser-community.cjs`에 있습니다. 실행 방법은 [SERVER_GUIDE.md](SERVER_GUIDE.md)의 ‘검증 및 재실행’을 참고하세요. 테스트용 계정과 기록을 만드는 검사는 별도의 테스트 서버·DB에서 실행합니다.

운영 환경 변수는 [.env.example](.env.example)을 참고해 설정합니다. 실제 `.env`, 비밀번호·비밀키, DB 원본과 테스트 결과는 저장소에 올리지 않습니다. 배포 후 코드·DB 갱신과 웹 앱 재시작 절차는 서버 실행 안내를 따릅니다.

## 데이터·외부 자원 출처

- 영화 기본 정보는 실제 영화의 공개 자료를 바탕으로 구성한 시연용 데이터입니다. 초기 자료는 KOBIS·위키백과·TMDB를 참고했으며, 줄거리는 직접 짧게 요약했습니다.
- 현재 카탈로그의 포스터는 TMDB 이미지 URL을 사용합니다. 각 페이지에는 TMDB 출처와 ‘TMDB의 승인·인증을 받지 않음’ 문구를 표시합니다.
- Bootstrap CSS, Pretendard·Anton 글꼴, 외부 포스터는 인터넷을 통해 불러옵니다.
- 로고 입자·진입 화면·지도 조준선 효과에는 React Bits의 코드를, 배경 점 격자에는 21st.dev의 Sonar Grid 코드를 적용했습니다. 적용 파일·출처·라이선스는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)에 정리되어 있습니다.

## 초기 구현 기록

2026년 10월 12일에는 메인·영화 검색·상세·감상 캘린더를 만들고 사용자 기록과 사진을 브라우저 IndexedDB에 저장했습니다. 이후 통계·업적·보관함·시리즈·지도·영화 뽑기와 서버 로그인·공개 평가 기능을 통합했습니다.

`docs/annotated/`에는 초기 브라우저 저장 방식의 설명이 남아 있습니다. 현재 실행할 코드는 저장소 최상위의 HTML·`js/`·`server/`이며, 초기 주석 자료는 현재 서버 동작과 다를 수 있습니다.
