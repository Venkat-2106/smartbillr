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
import secrets

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
from app.services.billing import razorpay_client
from app.services.billing import activation
from app.middleware.subscription import clear_subscription_business_cache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/billing", tags=["Billing"])

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")


def _make_receipt(bid: str, plan_code: str) -> str:
    """Build a Razorpay order receipt unique across retries.

    FIX (2026-08-03): the old receipt was deterministic
    (biz_<bid8>_<plan_code>), so a second order for the same business+plan
    within Razorpay's uniqueness window collided with the first and the
    order creation failed. Append a short random suffix.
    """
    return f"biz_{bid[:8]}_{plan_code}_{secrets.token_hex(3)}"[:40]


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


async def _record_pending_subscription(db, bid, plan_id, provider, sub_id, amount, currency):
    result = await db.execute(
        text("""
            INSERT INTO subscription_payments (
                business_id, plan_id, provider,
                razorpay_subscription_id, subscription_status,
                amount, currency, status
            )
            VALUES (:bid, :plan_id, :provider, :sub_id, 'created', :amount, :currency, 'created')
            RETURNING payment_id
        """),
        {"bid": bid, "plan_id": plan_id, "provider": provider, "sub_id": sub_id,
         "amount": amount, "currency": currency},
    )
    row = result.fetchone()
    await db.commit()
    return str(row.payment_id)


async def _find_existing_checkout(db, bid, plan_id):
    """Return an existing 'created' checkout for this business+plan within the last 10 minutes, or None."""
    result = await db.execute(
        text("""
            SELECT payment_id, provider, provider_order_id, razorpay_subscription_id,
                   subscription_status, amount, currency
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
        "razorpay_subscription_id": row.razorpay_subscription_id,
        "subscription_status": row.subscription_status,
        "amount": float(row.amount),
        "currency": row.currency,
    }


async def _get_active_razorpay_subscription(db, bid):
    """
    Return the business's current active Razorpay subscription, or None.

    "Active" = the most recent subscription_payments row (by created_at) that
    has a razorpay_subscription_id and is NOT in a terminal cancelled/halted
    state. Shared by /cancel, /checkout and /change-plan.
    """
    result = await db.execute(
        text("""
            SELECT razorpay_subscription_id, plan_id
            FROM subscription_payments
            WHERE business_id = CAST(:bid AS uuid)
              AND razorpay_subscription_id IS NOT NULL
              AND (subscription_status IS NULL OR subscription_status NOT IN ('cancelled', 'halted'))
            ORDER BY created_at DESC
            LIMIT 1
        """),
        {"bid": bid},
    )
    row = result.fetchone()
    if not row:
        return None
    return {
        "razorpay_subscription_id": row.razorpay_subscription_id,
        "plan_id": str(row.plan_id),
    }


async def _cancel_active_subscription_if_different(db, bid, new_plan_id: str):
    """
    Cancel the business's current active Razorpay subscription (immediately) if
    it is for a different plan than the one being purchased. Returns None on
    success (or if there is nothing to cancel), or an error message string if
    the Razorpay cancel call failed.
    """
    active = await _get_active_razorpay_subscription(db, bid)
    if not active or active["plan_id"] == new_plan_id:
        return None
    try:
        razorpay_client.cancel_subscription(
            active["razorpay_subscription_id"], cancel_at_cycle_end=False
        )
    except Exception as e:
        logger.error(
            "Failed to cancel existing Razorpay subscription business=%s sub=%s: %s",
            bid, active["razorpay_subscription_id"], e,
        )
        return "Could not cancel your existing subscription with Razorpay. Please retry or contact support."
    logger.info(
        "Cancelled existing Razorpay subscription business=%s sub=%s (immediate) before new purchase",
        bid, active["razorpay_subscription_id"],
    )
    return None


async def _create_subscription_cancelling_old(db, bid, plan, total_count: int):
    """
    Cancel-old-then-create-new for recurring plans. Shared by create_checkout
    and change_plan so upgrade/downgrade always goes through one code path.

    Returns (subscription_dict, error_message). On failure, error_message is
    set and subscription_dict is None — the caller must NOT proceed to create
    the new subscription (two live subscriptions is worse than a blocked
    upgrade).
    """
    cancel_err = await _cancel_active_subscription_if_different(
        db, bid, str(plan.plan_id)
    )
    if cancel_err:
        return None, cancel_err
    sub = razorpay_client.create_subscription(
        plan_id=plan.razorpay_plan_id,
        total_count=total_count,
        notes={"business_id": bid, "plan_code": plan.plan_code},
    )
    return sub, None


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
    is_recurring = plan.billing_cycle in ("monthly", "yearly")

    existing = await _find_existing_checkout(db, bid, str(plan.plan_id))
    if existing:
        if existing["razorpay_subscription_id"]:
            return success_response({
                "provider": "razorpay",
                "mode": "subscription",
                "razorpay_subscription_id": existing["razorpay_subscription_id"],
                "razorpay_key_id": os.getenv("RAZORPAY_KEY_ID"),
                "payment_id": existing["payment_id"],
            })
        return success_response({
            "provider": "razorpay",
            "razorpay_order_id": existing["provider_order_id"],
            "razorpay_key_id": os.getenv("RAZORPAY_KEY_ID"),
            "amount": int(existing["amount"] * 100),
            "currency": existing["currency"],
            "payment_id": existing["payment_id"],
        })

    if is_recurring:
        # Monthly/yearly plans go through Razorpay's recurring-billing
        # Subscriptions product (one-time mandate authorization, then
        # Razorpay auto-charges each cycle). Lifetime/one_time plans keep
        # using the one-time Order flow below.
        if not plan.razorpay_plan_id:
            return error_response("Plan not configured for recurring billing", 500)
        if not is_india:
            # Only INR Razorpay Plans exist today; USD recurring Plans are on
            # hold. Refuse rather than silently subscribe a non-IN business to
            # the INR plan under a mislabeled currency.
            return error_response(
                "Recurring billing is currently available only for India (INR). Contact support.", 400
            )

        price = plan.price_inr if is_india else plan.price_usd
        currency = "INR" if is_india else "USD"
        if not price or float(price) <= 0:
            return error_response(f"This plan is not available for {currency}", 400)

        # FIX (2026-08-03): prevent double-subscription on upgrade/downgrade.
        # If the business already has an active Razorpay subscription for a
        # DIFFERENT plan, cancel it immediately (the user is actively paying for
        # a new plan right now — they must not be billed for both). If the
        # cancel fails, block the new checkout: two live subscriptions is worse
        # than a blocked upgrade.
        sub, cancel_err = await _create_subscription_cancelling_old(
            db, bid, plan, 1200 if plan.billing_cycle == "monthly" else 100
        )
        if cancel_err:
            return error_response(cancel_err, 502)

        payment_id = await _record_pending_subscription(
            db, bid, str(plan.plan_id), "razorpay", sub["id"],
            float(price), currency,
        )

        return success_response({
            "provider": "razorpay",
            "mode": "subscription",
            "razorpay_subscription_id": sub["id"],
            "razorpay_key_id": os.getenv("RAZORPAY_KEY_ID"),
            "payment_id": payment_id,
        })

    if is_india:
        if not plan.price_inr or float(plan.price_inr) <= 0:
            return error_response("This plan is not available for INR", 400)

        # A lifetime/one-time purchase while a recurring subscription is active
        # would otherwise leave both live (double billing). Cancel any active
        # subscription for a different plan first.
        cancel_err = await _cancel_active_subscription_if_different(
            db, bid, str(plan.plan_id)
        )
        if cancel_err:
            return error_response(cancel_err, 502)

        order = razorpay_client.create_order(
            amount_paise=int(float(plan.price_inr) * 100),
            currency="INR",
            receipt=_make_receipt(bid, plan.plan_code),
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

        cancel_err = await _cancel_active_subscription_if_different(
            db, bid, str(plan.plan_id)
        )
        if cancel_err:
            return error_response(cancel_err, 502)

        order = razorpay_client.create_order(
            amount_paise=int(float(plan.price_usd) * 100),
            currency="USD",
            receipt=_make_receipt(bid, plan.plan_code),
            notes={"business_id": bid, "plan_code": plan.plan_code},
        )

        payment_id = await _record_pending_payment(
            db, bid, str(plan.plan_id), "razorpay", order["id"],
            float(plan.price_usd), "USD",
        )

        return success_response({
            "provider": "razorpay",
            "razorpay_order_id": order["id"],
            "razorpay_key_id": os.getenv("RAZORPAY_KEY_ID"),
            "amount": order["amount"],
            "currency": "USD",
            "payment_id": payment_id,
        })


# ── Change plan (upgrade/downgrade for businesses with an active plan) ──────

@router.post("/change-plan")
async def change_plan(
    payload: ChangePlanRequest,
    current_user: dict = Depends(require_permission("settings.manage")),
    db: AsyncSession = Depends(get_async_db),
):
    bid = current_user["business_id"]

    result = await db.execute(
        text("SELECT * FROM plans WHERE plan_code = :code AND is_active = true"),
        {"code": payload.plan_code},
    )
    plan = result.fetchone()
    if not plan:
        return error_response("Plan not found", 404)

    result = await db.execute(
        text("SELECT business_country_code FROM businesses WHERE business_id = CAST(:bid AS uuid)"),
        {"bid": bid},
    )
    business = result.fetchone()
    if not business:
        return error_response("Business not found", 404)

    is_india = (business.business_country_code or "").upper() == "IN"
    is_recurring = plan.billing_cycle in ("monthly", "yearly")

    # Cancel any active Razorpay subscription for a different plan before
    # creating the new one (same shared helper create_checkout uses). If the
    # cancel fails, block the change — the user must not be billed twice.
    cancel_err = await _cancel_active_subscription_if_different(
        db, bid, str(plan.plan_id)
    )
    if cancel_err:
        return error_response(cancel_err, 502)

    if is_recurring:
        if not plan.razorpay_plan_id:
            return error_response("Plan not configured for recurring billing", 500)
        if not is_india:
            return error_response(
                "Recurring billing is currently available only for India (INR). Contact support.", 400
            )
        if not plan.price_inr or float(plan.price_inr) <= 0:
            return error_response("This plan is not available for INR", 400)

        sub = razorpay_client.create_subscription(
            plan_id=plan.razorpay_plan_id,
            total_count=1200 if plan.billing_cycle == "monthly" else 100,
            notes={"business_id": bid, "plan_code": plan.plan_code},
        )

        payment_id = await _record_pending_subscription(
            db, bid, str(plan.plan_id), "razorpay", sub["id"],
            float(plan.price_inr), "INR",
        )

        return success_response({
            "provider": "razorpay",
            "mode": "subscription",
            "razorpay_subscription_id": sub["id"],
            "razorpay_key_id": os.getenv("RAZORPAY_KEY_ID"),
            "payment_id": payment_id,
        })

    if is_india:
        if not plan.price_inr or float(plan.price_inr) <= 0:
            return error_response("This plan is not available for INR", 400)

        order = razorpay_client.create_order(
            amount_paise=int(float(plan.price_inr) * 100),
            currency="INR",
            receipt=_make_receipt(bid, plan.plan_code),
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

    if not plan.price_usd or float(plan.price_usd) <= 0:
        return error_response("This plan is not available for USD", 400)

    order = razorpay_client.create_order(
        amount_paise=int(float(plan.price_usd) * 100),
        currency="USD",
        receipt=f"biz_{bid[:8]}_{plan.plan_code}"[:40],
        notes={"business_id": bid, "plan_code": plan.plan_code},
    )

    payment_id = await _record_pending_payment(
        db, bid, str(plan.plan_id), "razorpay", order["id"],
        float(plan.price_usd), "USD",
    )

    return success_response({
        "provider": "razorpay",
        "razorpay_order_id": order["id"],
        "razorpay_key_id": os.getenv("RAZORPAY_KEY_ID"),
        "amount": order["amount"],
        "currency": "USD",
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
            SELECT payment_id, status, provider, provider_order_id, razorpay_subscription_id
            FROM subscription_payments
            WHERE (payment_id::text = :pid OR provider_order_id = :pid)
              AND business_id = CAST(:bid AS uuid)
        """),
        {"pid": payment_id, "bid": current_user["business_id"]},
    )
    row = result.fetchone()

    if not row:
        return error_response("Payment not found", 404)

    if row.status != "paid" and row.razorpay_subscription_id is not None:
        # Subscription checkouts: activation (Phase 2) INSERTS a new row per
        # charge, so the original checkout row stays at status='created'
        # forever. Resolve the effective status from any paid row on the same
        # subscription so the frontend polling loop can complete. One-time
        # Order checkouts have a NULL razorpay_subscription_id, so this branch
        # never triggers for them.
        paid = await db.execute(
            text("""
                SELECT status FROM subscription_payments
                WHERE razorpay_subscription_id = :sid AND status = 'paid'
                ORDER BY paid_at DESC NULLS LAST
                LIMIT 1
            """),
            {"sid": row.razorpay_subscription_id},
        )
        if paid.fetchone() is not None:
            return success_response({
                "payment_id": str(row.payment_id),
                "status": "paid",
            })

    return success_response({
        "payment_id": str(row.payment_id),
        "status": row.status,
    })


# ── Webhooks (no JWT auth — security via signature verification) ─────────────


async def _set_webhook_superadmin_guc(db: AsyncSession) -> None:
    """Grant the webhook cross-tenant access by setting the super-admin GUC.

    This route is intentionally unauthenticated (HMAC-only) and legitimately
    operates across ALL tenants, so there is no per-tenant
    app.current_business_id to set. The subscription_payments policies are
    keyed on app.current_business_id() — with it unset every query below would
    silently match zero rows. set_config(..., is_local=true) is
    transaction-scoped, so call this again after every commit().
    """
    await db.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
    logger.info(
        "Razorpay webhook: set app.is_super_admin GUC (super-admin RLS bypass)"
    )


@router.post("/webhooks/razorpay")
async def razorpay_webhook(request: Request, db: AsyncSession = Depends(get_async_db)):
    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    secret = os.getenv("RAZORPAY_WEBHOOK_SECRET", "")

    if not razorpay_client.verify_webhook_signature(body.decode(), signature, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # FIX (2026-08-03): set the super-admin GUC right after signature
    # verification succeeds and before the idempotency insert (see helper).
    await _set_webhook_superadmin_guc(db)

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

    # The commit above discarded the transaction-scoped GUC. Re-set it before
    # dispatching so the activation handlers can read/write across tenants.
    await _set_webhook_superadmin_guc(db)

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
    elif event_type in ("payment.refunded", "refund.processed"):
        # FIX (2026-08-03): a refund reverses the money — immediately suspend
        # the business (product rule confirmed by owner). See handle_refund.
        refund_entity = payload.get("payload", {}).get("refund", {}).get("entity", {})
        await activation.handle_refund(db, refund_entity, provider="razorpay")
    elif event_type == "subscription.charged":
        sub_entity = payload.get("payload", {}).get("subscription", {}).get("entity", {})
        payment_entity = payload.get("payload", {}).get("payment", {}).get("entity")
        await activation.activate_subscription_charge(db, sub_entity, payment_entity, provider="razorpay")
    elif event_type == "subscription.pending":
        # Renewal charge failed, Razorpay is retrying. Don't do nothing until
        # the terminal halted event arrives days later — record the pending
        # state (surfaces as the "payment issue" banner via
        # /businesses/me/subscription -> payment_action_required) and log it.
        sub_entity = payload.get("payload", {}).get("subscription", {}).get("entity", {})
        await activation.handle_subscription_status_event(db, sub_entity, "pending")
        logger.warning(
            "Subscription retry in progress (subscription.pending): sub=%s",
            sub_entity.get("id"),
        )
    elif event_type in ("subscription.cancelled", "subscription.halted", "subscription.paused", "subscription.resumed"):
        # paused/resumed: log-only is fine today — the product does not use
        # pause; just keep the label in sync instead of swallowing the event.
        sub_entity = payload.get("payload", {}).get("subscription", {}).get("entity", {})
        new_status = sub_entity.get("status", event_type.split(".")[1])
        await activation.handle_subscription_status_event(db, sub_entity, new_status)
    else:
        # FIX (2026-08-03): never let unknown events fall through silently.
        logger.warning("Unhandled Razorpay webhook event_type=%s (event_id=%s)", event_type, event_id)

    return success_response({"status": "ok"})


# ── Cancel subscription ──────────────────────────────────────────────────────

@router.post("/cancel")
async def cancel_subscription(
    current_user: dict = Depends(require_permission("settings.manage")),
    db: AsyncSession = Depends(get_async_db),
):
    bid = current_user["business_id"]

    # FIX (2026-08-03): the previous code only flipped auto_renew locally, so a
    # user told "access continues until your current period ends" was still
    # billed by Razorpay. Cancel the live subscription on Razorpay first
    # (cancel_at_cycle_end=1 matches the UX promise that access continues until
    # the current period ends). Only touch the local DB once that succeeds.
    active = await _get_active_razorpay_subscription(db, bid)
    if active:
        try:
            razorpay_client.cancel_subscription(
                active["razorpay_subscription_id"], cancel_at_cycle_end=True
            )
        except Exception as e:
            logger.error(
                "Razorpay cancel failed for business=%s sub=%s: %s",
                bid, active["razorpay_subscription_id"], e,
            )
            # Do NOT silently update only the local DB — the user must not be
            # told "cancelled" while Razorpay still thinks the subscription is
            # active.
            return error_response(
                "Could not cancel the subscription with Razorpay. Please try again or contact support.", 502
            )
        logger.info(
            "Razorpay subscription cancelled (at cycle end) business=%s sub=%s",
            bid, active["razorpay_subscription_id"],
        )

    await db.execute(
        text("UPDATE businesses SET auto_renew = false WHERE business_id = :bid"),
        {"bid": bid},
    )
    await db.commit()
    clear_subscription_business_cache(bid)
    return success_response({"message": "Auto-renewal disabled. Access continues until your current period ends."})
