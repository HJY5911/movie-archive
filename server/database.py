"""The database contains user data only, not the movie catalog or photos."""

from sqlalchemy import (
    BigInteger, Column, Float, ForeignKey, Index, Integer, MetaData,
    String, Table, Text, create_engine,
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
    Column("created_at", String(24), nullable=False),
    Column("updated_at", String(24), nullable=False),
    Column("version", Integer, nullable=False, default=1),
    mysql_charset="utf8mb4", mysql_engine="InnoDB",
)
Index("ix_watch_logs_profile", watch_logs.c.profile_id)


def make_engine(url):
    options = {"pool_pre_ping": True, "pool_recycle": 280}
    if url.startswith("sqlite"):
        options["connect_args"] = {"check_same_thread": False}
        if url in {"sqlite://", "sqlite:///:memory:"}:
            options["poolclass"] = StaticPool
    return create_engine(url, **options)
