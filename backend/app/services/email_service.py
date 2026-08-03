"""
Fire-and-forget email notifications via Resend.

Design principles:
  - Env vars (RESEND_API_KEY, EMAIL_FROM) are read via os.getenv() at CALL
    time, not module import time. This avoids import-order / missing-env
    issues at startup (same reasoning as the SUPABASE_SERVICE_KEY usage in
    subscription.py).
  - send_business_registered_email() never raises: any failure is logged
    and swallowed so an email problem can never surface as an error to the
    caller (mirrors the retry-then-log philosophy of
    _delete_supabase_auth_user in subscription.py).
"""

import html
import logging
import os

import httpx

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"
EMAIL_TIMEOUT = 10


async def send_business_registered_email(to_email: str, business_name: str, owner_name: str) -> None:
    api_key = os.getenv("RESEND_API_KEY")
    from_email = os.getenv("EMAIL_FROM")

    if not api_key or not from_email:
        logger.error(
            "RESEND_API_KEY or EMAIL_FROM missing — skipping registration email to %s",
            to_email,
        )
        return

    safe_business_name = html.escape(business_name)
    safe_owner_name = html.escape(owner_name)

    html_body = f"""<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="background-color:#0f172a;border-radius:12px 12px 0 0;padding:20px 24px;">
      <span style="font-size:14px;font-weight:800;color:#ffffff;">SmartBillr</span>
    </div>
    <div style="background-color:#ffffff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:28px 24px;">
      <h1 style="margin:0 0 16px;font-size:20px;color:#0f172a;">Business registered</h1>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#475569;">Hi {safe_owner_name},</p>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#475569;">
        Your business <strong>{safe_business_name}</strong> has been registered on SmartBillr.
      </p>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">
        You can now log in and start using SmartBillr to manage your business.
      </p>
    </div>
  </div>
</body>
</html>"""

    payload = {
        "from": from_email,
        "to": [to_email],
        "subject": f"Your business {safe_business_name} has been registered on SmartBillr",
        "html": html_body,
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                RESEND_API_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                json=payload,
                timeout=EMAIL_TIMEOUT,
            )
        if response.status_code >= 300:
            logger.error(
                "Resend API returned %s for registration email to %s: %s",
                response.status_code,
                to_email,
                response.text[:500],
            )
    except Exception:
        logger.exception("Failed to send business registration email to %s", to_email)
