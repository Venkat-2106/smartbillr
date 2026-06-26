from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timezone, timedelta
import uuid
import os
import logging

from app.database import get_db
from app.middleware.auth import verify_token, verify_super_admin
from app.utils.response import success_response, error_response
from app.schemas.business import (
    BusinessCreate,
    BusinessRegistrationResponse,
    SubscriptionResponse,
    SubscriptionUpdate,
)


SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")


# ── Separate routers to avoid path conflicts ─────────────────────────────────

reg_router = APIRouter(prefix="/v1", tags=["Registration"])
sub_router = APIRouter(prefix="/v1/businesses", tags=["Subscription"])
admin_router = APIRouter(prefix="/v1/admin", tags=["Admin"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_dt(val):
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    if isinstance(val, str):
        for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S"):
            try:
                return datetime.strptime(val, fmt).replace(tzinfo=timezone.utc)
            except ValueError:
                continue
    return val


def _get_supabase_admin_headers():
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }


def _create_supabase_auth_user(email: str, password: str, full_name: str) -> dict:
    import httpx
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise ValueError("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env")
    response = httpx.post(
        f"{SUPABASE_URL}/auth/v1/admin/users",
        headers=_get_supabase_admin_headers(),
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
        raise ValueError(f"Supabase Auth error: {detail}")
    return response.json()


def _delete_supabase_auth_user(auth_user_id: str):
    import httpx
    try:
        httpx.delete(
            f"{SUPABASE_URL}/auth/v1/admin/users/{auth_user_id}",
            headers=_get_supabase_admin_headers(),
            timeout=10,
        )
    except Exception as e:
        logging.exception("Failed to delete Supabase auth user %s: %s", auth_user_id, e)


# ─── POST /v1/business — Self-service tenant registration ──────────────────────

@reg_router.post("/business", status_code=201)
def register_business(
    payload: BusinessCreate,
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    business_id = str(uuid.uuid4())
    trial_end = now + timedelta(days=30)

    existing = db.execute(
        text("SELECT id FROM profiles WHERE LOWER(email) = LOWER(:email) LIMIT 1"),
        {"email": payload.owner_email},
    ).fetchone()
    if existing:
        return error_response("This email is already registered", 400)

    if payload.business_name:
        existing_name = db.execute(
            text("SELECT business_id FROM businesses WHERE LOWER(business_name) = LOWER(:name) AND (is_deleted = false OR is_deleted IS NULL) LIMIT 1"),
            {"name": payload.business_name},
        ).fetchone()
        if existing_name:
            return error_response("A business with this name already exists", 400)

    if payload.gstin:
        existing_gst = db.execute(
            text("SELECT business_id FROM businesses WHERE gstin = :gstin AND (is_deleted = false OR is_deleted IS NULL) LIMIT 1"),
            {"gstin": payload.gstin},
        ).fetchone()
        if existing_gst:
            return error_response("This GSTIN is already registered", 400)

    try:
        auth_user = _create_supabase_auth_user(
            payload.owner_email, payload.owner_password, payload.owner_name
        )
        auth_user_id = auth_user["id"]
    except Exception as e:
        logging.exception(e)
        return error_response("Registration failed. Please try again.", 400)

    try:
        db.execute(
            text("""
                INSERT INTO businesses (
                    business_id, business_name, business_email, business_phone,
                    business_address, business_state, gstin, is_gst_registered,
                    business_country_code, created_at,
                    payment_status, subscription_type,
                    trial_start_at, trial_end_at, is_active
                ) VALUES (
                    :business_id, :business_name, :business_email, :business_phone,
                    :business_address, :business_state, :gstin, :is_gst_registered,
                    :business_country_code, :created_at,
                    'pending', 'trial',
                    :trial_start_at, :trial_end_at, :is_active_val
                )
            """),
            {
                "business_id": business_id,
                "business_name": payload.business_name,
                "business_email": payload.business_email or payload.owner_email,
                "business_phone": payload.business_phone,
                "business_address": payload.business_address,
                "business_state": payload.business_state,
                "gstin": payload.gstin,
                "is_gst_registered": payload.is_gst_registered or False,
                "business_country_code": payload.business_country_code,
                "is_active_val": True,
                "created_at": now,
                "trial_start_at": now,
                "trial_end_at": trial_end,
            },
        )

        # NOTE: purchase_counter / customer_counter are set by server_default
        # in migration f2g3h4i5j6k7. Deliberately omitted here to avoid
        # PostgreSQL 42703 errors if the migration hasn't been applied.
        db.execute(
            text("""
                INSERT INTO business_counters (business_id, invoice_counter)
                VALUES (:bid, 0)
            """),
            {"bid": business_id},
        )

        role_row = db.execute(
            text("SELECT id FROM roles WHERE name = 'admin' LIMIT 1")
        ).fetchone()
        if not role_row:
            raise ValueError("Admin role not found in roles table")

        db.execute(
            text("""
                INSERT INTO profiles (id, business_id, full_name, email, role, role_id, is_active)
                VALUES (:id, :business_id, :full_name, :email, 'admin', :role_id, :is_active_val)
            """),
            {
                "id": auth_user_id,
                "business_id": business_id,
                "full_name": payload.owner_name,
                "email": payload.owner_email,
                "role_id": role_row.id,
                "is_active_val": True,
            },
        )

        db.commit()

    except Exception as e:
        db.rollback()
        _delete_supabase_auth_user(auth_user_id)
        logging.exception(e)
        return error_response("Registration failed. Please try again.", 500)

    return success_response(
        BusinessRegistrationResponse(
            business_id=uuid.UUID(business_id),
            business_name=payload.business_name,
            owner_email=payload.owner_email,
            trial_end_at=trial_end,
            subscription_type="trial",
        ).model_dump(),
        status_code=201,
    )


# ─── GET /v1/businesses/me/subscription — Get my subscription status ──────────

@sub_router.get("/me/subscription")
def get_my_subscription(
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    bid = current_user["business_id"]
    now = datetime.now(timezone.utc)

    row = db.execute(
        text("""
            SELECT
                payment_status, subscription_type,
                subscription_start_at, subscription_end_at,
                trial_start_at, trial_end_at, is_active
            FROM businesses
            WHERE business_id = :bid
            LIMIT 1
        """),
        {"bid": bid},
    ).fetchone()

    if not row:
        return error_response("Business not found", 404)

    trial_end = _parse_dt(row.trial_end_at)
    sub_end = _parse_dt(row.subscription_end_at)

    is_expired = False
    days_remaining = None

    if row.payment_status == "pending" and trial_end and now > trial_end:
        is_expired = True
        days_remaining = 0
    elif row.payment_status == "paid" and sub_end:
        if now > sub_end:
            is_expired = True
            days_remaining = 0
        else:
            days_remaining = (sub_end - now).days
    elif row.payment_status == "pending" and trial_end:
        if now <= trial_end:
            days_remaining = (trial_end - now).days
        else:
            is_expired = True
            days_remaining = 0

    return success_response(
        SubscriptionResponse(
            payment_status=row.payment_status,
            subscription_type=row.subscription_type,
            subscription_start_at=_parse_dt(row.subscription_start_at),
            subscription_end_at=_parse_dt(row.subscription_end_at),
            trial_start_at=_parse_dt(row.trial_start_at),
            trial_end_at=_parse_dt(row.trial_end_at),
            is_active=bool(row.is_active),
            days_remaining=days_remaining,
            is_expired=is_expired,
        ).model_dump()
    )


# ─── PATCH /v1/admin/businesses/{business_id}/subscription — Super Admin ─────

@admin_router.patch("/businesses/{business_id}/subscription")
def update_subscription(
    business_id: str,
    payload: SubscriptionUpdate,
    current_user: dict = Depends(verify_super_admin),
    db: Session = Depends(get_db),
):
    existing = db.execute(
        text("SELECT business_id FROM businesses WHERE business_id = :bid LIMIT 1"),
        {"bid": business_id},
    ).fetchone()

    if not existing:
        return error_response("Business not found", 404)

    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        return error_response("No fields to update", 400)

    set_clause = ", ".join(f"{k} = :{k}" for k in update_data)
    update_data["bid"] = business_id

    try:
        db.execute(
            text(f"UPDATE businesses SET {set_clause} WHERE business_id = :bid"),
            update_data,
        )
        db.commit()
    except Exception as e:
        db.rollback()
        logging.exception(e)
        return error_response("Failed to update subscription", 500)

    return success_response({"message": "Subscription updated successfully"})


# ─── GET /v1/admin/businesses — List all businesses (Super Admin) ───────────

@admin_router.get("/businesses")
def list_all_businesses(
    current_user: dict = Depends(verify_super_admin),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        text("""
            SELECT
                business_id, business_name, business_email,
                payment_status, subscription_type,
                subscription_start_at, subscription_end_at,
                trial_start_at, trial_end_at, is_active,
                created_at
            FROM businesses
            WHERE (is_deleted = false OR is_deleted IS NULL)
            ORDER BY created_at DESC
        """),
    ).fetchall()

    businesses = []
    for row in rows:
        businesses.append({
            "business_id": str(row.business_id),
            "business_name": row.business_name,
            "business_email": row.business_email,
            "payment_status": row.payment_status,
            "subscription_type": row.subscription_type,
            "subscription_start_at": row.subscription_start_at.isoformat() if row.subscription_start_at else None,
            "subscription_end_at": row.subscription_end_at.isoformat() if row.subscription_end_at else None,
            "trial_start_at": row.trial_start_at.isoformat() if row.trial_start_at else None,
            "trial_end_at": row.trial_end_at.isoformat() if row.trial_end_at else None,
            "is_active": row.is_active,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        })

    return success_response(businesses)


# ── Exported router list ─────────────────────────────────────────────────────
routers = [reg_router, sub_router, admin_router]
