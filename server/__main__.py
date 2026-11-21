"""Run from the project root: python -m server init-db / python -m server."""

import os
import sys

from waitress import serve

from .app import create_app, init_database


def main():
    app = create_app()
    if sys.argv[1:] == ["init-db"]:
        init_database(app)
        print("FILMLOG account and watch-log tables are ready.")
        return
    if sys.argv[1:]:
        raise SystemExit("Usage: python -m server [init-db]")
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "58801"))
    print(f"FILMLOG: http://{host}:{port}", flush=True)
    serve(app, host=host, port=port, threads=4, max_request_body_size=64 * 1024)


if __name__ == "__main__":
    main()
