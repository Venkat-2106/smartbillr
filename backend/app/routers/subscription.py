from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from datetime import datetime, timezone, timedelta
import asyncio
import httpx
import uuid
import os
import logging

from app.database import get_async_db
from app.middleware.auth import verify_token, verify_super_admin
from app.utils.response import success_response, error_response
from app.services.email_service import send_business_registered_email
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
        return val.replace(tzinfo=None)
    if isinstance(val, str):
        for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S"):
            try:
                return datetime.strptime(val, fmt)
            except ValueError:
                continue
    return val


def _get_supabase_admin_headers():
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }


async def _create_supabase_auth_user(email: str, password: str, full_name: str) -> dict:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise ValueError("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env")
    async with httpx.AsyncClient() as client:
        response = await client.post(
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


async def _delete_supabase_auth_user(auth_user_id: str, email: str | None = None):
    for attempt in range(2):
        try:
            async with httpx.AsyncClient() as client:
                await client.delete(
                    f"{SUPABASE_URL}/auth/v1/admin/users/{auth_user_id}",
                    headers=_get_supabase_admin_headers(),
                    timeout=10,
                )
            return
        except Exception as e:
            if attempt == 0:
                await asyncio.sleep(1)
                continue
            logging.critical(
                "ORPHANED SUPABASE AUTH USER — manual cleanup required. "
                "auth_user_id=%s email=%s error=%s",
                auth_user_id, email, e
            )


# ─── POST /v1/business — Self-service tenant registration ──────────────────────

@reg_router.post("/business", status_code=201)
async def register_business(
    payload: BusinessCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_async_db),
):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    business_id = str(uuid.uuid4())
    trial_end = now + timedelta(days=30)

    existing = (await db.execute(
        text("SELECT id FROM profiles WHERE LOWER(email) = LOWER(:email) LIMIT 1"),
        {"email": payload.owner_email},
    )).fetchone()
    if existing:
        return error_response("This email is already registered", 400)

    if payload.business_name:
        existing_name = (await db.execute(
            text("SELECT business_id FROM businesses WHERE LOWER(business_name) = LOWER(:name) AND (is_deleted = false OR is_deleted IS NULL) LIMIT 1"),
            {"name": payload.business_name},
        )).fetchone()
        if existing_name:
            return error_response("A business with this name already exists", 400)

    if payload.gstin:
        existing_gst = (await db.execute(
            text("SELECT business_id FROM businesses WHERE gstin = :gstin AND (is_deleted = false OR is_deleted IS NULL) LIMIT 1"),
            {"gstin": payload.gstin},
        )).fetchone()
        if existing_gst:
            return error_response("This GSTIN is already registered", 400)

    try:
        auth_user = await _create_supabase_auth_user(
            payload.owner_email, payload.owner_password, payload.owner_name
        )
        auth_user_id = auth_user["id"]
    except Exception as e:
        logging.exception(e)
        return error_response("Registration failed. Please try again.", 400)

    try:
        # Set session GUCs so RLS policies allow the INSERTs below.
        # The registering user is not yet authenticated via verify_token(),
        # so we set the GUCs directly from the freshly created auth user.
        await db.execute(text("SELECT set_config('app.current_user_id', :uid, true)"), {"uid": auth_user_id})
        await db.execute(text("SELECT set_config('app.current_business_id', :bid, true)"), {"bid": business_id})

        await db.execute(
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
        await db.execute(
            text("""
                INSERT INTO business_counters (business_id, invoice_counter)
                VALUES (:bid, 0)
            """),
            {"bid": business_id},
        )

        role_row = (await db.execute(
            text("SELECT id FROM roles WHERE name = 'admin' LIMIT 1")
        )).fetchone()
        if not role_row:
            raise ValueError("Admin role not found in roles table")

        await db.execute(
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

        await db.commit()

        background_tasks.add_task(
            send_business_registered_email,
            payload.owner_email,
            payload.business_name,
            payload.owner_name,
        )

    except IntegrityError as e:
        await db.rollback()
        await _delete_supabase_auth_user(auth_user_id, payload.owner_email)
        err_str = str(e.orig).lower()
        if "idx_businesses_name_unique" in err_str:
            return error_response("A business with this name already exists.", 409)
        return error_response("Registration failed. Please try again.", 500)

    except Exception as e:
        await db.rollback()
        await _delete_supabase_auth_user(auth_user_id, payload.owner_email)
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
async def get_my_subscription(
    current_user: dict = Depends(verify_token),
    db: AsyncSession = Depends(get_async_db),
):
    bid = current_user["business_id"]
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    row = (await db.execute(
        text("""
            SELECT
                payment_status, subscription_type,
                subscription_start_at, subscription_end_at,
                trial_start_at, trial_end_at, is_active, last_renewed_at
            FROM businesses
            WHERE business_id = :bid
              AND (is_deleted = false OR is_deleted IS NULL)
            LIMIT 1
        """),
        {"bid": bid},
    )).fetchone()

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
            last_renewed_at=_parse_dt(row.last_renewed_at),
        ).model_dump()
    )


# ─── PATCH /v1/admin/businesses/{business_id}/subscription — Super Admin ─────

@admin_router.patch("/businesses/{business_id}/subscription")
async def update_subscription(
    business_id: str,
    payload: SubscriptionUpdate,
    current_user: dict = Depends(verify_super_admin),
    db: AsyncSession = Depends(get_async_db),
):
    ALLOWED_COLUMNS = {"payment_status", "subscription_type", "subscription_start_at",
                       "subscription_end_at", "is_active"}

    existing = (await db.execute(
        text("SELECT business_id FROM businesses WHERE business_id = :bid AND (is_deleted = false OR is_deleted IS NULL) LIMIT 1"),
        {"bid": business_id},
    )).fetchone()

    if not existing:
        return error_response("Business not found", 404)

    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        return error_response("No fields to update", 400)

    invalid = set(update_data.keys()) - ALLOWED_COLUMNS
    if invalid:
        return error_response(f"Invalid fields: {invalid}", 400)

    set_clause = ", ".join(f"{k} = :{k}" for k in update_data)
    update_data["bid"] = business_id

    try:
        await db.execute(
            text(f"UPDATE businesses SET {set_clause} WHERE business_id = :bid AND (is_deleted = false OR is_deleted IS NULL)"),
            update_data,
        )
        await db.commit()
    except Exception as e:
        await db.rollback()
        logging.exception(e)
        return error_response("Failed to update subscription", 500)

    return success_response({"message": "Subscription updated successfully"})


# ─── GET /v1/admin/businesses — List all businesses (Super Admin) ───────────

@admin_router.get("/businesses")
async def list_all_businesses(
    current_user: dict = Depends(verify_super_admin),
    db: AsyncSession = Depends(get_async_db),
):
    rows = (await db.execute(
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
    )).fetchall()

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
