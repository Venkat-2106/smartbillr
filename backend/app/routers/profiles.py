from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.middleware.auth import verify_token
from app.utils.response import success_response, error_response

router = APIRouter(prefix="/profiles", tags=["Profiles"])


@router.get("/me")
def get_my_profile(
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    try:
        user_id     = current_user["user_id"]
        business_id = current_user["business_id"]

        result = db.execute(
            text("""
                SELECT
                    id,
                    full_name,
                    role,
                    is_active,
                    business_id
                FROM profiles
                WHERE id = :user_id
                  AND business_id = :business_id
                  AND is_active = true
                LIMIT 1
            """),
            {"user_id": user_id, "business_id": business_id}
        ).fetchone()

        if not result:
            return error_response("Profile not found", 404)

        return success_response({
            "id":          str(result.id),
            "full_name":   result.full_name,
            "role":        result.role,
            "is_active":   result.is_active,
            "business_id": str(result.business_id),
        })

    except Exception as e:
        return error_response(f"Could not fetch profile: {str(e)}", 500)