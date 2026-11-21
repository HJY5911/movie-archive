"""Account isolation and API security, on SQLite or a dedicated MySQL test DB.

FILMLOG_TEST_DATABASE_URL may name a dedicated database ending in ``_test``.
These tests remove that test database's app rows between cases, never real data.
"""

import os
import time
from datetime import date, datetime

import pytest
from sqlalchemy import delete, select, update
from sqlalchemy.engine import make_url

from server.app import create_app, init_database
import server.app as server_module
from server.database import auth_sessions, profiles, watch_logs


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setattr(server_module, "watch_today", lambda: date(2026, 11, 16))
    url = os.environ.get("FILMLOG_TEST_DATABASE_URL") or "sqlite:///:memory:"
    if not url.startswith("sqlite") and not (make_url(url).database or "").endswith("_test"):
        raise RuntimeError("Tests require a dedicated database whose name ends in _test.")
    application = create_app({
        "TESTING": True, "DATABASE_URL": url, "SECRET_KEY": "test-secret-" * 5,
        "APP_ENV": "development", "PUBLIC_ORIGIN": "http://localhost",
        "SESSION_COOKIE_SECURE": False, "AUTH_RATE_LIMIT": 0,
    })
    init_database(application)
    engine = application.extensions["filmlog_engine"]
    with engine.begin() as connection:
        for table in (watch_logs, auth_sessions, profiles):
            connection.execute(delete(table))
    yield application
    engine.dispose()


@pytest.fixture
def client(app):
    return app.test_client()


def csrf(client):
    response = client.get("/api/session")
    assert response.status_code == 200
    return response.json["csrf_token"]


def register(client, username="student_a", display_name="학생 가"):
    token = csrf(client)
    response = client.post("/api/register", json={
        "username": username, "display_name": display_name, "password": "study-pass-2026",
    }, headers={"X-CSRF-Token": token})
    assert response.status_code == 201, response.json
    return response.json


def auth_headers(account):
    return {"X-CSRF-Token": account["csrf_token"], "X-Profile-Id": account["profile"]["profile_id"]}


def new_log(client, account, **overrides):
    values = {"movie_id": "m001", "watched_on": "2026-11-13", "rating": 4.5, "review_text": "첫 감상 🎬"}
    values.update(overrides)
    return client.post("/api/watch-logs", json=values, headers=auth_headers(account))


def test_registration_profile_and_password_hash(app, client):
    account = register(client)
    assert set(account["profile"]) == {"profile_id", "display_name", "created_at"}
    assert account["profile"]["display_name"] == "학생 가"
    assert client.get("/api/snapshot").json["logs"] == []
    with app.extensions["filmlog_engine"].connect() as connection:
        row = connection.execute(select(profiles)).mappings().one()
        assert row["password_hash"] != "study-pass-2026"
        assert row["password_hash"].startswith("scrypt:")
    response = client.get("/api/session")
    assert response.json["profile"] == account["profile"]
    assert response.headers["Cache-Control"] == "no-store"


def test_csrf_cookie_and_login_rotation(app, client):
    initial = client.get("/api/session")
    old_token = initial.json["csrf_token"]
    cookie = initial.headers["Set-Cookie"]
    assert "HttpOnly" in cookie and "SameSite=Lax" in cookie
    missing = client.post("/api/register", json={})
    assert missing.status_code == 403
    cross_site = client.post("/api/register", json={}, headers={"X-CSRF-Token": old_token, "Origin": "https://evil.invalid"})
    assert cross_site.status_code == 403
    account = register(client)
    assert old_token != account["csrf_token"]
    stale = client.post("/api/watch-logs", json={}, headers={"X-CSRF-Token": old_token})
    assert stale.status_code == 403
    assert stale.json["code"] == "csrf_invalid"
    with app.extensions["filmlog_engine"].connect() as connection:
        assert len(connection.execute(select(auth_sessions)).all()) == 1


def test_logout_revokes_stolen_cookie_and_expiry(app, client):
    account = register(client)
    stolen = client.get_cookie("filmlog_session").value
    response = client.post("/api/logout", headers=auth_headers(account))
    assert response.status_code == 200
    replay = app.test_client()
    replay.set_cookie("filmlog_session", stolen)
    assert replay.get("/api/snapshot").status_code == 401
    account = register(client, "student_b")
    with app.extensions["filmlog_engine"].begin() as connection:
        connection.execute(update(auth_sessions).values(expires_at=int(time.time()) - 1))
    assert client.get("/api/snapshot").status_code == 401
    assert client.get("/api/session").json["profile"] is None


def test_duplicate_username_case_and_login(client):
    account = register(client, "Student_A")
    duplicate = client.post("/api/register", json={
        "username": "student_a", "display_name": "중복", "password": "study-pass-2026",
    }, headers=auth_headers(account))
    assert duplicate.status_code == 409
    assert duplicate.json["code"] == "username_taken"
    client.post("/api/logout", headers=auth_headers(account))
    token = csrf(client)
    incorrect = client.post("/api/login", json={"username": "Student_A", "password": "wrong-password"}, headers={"X-CSRF-Token": token})
    assert incorrect.status_code == 401
    logged_in = client.post("/api/login", json={"username": "STUDENT_A", "password": "study-pass-2026"}, headers={"X-CSRF-Token": token})
    assert logged_in.status_code == 200
    assert logged_in.json["profile"] == account["profile"]


def test_two_accounts_cannot_read_or_mutate_each_other(app, client):
    a = register(client)
    response = new_log(client, a)
    assert response.status_code == 201
    log_id = response.json["log_id"]
    b_client = app.test_client()
    b = register(b_client, "student_b", "학생 나")
    assert b_client.get("/api/snapshot").json["logs"] == []
    assert b_client.delete(f"/api/watch-logs/{log_id}", json={"expected_version": 1}, headers=auth_headers(b)).status_code == 404
    assert b_client.patch(f"/api/watch-logs/{log_id}", json={
        "movie_id": "m001", "watched_on": "2026-11-13", "rating": 1, "expected_version": 1,
    }, headers=auth_headers(b)).status_code == 404
    forged_owner = new_log(b_client, b, profile_id=a["profile"]["profile_id"])
    assert forged_owner.status_code == 201
    own_row = b_client.get("/api/snapshot").json["logs"][0]
    assert own_row["profile_id"] == b["profile"]["profile_id"]
    assert len(client.get("/api/snapshot").json["logs"]) == 1


def test_stale_tab_identity_and_session_are_rejected(client):
    a = register(client)
    b = register(client, "student_b")
    for path in ("/api/session", "/api/snapshot"):
        response = client.get(path, headers={"X-Profile-Id": a["profile"]["profile_id"]})
        assert response.status_code == 409
        assert response.json["code"] == "account_changed"
    assert new_log(client, a).status_code == 409
    assert new_log(client, b).status_code == 201


def test_update_delete_version_and_movie_immutability(client):
    account = register(client)
    log_id = new_log(client, account).json["log_id"]
    original = client.get("/api/snapshot").json["logs"][0]
    values = {"movie_id": "m001", "watched_on": "2026-11-12", "rating": None, "review_text": "수정", "expected_version": 1}
    changed = client.patch(f"/api/watch-logs/{log_id}", json=values, headers=auth_headers(account))
    assert changed.status_code == 200
    row = client.get("/api/snapshot").json["logs"][0]
    assert row["version"] == 2 and row["rating"] is None
    assert row["created_at"] == original["created_at"]
    assert row["updated_at"] > original["updated_at"]
    assert client.patch(f"/api/watch-logs/{log_id}", json=values, headers=auth_headers(account)).status_code == 409
    assert client.delete(f"/api/watch-logs/{log_id}", json={"expected_version": 1}, headers=auth_headers(account)).status_code == 409
    values.update(expected_version=2, movie_id="m002")
    assert client.patch(f"/api/watch-logs/{log_id}", json=values, headers=auth_headers(account)).status_code == 400
    deleted = client.delete(f"/api/watch-logs/{log_id}", json={"expected_version": 2}, headers=auth_headers(account))
    assert deleted.status_code == 200
    assert client.get("/api/snapshot").json["logs"] == []


@pytest.mark.parametrize("overrides,field", [
    ({"movie_id": "missing"}, "movie_id"),
    ({"watched_on": "2026-02-29"}, "watched_on"),
    ({"watched_on": "2026-13-01"}, "watched_on"),
    ({"watched_on": "2026-1-01"}, "watched_on"),
    ({"rating": 0}, "rating"),
    ({"rating": 3.7}, "rating"),
    ({"rating": True}, "rating"),
    ({"rating": "nan"}, "rating"),
    ({"rating": 10 ** 400}, "rating"),
    ({"review_text": []}, "review_text"),
    ({"review_text": "a" * 10001}, "review_text"),
])
def test_server_revalidates_watch_input(client, overrides, field):
    account = register(client)
    response = new_log(client, account, **overrides)
    assert response.status_code == 400
    assert field in response.json["fields"]
    assert client.get("/api/snapshot").json["logs"] == []


def test_leap_day_blank_review_and_snapshot_order(client):
    account = register(client)
    assert new_log(client, account, watched_on="2024-02-29", rating="", review_text="   ").status_code == 201
    assert new_log(client, account, watched_on="2026-11-13").status_code == 201
    rows = client.get("/api/snapshot").json["logs"]
    assert rows[0]["watched_on"] == "2026-11-13"
    assert rows[1]["rating"] is None and rows[1]["review_text"] is None


@pytest.mark.parametrize("watched_on", ["1900-01-01", "2024-02-29", "2026-11-15", "2026-11-16"])
def test_watch_date_range_includes_minimum_past_and_today(client, watched_on):
    account = register(client)
    response = new_log(client, account, watched_on=watched_on)
    assert response.status_code == 201
    assert client.get("/api/snapshot").json["logs"][0]["watched_on"] == watched_on


@pytest.mark.parametrize("watched_on", ["1899-12-31", "2026-11-17", "2099-12-31"])
def test_invalid_watch_date_create_and_update_leave_records_unchanged(client, watched_on):
    account = register(client)
    log_id = new_log(client, account, watched_on="2026-11-15").json["log_id"]
    original = client.get("/api/snapshot").json["logs"]
    created = new_log(client, account, watched_on=watched_on)
    assert created.status_code == 400
    assert "watched_on" in created.json["fields"]
    assert client.get("/api/snapshot").json["logs"] == original
    updated = client.patch(f"/api/watch-logs/{log_id}", json={
        "movie_id": "m001", "watched_on": watched_on, "rating": 1,
        "review_text": "변경되면 안 되는 내용", "expected_version": 1,
    }, headers=auth_headers(account))
    assert updated.status_code == 400
    assert "watched_on" in updated.json["fields"]
    assert client.get("/api/snapshot").json["logs"] == original
    # 거부된 요청으로 버전이 오르지 않아 올바른 오늘 날짜로 바로 수정할 수 있습니다.
    accepted = client.patch(f"/api/watch-logs/{log_id}", json={
        "movie_id": "m001", "watched_on": "2026-11-16", "rating": 4,
        "review_text": "오늘 감상", "expected_version": 1,
    }, headers=auth_headers(account))
    assert accepted.status_code == 200
    current = client.get("/api/snapshot").json["logs"][0]
    assert current["watched_on"] == "2026-11-16" and current["version"] == 2


@pytest.mark.parametrize("utc_time,expected", [
    ("2026-11-15T14:59:59+00:00", date(2026, 11, 15)),
    ("2026-11-15T15:00:00+00:00", date(2026, 11, 16)),
])
def test_watch_today_uses_korean_midnight(monkeypatch, utc_time, expected):
    instant = datetime.fromisoformat(utc_time)

    class FixedDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            # 이 테스트는 서버 OS가 UTC라고 가정합니다.
            return instant.astimezone(tz) if tz else instant.replace(tzinfo=None)

    monkeypatch.setattr(server_module, "datetime", FixedDateTime)
    assert server_module.watch_today() == expected


@pytest.mark.parametrize("path", [
    "/.env", "/.git/config", "/server/app.py", "/requirements.txt", "/wsgi.py",
    "/instance/db.sqlite", "/tests/test_server.py", "/docs/annotated/index.html",
    "/js/../.env", "/js/%2e%2e/.env", "/data/%2e%2e/server/app.py", "/js/.hidden.js",
])
def test_private_files_cannot_be_downloaded(client, path):
    assert client.get(path).status_code == 404


def test_public_pages_catalog_and_repository_remain_available(client):
    for path in ("/", "/movies.html", "/stats.html", "/achievements.html", "/data/catalog.json", "/js/repository.js"):
        assert client.get(path).status_code == 200, path
    assert len(client.get("/data/catalog.json").json["Movie"]) == 18


def test_unauthenticated_access_and_oversized_json(client):
    assert client.get("/api/snapshot").status_code == 401
    assert client.get("/api/session", headers={"X-Profile-Id": "some-profile"}).status_code == 401
    account = register(client)
    response = client.post("/api/watch-logs", json={"review_text": "a" * 70000}, headers=auth_headers(account))
    assert response.status_code == 413
    assert response.is_json


def test_auth_rate_limit(app, client):
    app.config["AUTH_RATE_LIMIT"] = 2
    token = csrf(client)
    for _ in range(2):
        response = client.post("/api/login", json={"username": "missing", "password": "incorrect"}, headers={"X-CSRF-Token": token})
        assert response.status_code == 401
    response = client.post("/api/login", json={"username": "missing", "password": "incorrect"}, headers={"X-CSRF-Token": token})
    assert response.status_code == 429


def test_production_requires_mysql_https_and_secret():
    with pytest.raises(RuntimeError):
        create_app({"DATABASE_URL": "sqlite://", "SECRET_KEY": "a" * 32, "APP_ENV": "production"})
    with pytest.raises(RuntimeError):
        create_app({"DATABASE_URL": "sqlite://", "SECRET_KEY": "short"})
