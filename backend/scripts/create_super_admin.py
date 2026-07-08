"""
CLI script to create the single platform super admin.

Usage:
    python -m scripts.create_super_admin --email admin@example.com

Password is prompted interactively via getpass (never in shell history / ps).

This script:
  1. Creates a Supabase Auth user via the Admin API (SUPABASE_SERVICE_ROLE_KEY)
  2. Inserts a row into the super_admins table
  3. Fails if a super admin already exists (enforced by DB unique index)

Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.
"""

import argparse
import getpass
import os
import sys
import httpx

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")


def get_supabase_admin_headers():
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }


def create_auth_user(email: str, password: str, full_name: str) -> str:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set in .env")
        sys.exit(1)

    response = httpx.post(
        f"{SUPABASE_URL}/auth/v1/admin/users",
        headers=get_supabase_admin_headers(),
        json={
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"full_name": full_name},
        },
        timeout=10,
    )
    if response.status_code not in (200, 201):
        detail = response.json().get("message") or response.text
        print(f"ERROR: Supabase Auth API error: {detail}")
        sys.exit(1)

    user_id = response.json()["id"]
    print(f"Supabase Auth user created: {email} -> {user_id}")
    return user_id


def insert_super_admin(user_id: str):
    from sqlalchemy import create_engine, text
    from sqlalchemy.exc import IntegrityError

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL not set in .env")
        sys.exit(1)

    engine = create_engine(database_url)
    with engine.begin() as conn:
        existing = conn.execute(
            text("SELECT COUNT(*) FROM super_admins")
        ).scalar()

        if existing and existing > 0:
            print("ERROR: A super admin already exists. Only one is allowed.")
            print("Delete the existing row first, then re-run this script.")
            sys.exit(1)

        try:
            conn.execute(
                text("INSERT INTO super_admins (user_id) VALUES (:uid)"),
                {"uid": user_id},
            )
            print(f"Super admin inserted into super_admins: user_id={user_id}")
        except IntegrityError:
            print("ERROR: Database constraint violation.")
            print("A super admin may already exist (unique index).")
            sys.exit(1)

    engine.dispose()


def main():
    parser = argparse.ArgumentParser(
        description="Create the single platform super admin for SmartBillr."
    )
    parser.add_argument("--email", required=True, help="Email for the super admin")
    parser.add_argument("--full-name", default="Super Admin", help="Display name (default: Super Admin)")
    args = parser.parse_args()

    password = getpass.getpass("Password: ")
    user_id = create_auth_user(args.email, password, args.full_name)
    insert_super_admin(user_id)
    print("Done. The super admin can log in at /admin/login.")


if __name__ == "__main__":
    main()
