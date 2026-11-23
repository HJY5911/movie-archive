"""실제 계정과 분리된 빈 메모리 DB로 브라우저 검사를 실행하는 서버입니다."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from waitress import serve
from server.app import create_app, init_database

app = create_app({
    "DATABASE_URL": "sqlite:///:memory:",
    "SECRET_KEY": "isolated-community-browser-test-" * 3,
    "APP_ENV": "development",
    "PUBLIC_ORIGIN": "http://127.0.0.1:58803",
    "SESSION_COOKIE_SECURE": False,
    "SESSION_COOKIE_NAME": "community_browser_test",
    "AUTH_RATE_LIMIT": 0,
})
init_database(app)
print("브라우저 검사 전용: http://127.0.0.1:58803 (종료하면 테스트 데이터가 사라집니다.)", flush=True)
serve(app, host="127.0.0.1", port=58803, threads=1)
