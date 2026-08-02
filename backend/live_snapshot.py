import asyncio
import os

import asyncpg

DOTENV = os.path.join(os.path.dirname(__file__), ".env")


def load_dotenv(path):
    values = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            values[k.strip()] = v.strip().strip('"').strip("'")
    return values


async def main():
    env = load_dotenv(DOTENV)
    url = env.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL not found in .env")
    conn = await asyncpg.connect(url, statement_cache_size=0)
    try:
        subs = await conn.fetch(
            """
            SELECT payment_id, business_id, provider, provider_order_id, razorpay_subscription_id,
                   subscription_status, provider_payment_id, amount, currency, status,
                   created_at, paid_at, updated_by_webhook_at
            FROM subscription_payments
            WHERE business_id = CAST($1 AS uuid)
            ORDER BY created_at
            """,
            "c5ee9434-dca8-414a-9532-3d04b2f768b6",
        )
        biz = await conn.fetchrow(
            """
            SELECT business_id, business_name, payment_status, subscription_type,
                   subscription_end_at, grace_period_end_at, auto_renew,
                   trial_start_at, trial_end_at, current_plan_id
            FROM businesses
            WHERE business_id = 'c5ee9434-dca8-414a-9532-3d04b2f768b6'
            """
        )
        print("=== BUSINESS ===")
        if biz:
            print(dict(biz))
        print("=== SUBSCRIPTION_PAYMENTS ===")
        for r in subs:
            print(dict(r))
    finally:
        await conn.close()


asyncio.run(main())
