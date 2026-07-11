import os
import logging

logger = logging.getLogger(__name__)


def _get_secret_key() -> str:
    key = os.getenv("STRIPE_SECRET_KEY")
    if not key:
        raise RuntimeError("STRIPE_SECRET_KEY not set")
    return key


def create_checkout_session(
    price_id: str,
    success_url: str,
    cancel_url: str,
    client_reference_id: str,
    customer_email: str,
) -> dict:
    try:
        import stripe
    except ImportError:
        raise RuntimeError("stripe package not installed")

    stripe.api_key = _get_secret_key()
    session = stripe.checkout.Session.create(
        mode="payment",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=success_url,
        cancel_url=cancel_url,
        client_reference_id=client_reference_id,
        customer_email=customer_email,
    )
    return {"id": session.id, "url": session.url}


def construct_event(body: bytes, sig_header: str, webhook_secret: str):
    try:
        import stripe
    except ImportError:
        raise RuntimeError("stripe package not installed")

    return stripe.Webhook.construct_event(body, sig_header, webhook_secret)
