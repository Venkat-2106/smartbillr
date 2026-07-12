from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
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
# Falls back gracefully if asyncpg is not installed.

ASYNC_DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")

async_engine = create_async_engine(
    ASYNC_DATABASE_URL,
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