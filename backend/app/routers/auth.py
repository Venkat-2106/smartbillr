from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timezone
from app.database import get_db
from app.middleware.auth import verify_token, clear_user_cache
from app.utils.response import success_response

router = APIRouter(prefix="/v1/auth", tags=["Auth"])


@router.post("/logout")
def logout(
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    user_id = current_user["user_id"]
    now = datetime.now(timezone.utc)

    db.execute(
        text("UPDATE profiles SET last_logout_at = :now WHERE id = :user_id"),
        {"now": now, "user_id": user_id}
    )
    db.commit()

    clear_user_cache(user_id)

    return success_response({"message": "Logged out successfully"})


@router.post("/record-login")
def record_login(
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    user_id = current_user["user_id"]
    now = datetime.now(timezone.utc)

    row = db.execute(
        text("""
            SELECT last_logout_at, last_login_at
            FROM profiles WHERE id = :user_id
            LIMIT 1
        """),
        {"user_id": user_id}
    ).fetchone()

    has_existing_session = False
    if row:
        last_logout = row.last_logout_at
        last_login  = row.last_login_at
        if last_login is not None:
            if last_logout is None or last_logout < last_login:
                has_existing_session = True

    if not has_existing_session:
        db.execute(
            text("UPDATE profiles SET last_login_at = :now WHERE id = :user_id"),
            {"now": now, "user_id": user_id}
        )
    db.commit()

    return success_response({
        "has_existing_session": has_existing_session,
    })


@router.post("/confirm-session")
def confirm_session(
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    user_id = current_user["user_id"]
    now = datetime.now(timezone.utc)

    db.execute(
        text("UPDATE profiles SET last_logout_at = :now, last_login_at = :now WHERE id = :user_id"),
        {"now": now, "user_id": user_id}
    )
    db.commit()

    clear_user_cache(user_id)

    return success_response({"message": "Previous session invalidated"})
