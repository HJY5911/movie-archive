"""Isolated browser-test server. No real app user data is used."""
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root))
from dotenv import dotenv_values
from sqlalchemy.engine import make_url
from waitress import serve
from server.app import create_app, init_database

url = make_url(dotenv_values(root / '.env')['DATABASE_URL'])
if url.host != '127.0.0.1' or url.database != 'filmlog_server' or url.port != 43316:
    raise SystemExit('Browser tests require the isolated local development database.')
app = create_app({
    'DATABASE_URL': url.set(database='filmlog_server_test').render_as_string(hide_password=False),
    'APP_ENV': 'development', 'PUBLIC_ORIGIN': 'http://127.0.0.1:58802',
    'SESSION_COOKIE_SECURE': False, 'AUTH_RATE_LIMIT': 0,
    'SESSION_COOKIE_NAME': 'filmlog_test_session',
})
init_database(app)
serve(app, host='127.0.0.1', port=58802, threads=4)
