"""The database contains user data only, not the movie catalog or photos."""

from sqlalchemy import (
    BigInteger, Boolean, Column, Float, ForeignKey, Index, Integer, MetaData,
    String, Table, Text, create_engine, false, inspect, text,
)
from sqlalchemy.pool import StaticPool

metadata = MetaData()

profiles = Table(
    "profiles", metadata,
    Column("profile_id", String(36), primary_key=True),
    Column("username", String(32), nullable=False, unique=True),
    Column("display_name", String(40), nullable=False),
    Column("password_hash", String(256), nullable=False),
    Column("created_at", String(24), nullable=False),
    mysql_charset="utf8mb4", mysql_engine="InnoDB",
)

auth_sessions = Table(
    "auth_sessions", metadata,
    Column("token_hash", String(64), primary_key=True),
    Column("profile_id", String(36), ForeignKey("profiles.profile_id", ondelete="CASCADE")),
    Column("expires_at", BigInteger, nullable=False),
    mysql_charset="utf8mb4", mysql_engine="InnoDB",
)
Index("ix_auth_sessions_expiry", auth_sessions.c.expires_at)

watch_logs = Table(
    "watch_logs", metadata,
    Column("log_id", String(36), primary_key=True),
    Column("profile_id", String(36), ForeignKey("profiles.profile_id", ondelete="CASCADE"), nullable=False),
    Column("movie_id", String(100), nullable=False),
    Column("watched_on", String(10), nullable=False),
    Column("rating", Float),
    Column("review_text", Text),
    Column("is_public", Boolean, nullable=False, server_default=false()),
    Column("created_at", String(24), nullable=False),
    Column("updated_at", String(24), nullable=False),
    Column("version", Integer, nullable=False, default=1),
    mysql_charset="utf8mb4", mysql_engine="InnoDB",
)
Index("ix_watch_logs_profile", watch_logs.c.profile_id)
community_index = Index("ix_watch_logs_movie_profile", watch_logs.c.movie_id, watch_logs.c.profile_id)


def init_schema(engine):
    """기존 기록을 비공개로 보존하면서 필요한 테이블과 열만 추가하는 초기화입니다."""
    metadata.create_all(engine)
    with engine.begin() as connection:
        columns = {column["name"] for column in inspect(connection).get_columns("watch_logs")}
        if "is_public" not in columns:
            connection.execute(text("ALTER TABLE watch_logs ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT 0"))
        community_index.create(connection, checkfirst=True)


def make_engine(url):
    options = {"pool_pre_ping": True, "pool_recycle": 280}
    if url.startswith("sqlite"):
        options["connect_args"] = {"check_same_thread": False}
        if url in {"sqlite://", "sqlite:///:memory:"}:
            options["poolclass"] = StaticPool
    return create_engine(url, **options)
