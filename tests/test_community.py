"""개인 기록을 보호하면서 영화별 공유 정보를 제공하는지 확인하는 테스트입니다."""

import os

import pytest
from sqlalchemy import Column, Float, ForeignKey, Index, Integer, MetaData, String, Table, Text, insert, inspect, select, update
from sqlalchemy.engine import make_url

from server.app import create_app, init_database
from server.database import metadata, profiles, watch_logs
from test_server import app, auth_headers, new_log, register


COMMUNITY = "/api/movies/m001/community"


def save(client, account, **overrides):
    response = new_log(client, account, **overrides)
    assert response.status_code == 201, response.json
    return response.json["log_id"]


def edit(client, account, log_id, version=1, **overrides):
    values = {
        "movie_id": "m001", "watched_on": "2026-11-13", "rating": 4.5,
        "review_text": "공개 관람평", "expected_version": version,
    }
    values.update(overrides)
    return client.patch(f"/api/watch-logs/{log_id}", json=values, headers=auth_headers(account))


def test_community_requires_login_and_valid_movie(app):
    client = app.test_client()
    assert client.get(COMMUNITY).status_code == 401
    account = register(client)
    response = client.get(COMMUNITY)
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store"
    assert response.json == {"average_rating": None, "rating_count": 0, "reviews": [], "next_offset": None}
    assert client.get("/api/movies/missing/community").status_code == 404
    assert client.get(COMMUNITY, headers={"X-Profile-Id": "another-account"}).status_code == 409


@pytest.mark.parametrize("offset", ["-1", "1.5", "oops", "", "2147483648", "9" * 100])
def test_community_rejects_invalid_offsets(app, offset):
    client = app.test_client()
    register(client)
    assert client.get(COMMUNITY, query_string={"offset": offset}).status_code == 400


def test_average_uses_each_users_latest_saved_nonempty_rating(app):
    a_client, b_client, c_client = (app.test_client() for _ in range(3))
    a, b, c = register(a_client), register(b_client, "student_b"), register(c_client, "student_c")
    old = save(a_client, a, rating=1)
    latest = save(a_client, a, rating=5, watched_on="2026-11-01")
    unrated = save(a_client, a, rating=None)
    save(b_client, b, rating=3, is_public=True)
    save(c_client, c, rating=None)
    save(c_client, c, rating=0.5, movie_id="m002")
    with app.extensions["filmlog_engine"].begin() as connection:
        for log_id, timestamp in ((old, "2026-11-13T01:00:00.000Z"), (latest, "2026-11-13T02:00:00.000Z"), (unrated, "2026-11-13T03:00:00.000Z")):
            connection.execute(update(watch_logs).where(watch_logs.c.log_id == log_id).values(updated_at=timestamp))
    result = a_client.get(COMMUNITY).json
    assert result["average_rating"] == 4
    assert result["rating_count"] == 2
    assert edit(a_client, a, old, rating=2).status_code == 200
    result = a_client.get(COMMUNITY).json
    assert result["average_rating"] == 2.5
    assert result["rating_count"] == 2


def test_equal_timestamps_choose_exactly_one_rating_deterministically(app):
    client = app.test_client()
    account = register(client)
    one, two = save(client, account, rating=1), save(client, account, rating=5)
    with app.extensions["filmlog_engine"].begin() as connection:
        connection.execute(update(watch_logs).values(created_at="2026-11-13T00:00:00.000Z", updated_at="2026-11-13T00:00:00.000Z"))
    result = client.get(COMMUNITY).json
    assert result["rating_count"] == 1
    assert result["average_rating"] == (1 if one > two else 5)


def test_public_projection_and_private_snapshots_remain_separate(app):
    a_client, b_client = app.test_client(), app.test_client()
    a, b = register(a_client), register(b_client, "student_b", "다른 관객")
    save(a_client, a, is_public=True, review_text="나의 공개 글")
    private = save(b_client, b, review_text="비공개 글")
    save(b_client, b, is_public=True, review_text="<script>공개 글</script>", rating=3)
    save(b_client, b, is_public=True, review_text="   ")
    save(b_client, b, is_public=True, movie_id="m002", review_text="다른 영화")
    result = a_client.get(COMMUNITY).json
    assert result["reviews"] == [{"display_name": "다른 관객", "rating": 3, "review_text": "<script>공개 글</script>"}]
    own = a_client.get("/api/snapshot").json["logs"]
    assert len(own) == 1 and own[0]["profile_id"] == a["profile"]["profile_id"]
    other = b_client.get("/api/snapshot").json["logs"]
    assert len(other) == 4
    assert next(row for row in other if row["log_id"] == private)["is_public"] is False


@pytest.mark.parametrize("is_public", [None, 0, 1, "true", [], {}])
def test_visibility_must_be_explicit_boolean(app, is_public):
    client = app.test_client()
    account = register(client)
    response = new_log(client, account, is_public=is_public)
    assert response.status_code == 400
    assert "is_public" in response.json["fields"]
    assert client.get("/api/snapshot").json["logs"] == []


def test_only_owner_can_publish_hide_or_delete_and_versions_are_checked(app):
    a_client, b_client = app.test_client(), app.test_client()
    a, b = register(a_client), register(b_client, "student_b")
    log_id = save(a_client, a)
    assert b_client.get(COMMUNITY).json["reviews"] == []
    assert edit(b_client, b, log_id, is_public=True).status_code == 404
    assert edit(a_client, a, log_id, is_public=True).status_code == 200
    assert len(b_client.get(COMMUNITY).json["reviews"]) == 1
    assert edit(a_client, a, log_id, is_public=False).status_code == 409
    assert len(b_client.get(COMMUNITY).json["reviews"]) == 1
    assert edit(a_client, a, log_id, version=2, is_public=False).status_code == 200
    assert b_client.get(COMMUNITY).json["reviews"] == []
    assert edit(a_client, a, log_id, version=3, is_public=True).status_code == 200
    assert b_client.delete(f"/api/watch-logs/{log_id}", json={"expected_version": 4}, headers=auth_headers(b)).status_code == 404
    assert a_client.delete(f"/api/watch-logs/{log_id}", json={"expected_version": 4}, headers=auth_headers(a)).status_code == 200
    result = b_client.get(COMMUNITY).json
    assert result["reviews"] == [] and result["rating_count"] == 0


def test_legacy_client_update_preserves_public_flag_and_requires_csrf(app):
    client = app.test_client()
    account = register(client)
    log_id = save(client, account, is_public=True)
    assert edit(client, account, log_id).status_code == 200
    assert client.get("/api/snapshot").json["logs"][0]["is_public"] is True
    no_csrf = client.patch(f"/api/watch-logs/{log_id}", json={"is_public": False, "expected_version": 2})
    assert no_csrf.status_code == 403
    assert client.get("/api/snapshot").json["logs"][0]["is_public"] is True


def test_public_reviews_have_bounded_stable_pagination(app):
    reader, writer = app.test_client(), app.test_client()
    register(reader)
    account = register(writer, "student_b")
    for number in range(21):
        log_id = save(writer, account, is_public=True, review_text=f"관람평 {number}")
        with app.extensions["filmlog_engine"].begin() as connection:
            connection.execute(update(watch_logs).where(watch_logs.c.log_id == log_id).values(updated_at=f"2026-11-13T00:00:{number:02d}.000Z"))
    first = reader.get(COMMUNITY).json
    assert len(first["reviews"]) == 20 and first["next_offset"] == 20
    assert [row["review_text"] for row in first["reviews"]] == [f"관람평 {number}" for number in range(20, 0, -1)]
    second = reader.get(COMMUNITY + "?offset=20").json
    assert [row["review_text"] for row in second["reviews"]] == ["관람평 0"]
    assert second["next_offset"] is None and second["rating_count"] == 1


def test_existing_database_migration_is_additive_private_and_repeatable(tmp_path):
    url = "sqlite:///" + str(tmp_path / "legacy.db")
    configured_url = os.environ.get("FILMLOG_TEST_DATABASE_URL")
    if configured_url and make_url(configured_url).get_backend_name() != "sqlite":
        if not (make_url(configured_url).database or "").endswith("_test"):
            raise RuntimeError("Tests require a dedicated database whose name ends in _test.")
        url = configured_url
    application = create_app({
        "TESTING": True, "DATABASE_URL": url,
        "SECRET_KEY": "migration-test-" * 5, "APP_ENV": "development", "SESSION_COOKIE_SECURE": False,
    })
    engine = application.extensions["filmlog_engine"]
    try:
        # 임시 SQLite 파일 또는 이름을 확인한 전용 테스트 DB에서만 이전 구조를 재현하는 작업입니다.
        metadata.drop_all(engine)
        legacy_metadata = MetaData()
        profiles.to_metadata(legacy_metadata)
        legacy_logs = Table(
            "watch_logs", legacy_metadata,
            Column("log_id", String(36), primary_key=True),
            Column("profile_id", String(36), ForeignKey("profiles.profile_id", ondelete="CASCADE"), nullable=False),
            Column("movie_id", String(100), nullable=False),
            Column("watched_on", String(10), nullable=False),
            Column("rating", Float),
            Column("review_text", Text),
            Column("created_at", String(24), nullable=False),
            Column("updated_at", String(24), nullable=False),
            Column("version", Integer, nullable=False, default=1),
            mysql_charset="utf8mb4", mysql_engine="InnoDB",
        )
        Index("ix_watch_logs_profile", legacy_logs.c.profile_id)
        legacy_metadata.create_all(engine)
        with engine.begin() as connection:
            connection.execute(insert(profiles).values(profile_id="legacy-user", username="legacy", display_name="기존 사용자", password_hash="unchanged", created_at="2026-11-13T00:00:00.000Z"))
            connection.execute(insert(legacy_logs).values(
                log_id="legacy-log", profile_id="legacy-user", movie_id="m001", watched_on="2026-11-13",
                rating=4.5, review_text="기존 비공개 기록", created_at="2026-11-13T00:00:00.000Z",
                updated_at="2026-11-13T00:00:00.000Z", version=2,
            ))
        init_database(application)
        init_database(application)
        with engine.begin() as connection:
            row = dict(connection.execute(select(watch_logs)).mappings().one())
            assert row["is_public"] is False and row["review_text"] == "기존 비공개 기록"
            assert row["rating"] == 4.5 and row["version"] == 2 and row["log_id"] == "legacy-log"
            assert connection.execute(select(profiles.c.password_hash)).scalar_one() == "unchanged"
            connection.execute(insert(watch_logs).values(log_id="new-log", profile_id="legacy-user", movie_id="m001", watched_on="2026-11-13", created_at="2026-11-13T00:00:00.000Z", updated_at="2026-11-13T00:00:00.000Z"))
            assert connection.execute(select(watch_logs.c.is_public).where(watch_logs.c.log_id == "new-log")).scalar_one() is False
        indexes = {index["name"] for index in inspect(engine).get_indexes("watch_logs")}
        assert "ix_watch_logs_movie_profile" in indexes
        reader = application.test_client()
        register(reader, "migration_reader")
        response = reader.get(COMMUNITY)
        assert response.status_code == 200, response.json
        assert response.json == {"average_rating": 4.5, "rating_count": 1, "reviews": [], "next_offset": None}
        with engine.begin() as connection:
            connection.execute(update(watch_logs).where(watch_logs.c.log_id == "legacy-log").values(is_public=True))
        response = reader.get(COMMUNITY)
        assert response.status_code == 200, response.json
        assert response.json["reviews"] == [{"display_name": "기존 사용자", "rating": 4.5, "review_text": "기존 비공개 기록"}]
    finally:
        engine.dispose()
