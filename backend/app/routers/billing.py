import os
import json
import logging

from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db
from app.middleware.auth import verify_token
from app.middleware.rbac import require_permission
from app.utils.response import success_response, error_response
from app.schemas.billing import (
    CheckoutRequest,
    CheckoutResponse,
    PlanOut,
    ChangePlanRequest,
)
from app.services.billing import razorpay_client, stripe_client, activation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/billing", tags=["Billing"])

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")


# ── Plans ────────────────────────────────────────────────────────────────────

@router.get("/plans")
def list_plans(db: Session = Depends(get_db)):
    rows = db.execute(
        text("SELECT * FROM plans WHERE is_active = true ORDER BY sort_order")
    ).fetchall()
    plans = [dict(r._mapping) for r in rows]
    for p in plans:
        if p.get("feature_limits") and isinstance(p["feature_limits"], str):
            p["feature_limits"] = json.loads(p["feature_limits"])
    return success_response(plans)


# ── Checkout ─────────────────────────────────────────────────────────────────

def _record_pending_payment(db, bid, plan_id, provider, order_id, amount, currency):
    result = db.execute(
        text("""
            INSERT INTO subscription_payments (business_id, plan_id, provider, provider_order_id, amount, currency, status)
            VALUES (:bid, :plan_id, :provider, :order_id, :amount, :currency, 'created')
            RETURNING payment_id
        """),
        {"bid": bid, "plan_id": plan_id, "provider": provider, "order_id": order_id,
         "amount": amount, "currency": currency},
    ).fetchone()
    db.commit()
    return str(result.payment_id)


@router.post("/checkout")
def create_checkout(
    payload: CheckoutRequest,
    current_user: dict = Depends(require_permission("settings.manage")),
    db: Session = Depends(get_db),
):
    bid = current_user["business_id"]

    plan = db.execute(
        text("SELECT * FROM plans WHERE plan_code = :code AND is_active = true"),
        {"code": payload.plan_code},
    ).fetchone()
    if not plan:
        return error_response("Plan not found", 404)

    business = db.execute(
        text("SELECT business_country_code, business_email FROM businesses WHERE business_id = CAST(:bid AS uuid)"),
        {"bid": bid},
    ).fetchone()
    if not business:
        return error_response("Business not found", 404)

    is_india = (business.business_country_code or "").upper() == "IN"

    if is_india:
        if not plan.price_inr or float(plan.price_inr) <= 0:
            return error_response("This plan is not available for INR", 400)

        order = razorpay_client.create_order(
            amount_paise=int(float(plan.price_inr) * 100),
            currency="INR",
            receipt=f"biz_{bid}_{plan.plan_code}",
            notes={"business_id": bid, "plan_code": plan.plan_code},
        )

        payment_id = _record_pending_payment(
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
            success_url=f"{FRONTEND_URL}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{FRONTEND_URL}/billing?cancelled=1",
            client_reference_id=bid,
            customer_email=business.business_email,
        )

        payment_id = _record_pending_payment(
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
def checkout_status(
    payment_id: str,
    current_user: dict = Depends(require_permission("settings.manage")),
    db: Session = Depends(get_db),
):
    row = db.execute(
        text("""
            SELECT payment_id, status, provider, provider_order_id
            FROM subscription_payments
            WHERE payment_id = :pid AND business_id = CAST(:bid AS uuid)
        """),
        {"pid": payment_id, "bid": current_user["business_id"]},
    ).fetchone()

    if not row:
        return error_response("Payment not found", 404)

    return success_response({
        "payment_id": str(row.payment_id),
        "status": row.status,
    })


# ── Webhooks (no JWT auth — security via signature verification) ─────────────

@router.post("/webhooks/razorpay")
async def razorpay_webhook(request: Request, db: Session = Depends(get_db)):
    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    secret = os.getenv("RAZORPAY_WEBHOOK_SECRET", "")

    if not razorpay_client.verify_webhook_signature(body.decode(), signature, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    payload = json.loads(body)
    event_id = request.headers.get("X-Razorpay-Event-Id", payload.get("event_id", ""))
    event_type = payload.get("event", "")

    # Idempotency check
    inserted = db.execute(
        text("""
            INSERT INTO subscription_events (provider, provider_event_id, event_type, payload)
            VALUES ('razorpay', :eid, :etype, CAST(:payload AS jsonb))
            ON CONFLICT (provider, provider_event_id) DO NOTHING
            RETURNING event_id
        """),
        {"eid": event_id, "etype": event_type, "payload": json.dumps(payload)},
    ).fetchone()
    db.commit()

    if inserted is None:
        return success_response({"status": "already_processed"})

    if event_type == "payment.captured":
        payment_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
        activation.activate_subscription(db, payment_entity, provider="razorpay")
    elif event_type == "payment.failed":
        payment_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
        activation.handle_payment_failure(db, payment_entity, provider="razorpay")

    return success_response({"status": "ok"})


@router.post("/webhooks/stripe")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
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
    inserted = db.execute(
        text("""
            INSERT INTO subscription_events (provider, provider_event_id, event_type, payload)
            VALUES ('stripe', :eid, :etype, CAST(:payload AS jsonb))
            ON CONFLICT (provider, provider_event_id) DO NOTHING
            RETURNING event_id
        """),
        {"eid": event_id, "etype": event_type, "payload": json.dumps(event)},
    ).fetchone()
    db.commit()

    if inserted is None:
        return success_response({"status": "already_processed"})

    data_object = event.get("data", {}).get("object", {})

    if event_type == "checkout.session.completed":
        activation.activate_subscription(db, data_object, provider="stripe")
    elif event_type == "invoice.payment_failed":
        activation.handle_payment_failure(db, data_object, provider="stripe")

    return success_response({"status": "ok"})


# ── Cancel subscription ──────────────────────────────────────────────────────

@router.post("/cancel")
def cancel_subscription(
    current_user: dict = Depends(require_permission("settings.manage")),
    db: Session = Depends(get_db),
):
    bid = current_user["business_id"]
    db.execute(
        text("UPDATE businesses SET auto_renew = false WHERE business_id = :bid"),
        {"bid": bid},
    )
    db.commit()
    return success_response({"message": "Auto-renewal disabled. Access continues until your current period ends."})
