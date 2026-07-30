# app/routers/billing.py
#
# ── ASYNC MIGRATION NOTE (2026-07) ──────────────────────────────────────────
#
# This router was migrated from sync SQLAlchemy (psycopg2) to async
# (asyncpg).  Key patterns:
#
#   - Session → AsyncSession (get_async_db dependency)
#   - db.execute(...) → await db.execute(...)
#   - db.commit() → await db.commit()
#   - require_permission_with_rls → require_permission (auth middleware
#     sets GUCs via set_config in verify_token)
#   - verify_token_with_rls → verify_token (same reason)
#   - activation.py functions are now async

import os
import json
import logging

from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.database import get_async_db
from app.middleware.rbac import require_permission
from app.middleware.auth import verify_token
from app.utils.response import success_response, error_response
from app.schemas.billing import (
    CheckoutRequest,
    CheckoutResponse,
    PlanOut,
    ChangePlanRequest,
)
from app.services.billing import razorpay_client, stripe_client
from app.services.billing import activation
from app.middleware.subscription import clear_subscription_business_cache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/billing", tags=["Billing"])

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")


# ── Plans ────────────────────────────────────────────────────────────────────

@router.get("/plans")
async def list_plans(db: AsyncSession = Depends(get_async_db)):
    result = await db.execute(
        text("SELECT * FROM plans WHERE is_active = true ORDER BY sort_order")
    )
    rows = result.fetchall()
    plans = [dict(r._mapping) for r in rows]
    for p in plans:
        if p.get("feature_limits") and isinstance(p["feature_limits"], str):
            p["feature_limits"] = json.loads(p["feature_limits"])
        if p.get("price_inr") is not None:
            p["price_inr"] = float(p["price_inr"])
        if p.get("price_usd") is not None:
            p["price_usd"] = float(p["price_usd"])
    return success_response(plans)


# ── Checkout ─────────────────────────────────────────────────────────────────

async def _record_pending_payment(db, bid, plan_id, provider, order_id, amount, currency):
    result = await db.execute(
        text("""
            INSERT INTO subscription_payments (business_id, plan_id, provider, provider_order_id, amount, currency, status)
            VALUES (:bid, :plan_id, :provider, :order_id, :amount, :currency, 'created')
            RETURNING payment_id
        """),
        {"bid": bid, "plan_id": plan_id, "provider": provider, "order_id": order_id,
         "amount": amount, "currency": currency},
    )
    row = result.fetchone()
    await db.commit()
    return str(row.payment_id)


async def _find_existing_checkout(db, bid, plan_id):
    """Return an existing 'created' checkout for this business+plan within the last 10 minutes, or None."""
    result = await db.execute(
        text("""
            SELECT payment_id, provider, provider_order_id, amount, currency
            FROM subscription_payments
            WHERE business_id = CAST(:bid AS uuid)
              AND plan_id = :plan_id
              AND status = 'created'
              AND created_at > NOW() - INTERVAL '10 minutes'
            ORDER BY created_at DESC
            LIMIT 1
        """),
        {"bid": bid, "plan_id": plan_id},
    )
    row = result.fetchone()
    if not row:
        return None
    return {
        "payment_id": str(row.payment_id),
        "provider": row.provider,
        "provider_order_id": row.provider_order_id,
        "amount": float(row.amount),
        "currency": row.currency,
    }


@router.post("/checkout")
async def create_checkout(
    payload: CheckoutRequest,
    current_user: dict = Depends(verify_token),
    db: AsyncSession = Depends(get_async_db),
):
    # NOTE: Uses verify_token directly (not require_permission) because
    # expired/trial businesses must be able to reach checkout to pay.
    # The subscription middleware/dependency would block them otherwise.
    bid = current_user["business_id"]

    result = await db.execute(
        text("SELECT * FROM plans WHERE plan_code = :code AND is_active = true"),
        {"code": payload.plan_code},
    )
    plan = result.fetchone()
    if not plan:
        return error_response("Plan not found", 404)

    if payload.billing_cycle and plan.billing_cycle != payload.billing_cycle:
        return error_response("Billing cycle mismatch for this plan", 400)

    result = await db.execute(
        text("SELECT business_country_code, business_email FROM businesses WHERE business_id = CAST(:bid AS uuid)"),
        {"bid": bid},
    )
    business = result.fetchone()
    if not business:
        return error_response("Business not found", 404)

    is_india = (business.business_country_code or "").upper() == "IN"

    existing = await _find_existing_checkout(db, bid, str(plan.plan_id))
    if existing:
        if existing["provider"] == "razorpay":
            return success_response({
                "provider": "razorpay",
                "razorpay_order_id": existing["provider_order_id"],
                "razorpay_key_id": os.getenv("RAZORPAY_KEY_ID"),
                "amount": int(existing["amount"] * 100),
                "currency": existing["currency"],
                "payment_id": existing["payment_id"],
            })
        else:
            try:
                import stripe as _stripe
                _stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
                session_obj = _stripe.checkout.Session.retrieve(existing["provider_order_id"])
                return success_response({
                    "provider": "stripe",
                    "checkout_url": session_obj.url,
                    "payment_id": existing["payment_id"],
                })
            except Exception:
                logger.warning("Failed to retrieve existing Stripe session %s, creating new one", existing["provider_order_id"])

    if is_india:
        if not plan.price_inr or float(plan.price_inr) <= 0:
            return error_response("This plan is not available for INR", 400)

        order = razorpay_client.create_order(
            amount_paise=int(float(plan.price_inr) * 100),
            currency="INR",
            receipt=f"biz_{bid[:8]}_{plan.plan_code}"[:40],
            notes={"business_id": bid, "plan_code": plan.plan_code},
        )

        payment_id = await _record_pending_payment(
            db, bid, str(plan.plan_id), "razorpay", order["id"],
            float(plan.price_inr), "INR",
        )

        return success_response({
            "provider": "razorpay",
            "razorpay_order_id": order["id"],
            "razorpay_key_id": os.getenv("RAZORPAY_KEY_ID"),
            "amount": order["amount"],
            "currency": "INR",
            "payment_id": payment_id,
        })
    else:
        if not plan.price_usd or float(plan.price_usd) <= 0:
            return error_response("This plan is not available for USD", 400)

        session = stripe_client.create_checkout_session(
            price_id=plan.stripe_price_id,
            amount_usd=float(plan.price_usd),
            plan_name=plan.display_name,
            success_url=f"{FRONTEND_URL}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{FRONTEND_URL}/pricing?cancelled=1",
            client_reference_id=bid,
            customer_email=business.business_email,
        )

        payment_id = await _record_pending_payment(
            db, bid, str(plan.plan_id), "stripe", session["id"],
            float(plan.price_usd), "USD",
        )

        return success_response({
            "provider": "stripe",
            "checkout_url": session["url"],
            "payment_id": payment_id,
        })


# ── Status polling ───────────────────────────────────────────────────────────

@router.get("/checkout/{payment_id}/status")
async def checkout_status(
    payment_id: str,
    current_user: dict = Depends(verify_token),
    db: AsyncSession = Depends(get_async_db),
):
    # NOTE: Uses verify_token directly — expired businesses must be able to
    # poll checkout status while completing payment.
    result = await db.execute(
        text("""
            SELECT payment_id, status, provider, provider_order_id
            FROM subscription_payments
            WHERE (payment_id::text = :pid OR provider_order_id = :pid)
              AND business_id = CAST(:bid AS uuid)
        """),
        {"pid": payment_id, "bid": current_user["business_id"]},
    )
    row = result.fetchone()

    if not row:
        return error_response("Payment not found", 404)

    return success_response({
        "payment_id": str(row.payment_id),
        "status": row.status,
    })


# ── Webhooks (no JWT auth — security via signature verification) ─────────────

@router.post("/webhooks/razorpay")
async def razorpay_webhook(request: Request, db: AsyncSession = Depends(get_async_db)):
    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    secret = os.getenv("RAZORPAY_WEBHOOK_SECRET", "")

    if not razorpay_client.verify_webhook_signature(body.decode(), signature, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    payload = json.loads(body)
    event_id = request.headers.get("X-Razorpay-Event-Id", payload.get("event_id", ""))
    event_type = payload.get("event", "")

    # Idempotency check
    result = await db.execute(
        text("""
            INSERT INTO subscription_events (provider, provider_event_id, event_type, payload)
            VALUES ('razorpay', :eid, :etype, CAST(:payload AS jsonb))
            ON CONFLICT (provider, provider_event_id) DO NOTHING
            RETURNING event_id
        """),
        {"eid": event_id, "etype": event_type, "payload": json.dumps(payload)},
    )
    inserted = result.fetchone()
    await db.commit()

    if inserted is None:
        return success_response({"status": "already_processed"})

    if event_type == "payment.captured":
        payment_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
        await activation.activate_subscription(db, payment_entity, provider="razorpay")
        # NOTE: activate_subscription already calls clear_subscription_business_cache
        # internally after db.commit(). This is belt-and-suspenders — the call here
        # ensures cache invalidation even if activation.py changes in the future.
        biz_id = (payment_entity.get("notes") or {}).get("business_id")
        if biz_id:
            clear_subscription_business_cache(biz_id)
    elif event_type == "payment.failed":
        payment_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
        await activation.handle_payment_failure(db, payment_entity, provider="razorpay")

    return success_response({"status": "ok"})


@router.post("/webhooks/stripe")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_async_db)):
    body = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")

    try:
        event = stripe_client.construct_event(body, sig_header, webhook_secret)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid signature")

    event_id = event.get("id", "")
    event_type = event.get("type", "")

    # Idempotency check
    result = await db.execute(
        text("""
            INSERT INTO subscription_events (provider, provider_event_id, event_type, payload)
            VALUES ('stripe', :eid, :etype, CAST(:payload AS jsonb))
            ON CONFLICT (provider, provider_event_id) DO NOTHING
            RETURNING event_id
        """),
        {"eid": event_id, "etype": event_type, "payload": json.dumps(event)},
    )
    inserted = result.fetchone()
    await db.commit()

    if inserted is None:
        return success_response({"status": "already_processed"})

    data_object = event.get("data", {}).get("object", {})

    if event_type == "checkout.session.completed":
        await activation.activate_subscription(db, data_object, provider="stripe")
        # NOTE: activate_subscription already calls clear_subscription_business_cache
        # internally after db.commit(). This is belt-and-suspenders — the call here
        # ensures cache invalidation even if activation.py changes in the future.
        biz_id = data_object.get("client_reference_id")
        if biz_id:
            clear_subscription_business_cache(biz_id)
    elif event_type == "invoice.payment_failed":
        await activation.handle_payment_failure(db, data_object, provider="stripe")

    return success_response({"status": "ok"})


# ── Cancel subscription ──────────────────────────────────────────────────────

@router.post("/cancel")
async def cancel_subscription(
    current_user: dict = Depends(require_permission("settings.manage")),
    db: AsyncSession = Depends(get_async_db),
):
    bid = current_user["business_id"]
    await db.execute(
        text("UPDATE businesses SET auto_renew = false WHERE business_id = :bid"),
        {"bid": bid},
    )
    await db.commit()
    return success_response({"message": "Auto-renewal disabled. Access continues until your current period ends."})
