from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os

# Load .env file
load_dotenv()

# Get database URL from .env
DATABASE_URL = os.getenv("DATABASE_URL")

# Create database engine
engine = create_engine(DATABASE_URL)

# Create session
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()

# Dependency — used in every route
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# TEST CONNECTION
if __name__ == "__main__":
    try:
        connection = engine.connect()
        print("✅ Database connected successfully!")
        connection.close()
    except Exception as e:
        print(f"❌ Connection failed: {e}")