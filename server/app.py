"""A small same-origin Flask API with server-side account authorization."""

from collections import defaultdict, deque
from datetime import date, datetime, timedelta, timezone
import hashlib
import hmac
import json
import math
import os
from pathlib import Path
import re
import secrets
import threading
import time
from uuid import uuid4

from dotenv import load_dotenv
from flask import Flask, abort, g, jsonify, request, send_from_directory
from sqlalchemy import delete, insert, select, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

from .database import auth_sessions, make_engine, metadata, profiles, watch_logs

PROJECT_ROOT = Path(__file__).resolve().parent.parent
WATCH_DATE_MIN = date(1900, 1, 1)
WATCH_TIMEZONE = timezone(timedelta(hours=9), name="KST")
PUBLIC_HTML = frozenset({
    "index.html", "movies.html", "movie.html", "calendar.html", "map.html",
    "series.html", "stats.html", "achievements.html", "archive.html", "login.html",
})
PUBLIC_DIRS = frozenset({"css", "js", "assets", "data"})
PUBLIC_EXTENSIONS = frozenset({
    ".css", ".js", ".json", ".png", ".jpg", ".jpeg", ".webp", ".svg",
    ".gif", ".ico", ".woff", ".woff2", ".ttf", ".otf",
})


class ApiError(Exception):
    def __init__(self, message, status=400, code=None, fields=None):
        super().__init__(message)
        self.status, self.code, self.fields = status, code, fields


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def watch_today():
    # 외부 서버의 운영체제 시간대와 무관하게 한국 날짜로 저장 가능 범위를 판단합니다.
    return datetime.now(WATCH_TIMEZONE).date()


def public_profile(row):
    return {key: row[key] for key in ("profile_id", "display_name", "created_at")}


def create_app(config_override=None):
    load_dotenv(PROJECT_ROOT / ".env", override=False)
    app = Flask(__name__, static_folder=None)
    app.config.update(
        DATABASE_URL=os.environ.get("DATABASE_URL"),
        SECRET_KEY=os.environ.get("SECRET_KEY"),
        APP_ENV=os.environ.get("APP_ENV", "development"),
        PUBLIC_ORIGIN=os.environ.get("PUBLIC_ORIGIN", "").rstrip("/"),
        SESSION_COOKIE_NAME="filmlog_session",
        SESSION_COOKIE_SECURE=os.environ.get("SESSION_COOKIE_SECURE", "false").lower() == "true",
        SESSION_TTL_SECONDS=24 * 60 * 60,
        MAX_CONTENT_LENGTH=64 * 1024,
        AUTH_RATE_LIMIT=30,
        AUTH_RATE_WINDOW=600,
        CATALOG_PATH=PROJECT_ROOT / "data" / "catalog.json",
    )
    if config_override:
        app.config.update(config_override)
    if not app.config["DATABASE_URL"]:
        raise RuntimeError("DATABASE_URL을 .env 또는 서버 환경 변수에 설정하세요.")
    if not isinstance(app.config["SECRET_KEY"], str) or len(app.config["SECRET_KEY"]) < 32:
        raise RuntimeError("SECRET_KEY에는 32자 이상의 임의 문자열을 설정하세요.")
    if app.config["APP_ENV"] == "production":
        if not app.config["DATABASE_URL"].startswith("mysql+pymysql://"):
            raise RuntimeError("운영 서버에는 mysql+pymysql DATABASE_URL을 설정하세요.")
        if not app.config["SESSION_COOKIE_SECURE"] or not app.config["PUBLIC_ORIGIN"].startswith("https://"):
            raise RuntimeError("운영 서버에는 HTTPS PUBLIC_ORIGIN과 SESSION_COOKIE_SECURE=true가 필요합니다.")

    engine = make_engine(app.config["DATABASE_URL"])
    app.extensions["filmlog_engine"] = engine
    with Path(app.config["CATALOG_PATH"]).open(encoding="utf-8-sig") as source:
        catalog = json.load(source)
    movie_ids = frozenset(row["movie_id"] for row in catalog["Movie"])
    auth_attempts = defaultdict(deque)
    attempts_lock = threading.Lock()
    dummy_password_hash = generate_password_hash(secrets.token_urlsafe(24))

    def token_hash(token):
        return hashlib.sha256(token.encode("ascii")).hexdigest()

    def csrf_for(token):
        return hmac.new(app.config["SECRET_KEY"].encode(), token.encode(), hashlib.sha256).hexdigest()

    def rotate_session(connection, profile_id=None):
        if g.session_row:
            connection.execute(delete(auth_sessions).where(auth_sessions.c.token_hash == g.session_row["token_hash"]))
        token = secrets.token_urlsafe(32)
        ttl = app.config["SESSION_TTL_SECONDS"] if profile_id else 3600
        row = {"token_hash": token_hash(token), "profile_id": profile_id, "expires_at": int(time.time()) + ttl}
        connection.execute(insert(auth_sessions).values(**row))
        # Expired sessions have no value and should not accumulate indefinitely.
        connection.execute(delete(auth_sessions).where(auth_sessions.c.expires_at <= int(time.time())))
        g.session_token, g.session_row, g.set_cookie = token, row, True
        return csrf_for(token)

    def require_login():
        if g.profile is None:
            raise ApiError("로그인 후 이용해 주세요.", 401, "login_required")
        return g.profile["profile_id"]

    def payload():
        value = request.get_json(silent=True)
        if not isinstance(value, dict):
            raise ApiError("올바른 JSON 입력이 필요합니다.")
        return value

    def rate_limit_auth():
        if app.config["AUTH_RATE_LIMIT"] <= 0:
            return
        now = time.monotonic()
        key = request.remote_addr or "unknown"
        with attempts_lock:
            if len(auth_attempts) > 4096:
                stale = [ip for ip, entries in auth_attempts.items() if not entries or entries[-1] < now - app.config["AUTH_RATE_WINDOW"]]
                for ip in stale:
                    auth_attempts.pop(ip, None)
            entries = auth_attempts[key]
            while entries and entries[0] < now - app.config["AUTH_RATE_WINDOW"]:
                entries.popleft()
            if len(entries) >= app.config["AUTH_RATE_LIMIT"]:
                raise ApiError("로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.", 429, "rate_limited")
            entries.append(now)

    @app.before_request
    def load_session_and_check_request():
        g.session_token = None
        g.session_row = None
        g.profile = None
        g.set_cookie = False
        g.delete_cookie = False
        if not request.path.startswith("/api/"):
            return
        token = request.cookies.get(app.config["SESSION_COOKIE_NAME"], "")
        if re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
            with engine.connect() as connection:
                row = connection.execute(select(auth_sessions).where(
                    auth_sessions.c.token_hash == token_hash(token),
                    auth_sessions.c.expires_at > int(time.time()),
                )).mappings().first()
                if row:
                    g.session_token, g.session_row = token, dict(row)
                    if row["profile_id"]:
                        user = connection.execute(select(profiles).where(profiles.c.profile_id == row["profile_id"])).mappings().first()
                        g.profile = dict(user) if user else None
        expected_profile = request.headers.get("X-Profile-Id")
        if expected_profile:
            require_login()
            if not hmac.compare_digest(expected_profile.encode(), g.profile["profile_id"].encode()):
                raise ApiError("다른 탭에서 계정이 변경되었습니다. 새로고침해 주세요.", 409, "account_changed")
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            fetch_site = request.headers.get("Sec-Fetch-Site")
            if fetch_site == "cross-site":
                raise ApiError("다른 사이트에서 보낸 요청은 허용되지 않습니다.", 403, "csrf_invalid")
            origin = request.headers.get("Origin")
            allowed_origin = app.config["PUBLIC_ORIGIN"] or request.host_url.rstrip("/")
            if origin is not None and origin != allowed_origin:
                raise ApiError("요청 출처를 확인할 수 없습니다.", 403, "csrf_invalid")
            supplied = request.headers.get("X-CSRF-Token", "")
            if not g.session_token or not hmac.compare_digest(supplied.encode(), csrf_for(g.session_token).encode()):
                raise ApiError("로그인 상태가 변경되었습니다. 페이지를 새로고침해 주세요.", 403, "csrf_invalid")

    @app.after_request
    def protect_response(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "same-origin"
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        if getattr(g, "set_cookie", False):
            response.set_cookie(
                app.config["SESSION_COOKIE_NAME"], g.session_token,
                max_age=max(0, g.session_row["expires_at"] - int(time.time())),
                secure=app.config["SESSION_COOKIE_SECURE"], httponly=True,
                samesite="Lax", path="/",
            )
        elif getattr(g, "delete_cookie", False):
            response.delete_cookie(
                app.config["SESSION_COOKIE_NAME"], path="/",
                secure=app.config["SESSION_COOKIE_SECURE"], httponly=True, samesite="Lax",
            )
        return response

    @app.errorhandler(ApiError)
    def api_error(error):
        body = {"error": str(error)}
        if error.code:
            body["code"] = error.code
        if error.fields:
            body["fields"] = error.fields
        return jsonify(body), error.status

    @app.errorhandler(HTTPException)
    def http_error(error):
        if request.path.startswith("/api/"):
            message = "요청을 찾을 수 없습니다." if error.code == 404 else "요청을 처리할 수 없습니다. 입력 형식과 크기를 확인해 주세요."
            return jsonify(error=message), error.code
        return error

    @app.errorhandler(SQLAlchemyError)
    def database_error(error):
        # Never send database connection details, SQL, or credentials to a browser.
        app.logger.error("Database operation failed: %s", type(error).__name__)
        return jsonify(error="서버 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요."), 503

    @app.get("/api/session")
    def get_session():
        if not g.session_row:
            with engine.begin() as connection:
                rotate_session(connection)
        return jsonify(profile=public_profile(g.profile) if g.profile else None, csrf_token=csrf_for(g.session_token))

    @app.post("/api/register")
    def register():
        rate_limit_auth()
        values = payload()
        username, display_name, password = values.get("username"), values.get("display_name"), values.get("password")
        fields = {}
        if not isinstance(username, str) or not re.fullmatch(r"[A-Za-z0-9_]{3,32}", username):
            fields["username"] = "아이디는 영문·숫자·밑줄로 3~32자 입력하세요."
        if not isinstance(display_name, str) or not 1 <= len(display_name.strip()) <= 40:
            fields["display_name"] = "닉네임은 1~40자 입력하세요."
        if not isinstance(password, str) or not 8 <= len(password) <= 128:
            fields["password"] = "비밀번호는 8~128자 입력하세요."
        if fields:
            raise ApiError("입력한 회원 정보를 확인해 주세요.", fields=fields)
        row = {
            "profile_id": str(uuid4()), "username": username.lower(),
            "display_name": display_name.strip(), "password_hash": generate_password_hash(password),
            "created_at": utc_now(),
        }
        try:
            with engine.begin() as connection:
                connection.execute(insert(profiles).values(**row))
                csrf_token = rotate_session(connection, row["profile_id"])
        except IntegrityError:
            raise ApiError("이미 사용 중인 아이디입니다.", 409, "username_taken", {"username": "다른 아이디를 입력하세요."}) from None
        g.profile = row
        return jsonify(profile=public_profile(row), csrf_token=csrf_token), 201

    @app.post("/api/login")
    def login():
        rate_limit_auth()
        values = payload()
        username, password = values.get("username"), values.get("password")
        if not isinstance(username, str) or not isinstance(password, str) or len(username) > 32 or len(password) > 128:
            raise ApiError("아이디 또는 비밀번호가 올바르지 않습니다.", 401, "invalid_credentials")
        with engine.begin() as connection:
            row = connection.execute(select(profiles).where(profiles.c.username == username.lower())).mappings().first()
            password_hash = row["password_hash"] if row else dummy_password_hash
            matches = check_password_hash(password_hash, password)
            if not row or not matches:
                raise ApiError("아이디 또는 비밀번호가 올바르지 않습니다.", 401, "invalid_credentials")
            csrf_token = rotate_session(connection, row["profile_id"])
        g.profile = dict(row)
        return jsonify(profile=public_profile(row), csrf_token=csrf_token)

    @app.post("/api/logout")
    def logout():
        with engine.begin() as connection:
            if g.session_row:
                connection.execute(delete(auth_sessions).where(auth_sessions.c.token_hash == g.session_row["token_hash"]))
        g.delete_cookie = True
        return jsonify(ok=True)

    @app.get("/api/snapshot")
    def snapshot():
        profile_id = require_login()
        with engine.connect() as connection:
            rows = connection.execute(select(watch_logs).where(watch_logs.c.profile_id == profile_id).order_by(
                watch_logs.c.watched_on.desc(), watch_logs.c.created_at.desc(), watch_logs.c.log_id.asc(),
            )).mappings().all()
        return jsonify(profile=public_profile(g.profile), logs=[dict(row) for row in rows])

    def validate_watch_log(values):
        fields = {}
        movie_id, watched_on = values.get("movie_id"), values.get("watched_on")
        if not isinstance(movie_id, str) or movie_id not in movie_ids:
            fields["movie_id"] = "목록에 있는 영화를 선택해 주세요."
        try:
            if not isinstance(watched_on, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", watched_on):
                raise ValueError()
            watched_date = date.fromisoformat(watched_on)
        except ValueError:
            fields["watched_on"] = "실제 존재하는 감상 날짜를 입력해 주세요."
        else:
            if watched_date > watch_today():
                fields["watched_on"] = "감상 날짜는 오늘 이후로 정할 수 없습니다."
            elif watched_date < WATCH_DATE_MIN:
                fields["watched_on"] = "감상 날짜는 1900년 1월 1일 이후여야 합니다."
        raw_rating = values.get("rating")
        rating = None
        if raw_rating is not None and not (isinstance(raw_rating, str) and not raw_rating.strip()):
            try:
                if isinstance(raw_rating, bool) or not isinstance(raw_rating, (int, float, str)):
                    raise ValueError()
                rating = float(raw_rating)
                if not math.isfinite(rating) or not 0.5 <= rating <= 5 or not (rating * 2).is_integer():
                    raise ValueError()
            except (ValueError, OverflowError):
                fields["rating"] = "별점은 0.5부터 5까지 0.5 단위로 입력해 주세요."
        review = values.get("review_text")
        if review is not None:
            if not isinstance(review, str) or len(review) > 10000:
                fields["review_text"] = "감상평은 10,000자 이하의 글자로 입력하세요."
            else:
                review = review.strip() or None
        if fields:
            raise ApiError("입력한 감상 기록을 확인해 주세요.", fields=fields)
        return {"movie_id": movie_id, "watched_on": watched_on, "rating": rating, "review_text": review}

    @app.post("/api/watch-logs")
    def create_watch_log():
        profile_id = require_login()
        values = validate_watch_log(payload())
        log_id, timestamp = str(uuid4()), utc_now()
        with engine.begin() as connection:
            connection.execute(insert(watch_logs).values(
                **values, log_id=log_id, profile_id=profile_id,
                created_at=timestamp, updated_at=timestamp, version=1,
            ))
        return jsonify(log_id=log_id), 201

    @app.route("/api/watch-logs/<log_id>", methods=["PATCH", "DELETE"])
    def change_watch_log(log_id):
        profile_id = require_login()
        values = payload()
        expected_version = values.get("expected_version")
        if isinstance(expected_version, bool) or not isinstance(expected_version, int) or expected_version < 1:
            raise ApiError("기록 버전이 없습니다. 새로고침 후 다시 시도하세요.")
        validated = validate_watch_log(values) if request.method == "PATCH" else None
        with engine.begin() as connection:
            current = connection.execute(select(watch_logs).where(
                watch_logs.c.log_id == log_id, watch_logs.c.profile_id == profile_id,
            )).mappings().first()
            if not current:
                raise ApiError("감상 기록을 찾지 못했습니다.", 404, "not_found")
            if validated and validated["movie_id"] != current["movie_id"]:
                raise ApiError("기록의 영화는 변경할 수 없습니다. 다른 영화는 새 기록으로 추가하세요.")
            match = (watch_logs.c.log_id == log_id) & (watch_logs.c.profile_id == profile_id) & (watch_logs.c.version == expected_version)
            if request.method == "DELETE":
                result = connection.execute(delete(watch_logs).where(match))
            else:
                old_time = datetime.fromisoformat(current["updated_at"].replace("Z", "+00:00"))
                new_time = max(datetime.now(timezone.utc), old_time + timedelta(milliseconds=1))
                result = connection.execute(update(watch_logs).where(match).values(
                    **validated, version=expected_version + 1,
                    updated_at=new_time.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                ))
            if result.rowcount != 1:
                raise ApiError("다른 탭에서 이 기록을 변경했습니다. 새로고침 후 다시 시도하세요.", 409, "version_conflict")
        return jsonify(log_id=log_id)

    @app.get("/")
    def index():
        return send_from_directory(PROJECT_ROOT, "index.html")

    @app.get("/<path:filename>")
    def public_file(filename):
        parts = Path(filename).parts
        if "\\" in filename or any(part.startswith(".") for part in parts):
            abort(404)
        allowed = filename in PUBLIC_HTML or (
            len(parts) > 1 and parts[0] in PUBLIC_DIRS and Path(filename).suffix.lower() in PUBLIC_EXTENSIONS
        )
        resolved = (PROJECT_ROOT / filename).resolve()
        if not allowed or not resolved.is_relative_to(PROJECT_ROOT):
            abort(404)
        return send_from_directory(PROJECT_ROOT, filename)

    return app


def init_database(app):
    """Create only this app's tables; never create, replace, or drop databases."""
    metadata.create_all(app.extensions["filmlog_engine"])
