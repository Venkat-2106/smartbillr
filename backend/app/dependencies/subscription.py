import logging

from fastapi import Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_db
from app.middleware.subscription import _check_subscription_for_user_async


async def verify_subscription(
    request: Request,
    db: AsyncSession = Depends(get_async_db),
) -> None:
    """
    FastAPI dependency that validates tenant subscription status.

    Designed to run AFTER verify_token (which sets
    request.state.verified_jwt_payload and app GUCs).  Uses the same db
    session so no extra connection is opened.

    Behaviour:
      • If no Bearer token is present → no-op (public endpoint).
      • If JWT is valid but subscription is invalid → raises 402.
      • On success → sets request.state.subscription_type for downstream
        consumers (e.g. verify_token's user_data cache).
    """
    # ── No auth header → skip (public endpoint) ──────────────────────────
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return

    # ── Extract user_id ──────────────────────────────────────────────────
    # Prefer the pre-decoded payload set by SubscriptionMiddleware or
    # a previous verify_subscription call on the same request.
    payload = getattr(request.state, "verified_jwt_payload", None)
    if payload is None:
        # Fallback: decode the token ourselves and cache the result so
        # verify_token (which runs after us) can reuse it — eliminates
        # a redundant JWT decode per request.
        token = auth_header.removeprefix("Bearer ")
        try:
            from app.middleware.auth import decode_token_payload
            payload = decode_token_payload(token)
            request.state.verified_jwt_payload = payload
        except HTTPException:
            raise
        # FIXED fail closed — raises 402 instead of silent return
        except Exception:
            logging.exception("verify_subscription: failed to decode token")
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "subscription_required",
                    "message": "Unable to verify authentication. Please try again.",
                    "subscription": {
                        "error_code": "SUBSCRIPTION_CHECK_FAILED",
                        "status": "check_failed",
                        "message": "Unable to verify subscription status. Please try again or contact support.",
                    },
                },
            )

    user_id = payload.get("sub")
    if not user_id:
        return

    # ── Check subscription (uses shared db session + GUCs from verify_token) ─
    error, subscription_type = await _check_subscription_for_user_async(user_id, db)

    # Always propagate subscription_type for downstream use (verify_token
    # reads this to populate user_data["subscription_type"]).
    request.state.subscription_type = subscription_type

    if error is not None:
        raise HTTPException(
            status_code=402,
            detail={
                "error": "subscription_required",
                "message": error["message"],
                "subscription": error,
            },
        )
