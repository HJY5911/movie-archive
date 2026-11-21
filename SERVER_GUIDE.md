# 서버 연결 복사본 실행 안내

이 폴더는 기존 `movie-archive` 전체를 복사해 만든 서버 연결용 개발본입니다. 서버 연결 기능은 원본 프로젝트와 GitHub의 `main`에 합치지 않고, 이 복사본과 GitHub의 `feat/server-login-isolated` 브랜치에서 별도로 유지합니다. 팀원이 메인에 반영한 공통 수정은 최신화를 통해 함께 적용합니다. 서버 연결을 위해 기존 파일에서 변경한 것은 `js/repository.js` 하나이며, 로그인 화면과 서버, 실행 도구는 새 파일로 추가했습니다.

## 저장 위치

| 자료 | 저장 위치 |
| --- | --- |
| 영화 제목·배우·감독·장르·국가·시리즈·업적 규칙 | 기존 `data/catalog.json` 그대로 사용 |
| 회원 정보·비밀번호 해시·로그인 세션 | 서버 MySQL |
| 계정별 감상 날짜·별점·감상평 | 서버 MySQL |
| 티켓·포스터 사진 및 사진 정보 | 해당 브라우저의 IndexedDB, 계정별 구분 |

사진은 다른 기기와 공유되지 않습니다. 사진 저장 방식은 기존 보관함과 호환되며 서버에 전송하지 않습니다. 원본의 `demo` 기록과 사진은 자동으로 가져오거나 삭제하지 않습니다. 새 계정은 빈 상태에서 시작하며 메인 화면의 예시 기록 버튼을 사용할 수 있습니다.

## 내 컴퓨터에서 실행

1. 이 폴더의 **`start-local.cmd`를 더블클릭**합니다.
2. 설치 및 DB 준비가 끝나면 **http://127.0.0.1:58801/login.html** 로 접속합니다.
3. **회원가입**에서 아이디·닉네임·비밀번호를 정합니다. 가입 후 바로 로그인됩니다.
4. 상단의 **로그아웃 / 계정 변경**으로 다른 계정을 사용할 수 있습니다.
5. 실행 창에서 **Ctrl+C**를 누르거나 **`stop-local.cmd`를 더블클릭**하면 웹서버를 멈춥니다. 저장한 데이터와 별도 개발 MySQL은 유지됩니다.

이미 이 주소에서 실행 중이라면 기존 창을 사용하세요. 같은 주소로 두 개를 실행할 수는 없습니다. 일반 정적 서버나 HTML 파일 더블클릭으로는 서버 로그인 기능이 동작하지 않습니다.

이 컴퓨터의 설치된 MySQL 실행 파일을 사용하지만 **기존 MySQL80 서비스 및 그 데이터에는 연결하지 않습니다.** 개발용 MySQL을 별도로 `127.0.0.1:43316`에 실행합니다. DB 원본 파일은 OneDrive 동기화 충돌을 피하도록 `%LOCALAPPDATA%/FilmLogServer/` 아래 이 복사본 전용 폴더에 보관합니다. 접속 정보는 `.env`에 자동 생성됩니다. `.env`와 로컬 DB 상태 파일에는 비밀번호가 있으므로 공유하지 마세요.

이 단계는 내 컴퓨터에서 외부 서버와 같은 구조를 실행하는 것입니다. 아직 인터넷에 배포된 사이트는 아니며, 다른 팀원이 사용할 공개 주소도 생성하지 않았습니다.

## 수정 범위와 연결 방식

- `repository.js`는 기존 `loadCatalog`, `openRepository`, `readSnapshot`, `mutateWatchLog`, `manageMedia` 호출 방식을 유지합니다.
- 감상 기록은 `fetch('/api/...')`로 Flask에 요청합니다. Flask가 로그인 계정을 확인하고 MySQL에서 그 계정의 기록만 처리합니다.
- 통계·업적·지도·시리즈 등 기존 페이지는 같은 형식의 기록을 받아 그대로 계산합니다.
- `js/server-session.js`는 계정 표시·로그아웃·다른 탭의 계정 변경 감지를 담당합니다. 기존 `ui.js` 파일을 수정하지 않고 상단 저장 위치 안내를 갱신합니다.
- 로그인은 새 `login.html`, `js/account.js`, `css/account.css`에서 처리합니다.
- `server/`는 인증, 감상 기록 API 및 공개 파일 제공을 담당합니다.
- 감상 날짜는 **1900년 1월 1일부터 오늘까지** 허용합니다. 브라우저 입력 검사 외에 서버도 추가·수정 요청을 다시 검사하므로 API를 직접 호출해도 범위를 벗어난 날짜를 저장할 수 없습니다. 서버의 오늘은 **한국 시간(KST, UTC+9)** 기준이며 외부 서버의 운영체제 시간대에 영향을 받지 않습니다. 화면의 오늘은 브라우저 현지 날짜 기준입니다.
- 사진은 별도 브라우저 DB `movie_journal_server_photos`에 저장합니다. 서버에 연결되지 않거나 로그아웃하면 사진 관리도 중단됩니다.
- 비밀번호를 잊었을 때 재설정, 이메일 인증, 소셜 로그인은 이번 범위에 없습니다.

원본의 `README.md`와 `docs/annotated/`도 그대로 복사했으므로 기존 브라우저 저장 방식의 설명이 남아 있습니다. **이 서버 복사본의 실행 방법은 이 문서를 기준으로 보세요.**

## 외부 서버로 옮길 때

Flask 실행과 MySQL, HTTPS를 지원하는 호스팅을 사용합니다. 영화 JSON을 MySQL로 옮길 필요는 없고, 사이트 파일과 Flask를 같은 주소에서 제공합니다. 기본 제공 주소를 사용할 수 있으므로 도메인 구매는 필수가 아닙니다.

1. 호스팅에 MySQL DB와 이 프로젝트 전용 DB 계정을 준비합니다. DB 문자셋은 `utf8mb4`를 사용합니다.
2. 프로젝트 코드를 업로드합니다. `.git`, `.venv`, `.env`, 로컬 DB, `test-results`는 업로드하지 않습니다. `data/catalog.json`과 `assets`, `css`, `js`, HTML은 포함합니다.
3. 호스팅의 Python 환경에서 `pip install -r requirements-lock.txt`를 실행합니다.
4. `.env.example`을 참고해 호스팅 환경 변수 또는 서버의 비공개 `.env`에 다음 값을 설정합니다.

   ```text
   DATABASE_URL=mysql+pymysql://계정:URL인코딩한비밀번호@DB주소:포트/DB이름?charset=utf8mb4
   SECRET_KEY=새로생성한32자이상의임의문자열
   APP_ENV=production
   PUBLIC_ORIGIN=https://실제기본제공주소
   SESSION_COOKIE_SECURE=true
   ```

   임의 비밀키는 `python -c "import secrets; print(secrets.token_hex(32))"`로 생성할 수 있습니다. 개발용 비밀번호를 문서나 GitHub에 복사하지 마세요. 호스팅이 DB 연결용 인증서나 TLS 설정을 요구하면 해당 업체의 연결 설정을 함께 적용합니다.

5. `python -m server init-db`를 한 번 실행해 테이블을 만듭니다. 이 명령은 DB 자체를 만들거나 기존 데이터를 삭제하지 않습니다.
6. 호스팅의 WSGI 앱 진입점은 **`wsgi:application`**입니다. PythonAnywhere 등의 WSGI 설정에서는 이 프로젝트 폴더를 Python 경로에 넣고 `from wsgi import application`으로 연결할 수 있습니다. 프로세스 실행형 호스팅이라면 업체의 포트에 맞춰 `HOST`, `PORT`를 설정하고 `python -m server`를 실행합니다. HTTPS는 호스팅이 제공하도록 설정합니다.
7. 배포 주소에서 계정 두 개, 감상 기록, 통계·업적, 로그아웃을 다시 확인합니다. 로컬 개발 DB의 계정은 새 외부 DB로 자동 전송되지 않습니다.

프로젝트 폴더 전체를 정적 공개 폴더로 지정하지 마세요. Flask는 허용된 HTML과 `assets`, `css`, `js`, `data`만 제공합니다. 별도 정적 파일 매핑을 사용한다면 이 네 폴더로만 제한합니다. `.env`, 서버 소스, 테스트 파일은 공개 대상이 아닙니다.

JSON에 영화 ID를 추가·변경하면 서버도 다시 시작해야 입력 검증에 반영됩니다. 이미 기록에서 사용 중인 영화 ID를 삭제하면 기존 화면의 집계에 영향을 줄 수 있습니다.

외부 서버 운영 목표는 **2026년 12월 31일까지**입니다. 자동 종료나 결제 예약은 설정하지 않았습니다. 운영 종료 전에 필요한 MySQL 데이터를 내보낸 뒤 호스팅 구독·자원을 정리해야 합니다. 사진은 서버 백업에 포함되지 않습니다.

## 검증 및 재실행

```powershell
.\.venv\Scripts\python.exe -m pytest -q tests/test_server.py
.\.venv\Scripts\python.exe tests/run_mysql_tests.py
```

첫 명령은 독립적인 메모리 DB로 서버 동작을 검사합니다. 둘째 명령은 개발 인스턴스의 `filmlog_server_test`만 사용하는 실제 MySQL 검사입니다. **테스트 DB에만 있는 검증용 계정·기록을 초기화하므로 브라우저 테스트와 동시에 실행하지 마세요.** 사용자의 `filmlog_server` DB는 초기화하지 않습니다.

브라우저 통합 검사는 `tests/browser-smoke.cjs`, 결과는 `test-results/`에 있습니다. 실행에는 Node.js와 Playwright/Chromium이 필요합니다. 브라우저 테스트 서버는 `.venv/Scripts/python.exe tests/serve_test_app.py`로 별도 58802 포트에 띄웁니다.

참고: [Flask 공식 배포 안내](https://flask.palletsprojects.com/en/stable/deploying/), [PythonAnywhere Flask 배포](https://help.pythonanywhere.com/pages/Flask/).
