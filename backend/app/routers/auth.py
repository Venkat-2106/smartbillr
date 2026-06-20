from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timezone
from app.database import get_db
from app.middleware.auth import verify_token, clear_user_cache
from app.utils.response import success_response

router = APIRouter(prefix="/auth", tags=["Auth"])


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
