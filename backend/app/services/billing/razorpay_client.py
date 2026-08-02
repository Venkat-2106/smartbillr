import os
import logging

logger = logging.getLogger(__name__)

_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    try:
        import razorpay
        key_id = os.getenv("RAZORPAY_KEY_ID")
        key_secret = os.getenv("RAZORPAY_KEY_SECRET")
        if not key_id or not key_secret:
            logger.warning("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set")
            return None
        _client = razorpay.Client(auth=(key_id, key_secret))
        return _client
    except ImportError:
        logger.warning("razorpay package not installed")
        return None


def create_order(amount_paise: int, currency: str, receipt: str, notes: dict) -> dict:
    client = _get_client()
    if not client:
        raise RuntimeError("Razorpay client not configured")
    return client.order.create({
        "amount": amount_paise,
        "currency": currency,
        "receipt": receipt,
        "notes": notes,
    })


def create_subscription(plan_id: str, total_count: int, notes: dict) -> dict:
    client = _get_client()
    if not client:
        raise RuntimeError("Razorpay client not configured")
    return client.subscription.create({
        "plan_id": plan_id,
        "total_count": total_count,
        "customer_notify": 1,
        "notes": notes,
    })


def verify_webhook_signature(body: str, signature: str, secret: str) -> bool:
    client = _get_client()
    if not client:
        raise RuntimeError("Razorpay client not configured")
    try:
        client.utility.verify_webhook_signature(body, signature, secret)
        return True
    except Exception:
        return False
