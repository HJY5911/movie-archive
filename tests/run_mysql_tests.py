"""Run the API suite only against the copy's disposable *_test database."""
import os
from pathlib import Path
import subprocess
import sys

from dotenv import dotenv_values
from sqlalchemy.engine import make_url

root = Path(__file__).resolve().parents[1]
url = make_url(dotenv_values(root / '.env')['DATABASE_URL'])
if url.host != '127.0.0.1' or url.database != 'filmlog_server' or url.port != 43316:
    raise SystemExit('Automatic tests are limited to the isolated local development database.')
env = os.environ.copy()
env['FILMLOG_TEST_DATABASE_URL'] = url.set(database='filmlog_server_test').render_as_string(hide_password=False)
raise SystemExit(subprocess.call([sys.executable, '-m', 'pytest', '-q', 'tests/test_server.py'], cwd=root, env=env))
