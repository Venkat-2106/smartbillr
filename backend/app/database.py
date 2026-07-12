from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
from dotenv import load_dotenv
import os

load_dotenv(override=True)

DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,       # ← Tests connection before using it.
                               #   If dead, gets a fresh one automatically.
    pool_recycle=300,          # ← Recycles connections every 5 minutes
                               #   before Supabase drops them (timeout ~10min).
    pool_size=5,               # ← Max 5 persistent connections in the pool
    max_overflow=10            # ← Up to 10 extra connections under heavy load
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# ── Async engine (for async route handlers) ─────────────────────────────
# Uses the same DATABASE_URL with the postgresql+asyncpg:// scheme.
# asyncpg does not accept sslmode as a URL parameter (that's psycopg2).
# We strip it and pass SSL config via connect_args instead.

def _build_async_url(url: str) -> tuple[str, dict]:
    """Convert a psycopg2-style DATABASE_URL to asyncpg-compatible form.

    Returns (cleaned_url, connect_args) where connect_args contains SSL
    configuration that asyncpg understands.
    """
    url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    parsed = urlparse(url)
    params = parse_qs(parsed.query)

    connect_args = {}
    sslmode = params.pop("sslmode", [None])[0]
    if sslmode:
        import ssl as _ssl
        if sslmode in ("require", "prefer"):
            # require/prefer = use SSL but don't verify cert (matches psycopg2 behaviour)
            ctx = _ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = _ssl.CERT_NONE
            connect_args["ssl"] = ctx
        elif sslmode in ("verify-ca", "verify-full"):
            ctx = _ssl.create_default_context()
            ctx.check_hostname = True
            ctx.verify_mode = _ssl.CERT_REQUIRED
            connect_args["ssl"] = ctx

    clean_query = urlencode(params, doseq=True) if params else ""
    clean_url = urlunparse(parsed._replace(query=clean_query))
    return clean_url, connect_args


ASYNC_DATABASE_URL, _async_connect_args = _build_async_url(DATABASE_URL)

async_engine = create_async_engine(
    ASYNC_DATABASE_URL,
    connect_args=_async_connect_args,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_size=5,
    max_overflow=10,
)

AsyncSessionLocal = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

async def get_async_db():
    """Async session dependency for FastAPI route handlers."""
    async with AsyncSessionLocal() as db:
        try:
            yield db
        finally:
            await db.close()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()