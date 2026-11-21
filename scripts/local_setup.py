"""기존 MySQL 서비스에 접근하지 않는 이 복사본 전용 로컬 개발 DB 준비."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import time

import pymysql
from sqlalchemy.engine import URL

ROOT = Path(__file__).resolve().parents[1]
KEY = hashlib.sha256(str(ROOT).encode()).hexdigest()[:12]
STATE_DIR = Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'FilmLogServer' / KEY
STATE_FILE = STATE_DIR / 'local-state.json'


def prepare():
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    if STATE_FILE.exists():
        state = json.loads(STATE_FILE.read_text(encoding='utf-8'))
    else:
        binary = Path(os.environ.get('MYSQLD_PATH', r'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe'))
        if not binary.is_file():
            raise RuntimeError('MySQL 실행 파일을 찾지 못했습니다. MYSQLD_PATH에 mysqld.exe 경로를 지정하세요.')
        if (ROOT / '.env').exists():
            raise RuntimeError('기존 .env를 보존했습니다. 직접 설정한 DB는 SERVER_GUIDE.md의 수동 실행 방법을 사용하세요.')
        state = dict(binary=str(binary), port=int(os.environ.get('FILMLOG_DB_PORT', '43316')),
                     password=secrets.token_hex(24), root_password=secrets.token_hex(32),
                     secret_key=secrets.token_hex(32))
        STATE_FILE.write_text(json.dumps(state), encoding='utf-8')

    data_dir = STATE_DIR / 'mysql-data'
    binary = Path(state['binary'])
    connection = dict(host='127.0.0.1', port=state['port'], user='filmlog',
                      password=state['password'], database='filmlog_server', connect_timeout=2,
                      charset='utf8mb4')
    def reachable():
        try:
            with pymysql.connect(**connection) as conn:
                with conn.cursor() as cursor:
                    cursor.execute('SELECT 1')
            return True
        except pymysql.MySQLError:
            return False

    if not reachable():
        with socket.socket() as probe:
            if probe.connect_ex(('127.0.0.1', state['port'])) == 0:
                raise RuntimeError('개발 DB 포트를 다른 프로그램이 사용 중입니다. 기존 프로그램을 중지하지 않고 작업을 중단합니다.')
        fresh = not (data_dir / 'mysql').exists()
        if fresh:
            data_dir.mkdir(parents=True, exist_ok=True)
            result = subprocess.run([str(binary), '--no-defaults', '--initialize-insecure',
                                     f'--basedir={binary.parent.parent}', f'--datadir={data_dir}',
                                     '--innodb-buffer-pool-size=64M'], capture_output=True, text=True)
            if result.returncode:
                raise RuntimeError('별도 개발 DB 초기화에 실패했습니다. ' + result.stderr[-2000:])
        # 새 인스턴스 최초 시작 시 네트워크 요청을 받기 전에 계정을 구성합니다.
        init_file = STATE_DIR / 'initialize.sql'
        options = []
        if fresh:
            init_file.write_text(
                f"ALTER USER 'root'@'localhost' IDENTIFIED BY '{state['root_password']}';\n"
                "CREATE DATABASE filmlog_server CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n"
                "CREATE DATABASE filmlog_server_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n"
                f"CREATE USER 'filmlog'@'127.0.0.1' IDENTIFIED BY '{state['password']}';\n"
                "GRANT ALL PRIVILEGES ON filmlog_server.* TO 'filmlog'@'127.0.0.1';\n"
                "GRANT ALL PRIVILEGES ON filmlog_server_test.* TO 'filmlog'@'127.0.0.1';\n", encoding='utf-8')
            options.append(f'--init-file={init_file}')
        log = open(STATE_DIR / 'mysql-console.log', 'ab')
        process = subprocess.Popen([
            str(binary), '--no-defaults', f'--basedir={binary.parent.parent}',
            f'--datadir={data_dir}', f'--port={state["port"]}', '--bind-address=127.0.0.1',
            '--mysqlx=OFF', '--skip-name-resolve', '--innodb-buffer-pool-size=64M',
            '--innodb-redo-log-capacity=32M', '--max-connections=30',
            f'--log-error={STATE_DIR / "mysql-error.log"}', *options
        ], stdin=subprocess.DEVNULL, stdout=log, stderr=log,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        log.close()
        (STATE_DIR / 'mysql.pid').write_text(str(process.pid), encoding='ascii')
        for _ in range(120):
            if reachable():
                if init_file.exists():
                    init_file.unlink()
                break
            if process.poll() is not None:
                raise RuntimeError(f'개발 DB가 종료되었습니다. 오류 기록: {STATE_DIR / "mysql-error.log"}')
            time.sleep(0.5)
        else:
            raise RuntimeError(f'개발 DB가 준비되지 않았습니다. 오류 기록: {STATE_DIR / "mysql-error.log"}')

    url = URL.create('mysql+pymysql', username='filmlog', password=state['password'],
                     host='127.0.0.1', port=state['port'], database='filmlog_server',
                     query={'charset': 'utf8mb4'}).render_as_string(hide_password=False)
    env = ROOT / '.env'
    if not env.exists():
        env.write_text(f'DATABASE_URL={url}\nSECRET_KEY={state["secret_key"]}\nAPP_ENV=development\n'
                       'PUBLIC_ORIGIN=http://127.0.0.1:58801\nSESSION_COOKIE_SECURE=false\n'
                       'HOST=127.0.0.1\nPORT=58801\n', encoding='utf-8')
    print('이 복사본 전용 MySQL 준비 완료 (기존 MySQL80 서비스와 별도).')
    print('접속 정보는 .env에 보관하며 화면에 표시하지 않습니다.')


if __name__ == '__main__':
    prepare()
