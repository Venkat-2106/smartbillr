from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker
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

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()