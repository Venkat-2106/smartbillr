# SmartBillr — Payment Implementation Plan

Reviewed against your actual codebase (`development` branch) on 2026-07-11. This
builds on what already exists rather than replacing it — see "What's already
there" at the end of each section before the "What to add" part.

---

## 1. Payment Architecture

### Existing pieces you already have
- `SubscriptionMiddleware` (`middleware/subscription.py`) — enforces access on
  every request based on `businesses.payment_status`/`is_active`. **This stays
  exactly as-is.** Payment collection only needs to change *how*
  `payment_status` gets set — not how it's enforced.
- `GET /v1/businesses/me/subscription` — already returns current plan status
  to the frontend. Reused as-is.
- `PATCH /v1/admin/businesses/{id}/subscription` — manual super-admin override.
  **Keep this** for support/refunds/manual corrections. It becomes the
  "escape hatch," not the primary path.

### The flow

```
Pricing Page (public, unauthenticated OR logged-in)
    │
    ▼
Select Plan  ──────────────────────────────────────┐
    │                                                │ (not logged in)
    ▼ (logged in)                                    ▼
POST /v1/billing/checkout                    → redirect to /signup?plan=X
{ plan_code, billing_cycle, provider }          then re-enter flow post-signup
    │
    ▼
Backend decides provider by business_country_code:
  - IN  → Razorpay Order (razorpay.orders.create)
  - else → Stripe Checkout Session (stripe.checkout.Session.create)
    │
    ▼
Frontend opens:
  - Razorpay: inline Checkout.js modal (no redirect, stays on your domain)
  - Stripe: redirect to Stripe-hosted Checkout page
    │
    ▼
User pays on Razorpay/Stripe's own UI (card/UPI/netbanking or intl card)
    │
    ├──────────────► Webhook (server-to-server, authoritative)
    │                 POST /v1/billing/webhooks/razorpay
    │                 POST /v1/billing/webhooks/stripe
    │                 → verifies signature → activates subscription
    │
    ▼
Browser redirected back to:
  /billing/success?session_id=... (Stripe)
  or closes modal + fires handler (Razorpay)
    │
    ▼
Frontend calls GET /v1/billing/checkout/{id}/status  (polls, does NOT trust
  the redirect URL or Razorpay's client-side handler as proof of payment)
    │
    ▼
Shows "Activating your subscription..." until webhook has processed
  (usually <5s), then redirects to /dashboard with the new plan active.
```

**Critical architectural rule, stated up front because it governs everything
below: the frontend NEVER writes `payment_status`, `subscription_type`, or
`subscription_end_at`. Only two things can:**
1. A verified webhook handler (signature-checked, idempotent)
2. `PATCH /v1/admin/businesses/{id}/subscription` (super admin only, already exists)

### Component responsibilities

| Layer | Responsibility |
|---|---|
| Frontend (`features/billing/`, new) | Render plans, collect plan selection, call `/checkout`, mount Razorpay Checkout.js or redirect to Stripe, poll status, show current subscription (reuses existing `useSubscription`) |
| Backend `routers/billing.py` (new) | Create checkout sessions/orders, webhook endpoints, status polling endpoint, plan CRUD (admin) |
| Backend `services/billing/` (new) | `razorpay_client.py`, `stripe_client.py`, `subscription_activation.py` — the actual provider SDK calls + the "activate subscription" logic shared by both webhook handlers |
| `SubscriptionMiddleware` | Unchanged — keeps enforcing access based on `businesses` table |
| `subscription_expiry.py` | Unchanged — keeps suspending expired subs daily |

### How to securely verify payments
This is the part most SaaS founders get wrong, so it's worth being explicit:

- **Never trust the browser.** A user can fake a successful redirect to
  `/billing/success` (or edit the URL) without ever paying. The `/checkout/{id}/status`
  endpoint the frontend polls must read from *your* database (updated by the
  webhook), never from a value the frontend sent you.
- **Webhook signature verification is non-negotiable** — both Razorpay and
  Stripe sign every webhook payload. Verify it server-side before touching the
  DB (details in Section 5).
- **Idempotency** — webhooks can and will be retried by the provider (network
  blips, your server returning a slow 200). Store the provider's event ID and
  skip processing if you've already seen it (table design below handles this).
- **Amount/currency verification** — when the webhook fires, re-check that the
  amount paid matches the plan's price server-side (from your `plans` table,
  not from the webhook payload's claimed amount) before activating. This
  guards against a compromised or misconfigured checkout session.

---

## 2. Database Design

Your existing `businesses` table columns (`payment_status`, `subscription_type`,
`subscription_start_at/end_at`, `trial_start_at/end_at`) **stay** — they're
your fast-path "current state" cache that `SubscriptionMiddleware` reads on
every request without a join. Don't remove them; the new tables feed them.

### `plans` (new)
Replaces the hardcoded `TIER_FEATURES` dict / frontend `PRICING`/`FEATURE_LIMITS_PLANS`
objects with a real table, so pricing changes don't require a redeploy.

```sql
CREATE TABLE plans (
    plan_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_code         VARCHAR(30)  NOT NULL UNIQUE,   -- 'trial','monthly','annual','lifetime'
    display_name      VARCHAR(50)  NOT NULL,
    billing_cycle     VARCHAR(20)  NOT NULL,           -- 'trial','monthly','yearly','one_time'
    price_inr         NUMERIC(10,2),
    price_usd         NUMERIC(10,2),
    razorpay_plan_id  VARCHAR(100),                    -- Razorpay's own plan ID, if using their Subscriptions API
    stripe_price_id   VARCHAR(100),                    -- Stripe Price object ID
    feature_limits    JSONB NOT NULL DEFAULT '{}',      -- max_products, max_customers, etc — same shape as TIER_FEATURES
    is_active         BOOLEAN NOT NULL DEFAULT true,    -- soft-disable a plan without deleting (existing subs unaffected)
    sort_order        SMALLINT NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
This table is **global**, not tenant-scoped — no `business_id`, no RLS needed
(same category as your `roles`/`permissions` tables).

### `subscription_payments` (new — deliberately NOT named `payments`)
Your existing `payments` table already means "customer paid an invoice." This
is the SaaS billing equivalent — a business paying *you*.

```sql
CREATE TABLE subscription_payments (
    payment_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id         UUID NOT NULL REFERENCES businesses(business_id),
    plan_id              UUID NOT NULL REFERENCES plans(plan_id),
    provider              VARCHAR(20)  NOT NULL,        -- 'razorpay' | 'stripe'
    provider_order_id     VARCHAR(120),                 -- Razorpay order_id / Stripe checkout session id
    provider_payment_id   VARCHAR(120),                 -- Razorpay payment_id / Stripe payment_intent id
    provider_signature    TEXT,                          -- stored for audit trail, never re-used for verification after the fact
    amount                NUMERIC(10,2) NOT NULL,
    currency               VARCHAR(3)   NOT NULL,        -- 'INR' | 'USD'
    status                  VARCHAR(20)  NOT NULL DEFAULT 'created',
                              -- 'created' | 'paid' | 'failed' | 'refunded'
    failure_reason          TEXT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at                  TIMESTAMPTZ,
    updated_by_webhook_at    TIMESTAMPTZ
);
CREATE INDEX idx_subscription_payments_biz ON subscription_payments (business_id, created_at DESC);
CREATE UNIQUE INDEX idx_subscription_payments_provider_order
    ON subscription_payments (provider, provider_order_id);
```

### `subscription_events` (new — webhook idempotency log)
This is the table that makes "webhooks can fire twice" safe.

```sql
CREATE TABLE subscription_events (
    event_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider          VARCHAR(20) NOT NULL,
    provider_event_id VARCHAR(150) NOT NULL,   -- Razorpay's x-razorpay-event-id / Stripe's evt_...
    event_type         VARCHAR(60) NOT NULL,     -- 'payment.captured', 'checkout.session.completed', etc.
    payload             JSONB NOT NULL,           -- raw webhook body, for debugging/replay
    processed_at         TIMESTAMPTZ,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_subscription_events_dedupe
    ON subscription_events (provider, provider_event_id);
```
Webhook handler: `INSERT ... ON CONFLICT (provider, provider_event_id) DO NOTHING`
— if 0 rows inserted, it's a duplicate delivery, return 200 immediately without
reprocessing.

### `invoices` (new — billing receipts, distinct from your sales `invoice_no`)
```sql
CREATE TABLE subscription_invoices (
    invoice_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id        UUID NOT NULL REFERENCES businesses(business_id),
    payment_id           UUID NOT NULL REFERENCES subscription_payments(payment_id),
    invoice_number         VARCHAR(30) NOT NULL UNIQUE,  -- your own sequence, e.g. SB-INV-000123
    amount                    NUMERIC(10,2) NOT NULL,
    currency                    VARCHAR(3) NOT NULL,
    provider_invoice_url          TEXT,   -- Stripe hosts one automatically; Razorpay you generate yourself
    issued_at                       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
For Phase 1 this can be minimal — Stripe auto-generates hosted invoices you can
just link to (`hosted_invoice_url` on the Invoice object); Razorpay doesn't, so
you'd generate a simple PDF later (Phase 3, using your existing `pdf` skill
pattern from sales invoices — don't build this in Phase 1).

### `businesses` — columns to add
```sql
ALTER TABLE businesses
    ADD COLUMN current_plan_id UUID REFERENCES plans(plan_id),
    ADD COLUMN payment_provider VARCHAR(20),        -- 'razorpay' | 'stripe' | NULL (trial)
    ADD COLUMN provider_customer_id VARCHAR(120),   -- Stripe Customer id / Razorpay customer id, for recurring
    ADD COLUMN auto_renew BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN grace_period_end_at TIMESTAMPTZ;      -- see Section 6
```

### RLS / tenant isolation
`subscription_payments`, `subscription_events`, `subscription_invoices` all
carry `business_id` (except `subscription_events`, which is provider-level and
shouldn't be tenant-readable at all — it's an internal audit log, no RLS
policy needed, just don't expose it via any router). Apply the same
`tenant_access_policy` pattern your other tables already use, filtered by
`business_id = current_setting('app.current_business_id')::uuid`. `plans` has
no `business_id` — it's read-only-to-tenants, writable only by super admin
(no RLS needed on reads since it's not sensitive; gate writes at the router
permission level like you already do for `staff.manage`, etc.).

### Role-based access
- New endpoints under `/v1/billing/*` (checkout creation, status polling) —
  gate with `require_permission("settings.manage")`, **not**
  `subscription.manage`. I checked: `subscription.manage` is seeded only for
  the platform Super Admin role (`s5t6u7v8w9x0_add_subscription_management.py:81`),
  not your tenant `admin` role. `settings.manage` is already assigned to
  tenant admins and is the right scope for "manages this business's billing."
- Webhook endpoints — **no** `verify_token()` at all. They're called by
  Razorpay/Stripe's servers, not a logged-in user. Security comes entirely
  from signature verification (Section 5), not JWT auth.

---

## 3. Backend Implementation

New files, following your existing structure:
```
backend/app/
├── routers/billing.py           ← checkout, status, webhooks, plan listing
├── services/billing/
│   ├── razorpay_client.py       ← thin wrapper around razorpay SDK
│   ├── stripe_client.py         ← thin wrapper around stripe SDK
│   └── activation.py            ← activate_subscription() — shared by both webhook handlers
├── schemas/billing.py           ← CheckoutRequest, CheckoutResponse, PlanOut, etc.
└── models/billing.py            ← Plan, SubscriptionPayment, SubscriptionEvent ORM models
```

### Checkout session creation

```python
# routers/billing.py
@router.post("/v1/billing/checkout")
def create_checkout(
    payload: CheckoutRequest,   # { plan_code: str, billing_cycle: str }
    current_user: dict = Depends(require_permission("settings.manage")),
    db: Session = Depends(get_db),
):
    bid = current_user["business_id"]
    plan = db.execute(
        text("SELECT * FROM plans WHERE plan_code = :code AND is_active = true"),
        {"code": payload.plan_code}
    ).fetchone()
    if not plan:
        return error_response("Plan not found", 404)

    business = db.execute(
        text("SELECT business_country_code, business_email FROM businesses WHERE business_id = CAST(:bid AS uuid)"),
        {"bid": bid}
    ).fetchone()

    is_india = (business.business_country_code or "").upper() == "IN"

    if is_india:
        order = razorpay_client.create_order(
            amount_paise=int(plan.price_inr * 100),
            currency="INR",
            receipt=f"biz_{bid}_{plan.plan_code}",
            notes={"business_id": bid, "plan_code": plan.plan_code},
        )
        # Insert a 'created' row in subscription_payments BEFORE returning to
        # frontend — this is what /checkout/{id}/status will poll against.
        payment_id = _record_pending_payment(db, bid, plan.plan_id, "razorpay",
                                              order["id"], plan.price_inr, "INR")
        return success_response({
            "provider": "razorpay",
            "razorpay_order_id": order["id"],
            "razorpay_key_id": os.getenv("RAZORPAY_KEY_ID"),  # public key, safe to expose
            "amount": order["amount"],
            "currency": "INR",
            "payment_id": payment_id,
        })
    else:
        session = stripe_client.create_checkout_session(
            price_id=plan.stripe_price_id,
            success_url=f"{FRONTEND_URL}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{FRONTEND_URL}/billing?cancelled=1",
            client_reference_id=bid,
            customer_email=business.business_email,
        )
        payment_id = _record_pending_payment(db, bid, plan.plan_id, "stripe",
                                              session.id, plan.price_usd, "USD")
        return success_response({
            "provider": "stripe",
            "checkout_url": session.url,
            "payment_id": payment_id,
        })
```

### Webhook endpoints — verification pattern (both providers)

```python
@router.post("/v1/billing/webhooks/razorpay")
async def razorpay_webhook(request: Request, db: Session = Depends(get_db)):
    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    secret = os.getenv("RAZORPAY_WEBHOOK_SECRET")

    try:
        razorpay_client.client.utility.verify_webhook_signature(
            body.decode(), signature, secret
        )
    except razorpay.errors.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    payload = json.loads(body)
    event_id = request.headers.get("X-Razorpay-Event-Id")  # or payload-derived id
    event_type = payload["event"]

    # Idempotency check — insert-or-skip
    inserted = db.execute(
        text("""INSERT INTO subscription_events (provider, provider_event_id, event_type, payload)
                 VALUES ('razorpay', :eid, :etype, CAST(:payload AS jsonb))
                 ON CONFLICT (provider, provider_event_id) DO NOTHING
                 RETURNING event_id"""),
        {"eid": event_id, "etype": event_type, "payload": json.dumps(payload)}
    ).fetchone()
    db.commit()
    if inserted is None:
        return success_response({"status": "already_processed"})

    if event_type == "payment.captured":
        activation.activate_subscription(db, payload["payload"]["payment"]["entity"], provider="razorpay")

    return success_response({"status": "ok"})
```

```python
@router.post("/v1/billing/webhooks/stripe")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    body = await request.body()
    sig_header = request.headers.get("stripe-signature")
    try:
        event = stripe.Webhook.construct_event(
            body, sig_header, os.getenv("STRIPE_WEBHOOK_SECRET")
        )
    except (ValueError, stripe.error.SignatureVerificationError):
        raise HTTPException(status_code=400, detail="Invalid signature")

    inserted = db.execute(
        text("""INSERT INTO subscription_events (provider, provider_event_id, event_type, payload)
                 VALUES ('stripe', :eid, :etype, CAST(:payload AS jsonb))
                 ON CONFLICT (provider, provider_event_id) DO NOTHING
                 RETURNING event_id"""),
        {"eid": event["id"], "etype": event["type"], "payload": json.dumps(event)}
    ).fetchone()
    db.commit()
    if inserted is None:
        return success_response({"status": "already_processed"})

    if event["type"] == "checkout.session.completed":
        activation.activate_subscription(db, event["data"]["object"], provider="stripe")
    elif event["type"] == "invoice.payment_failed":
        activation.handle_payment_failure(db, event["data"]["object"])

    return success_response({"status": "ok"})
```

**Important — FastAPI + raw body:** both handlers need the *raw* request body
for signature verification, not a parsed Pydantic model. Don't add a
`payload: dict` parameter that triggers FastAPI's JSON parsing before you've
verified the signature — read `await request.body()` directly, as above.

### `activation.py` — the shared logic
```python
def activate_subscription(db: Session, provider_object: dict, provider: str):
    """
    Re-derives business_id and plan from YOUR OWN subscription_payments row
    (matched by provider_order_id), never trusts amount/plan from the webhook
    payload as source of truth for what to activate — only as a match key.
    """
    order_id = provider_object["order_id"] if provider == "razorpay" else provider_object["id"]
    payment_row = db.execute(
        text("SELECT * FROM subscription_payments WHERE provider = :p AND provider_order_id = :oid"),
        {"p": provider, "oid": order_id}
    ).fetchone()
    if not payment_row:
        logging.error("Webhook for unknown order_id=%s provider=%s", order_id, provider)
        return

    plan = db.execute(text("SELECT * FROM plans WHERE plan_id = :pid"), {"pid": payment_row.plan_id}).fetchone()

    # Server-side amount check — defense against tampered client-side session data
    paid_amount = provider_object["amount"] / 100 if provider == "razorpay" else provider_object["amount_total"] / 100
    if abs(paid_amount - float(payment_row.amount)) > 0.01:
        logging.critical("Amount mismatch on payment_id=%s: expected %s got %s",
                          payment_row.payment_id, payment_row.amount, paid_amount)
        return  # do NOT activate — flag for manual review

    now = datetime.now(timezone.utc)
    period_end = now + (timedelta(days=365) if plan.billing_cycle == "yearly"
                         else timedelta(days=9999) if plan.billing_cycle == "one_time"
                         else timedelta(days=30))

    db.execute(text("""
        UPDATE businesses SET
            payment_status = 'paid',
            subscription_type = :plan_code,
            current_plan_id = :plan_id,
            payment_provider = :provider,
            subscription_start_at = :now,
            subscription_end_at = :period_end,
            grace_period_end_at = NULL
        WHERE business_id = :bid
    """), {"plan_code": plan.plan_code, "plan_id": plan.plan_id, "provider": provider,
           "now": now, "period_end": period_end, "bid": payment_row.business_id})

    db.execute(text("""
        UPDATE subscription_payments SET status = 'paid', paid_at = :now,
               provider_payment_id = :ppid, updated_by_webhook_at = :now
        WHERE payment_id = :pid
    """), {"now": now, "ppid": provider_object.get("id", ""), "pid": payment_row.payment_id})

    db.commit()

    # Invalidate both caches from the earlier audit finding, so the user's
    # NEXT request immediately sees the new plan instead of waiting out the
    # 10s/60s TTLs.
    clear_user_cache_by_business(payment_row.business_id)   # auth.py's clear_business_users_cache
    clear_subscription_user_cache_by_business(payment_row.business_id)  # subscription.py equivalent
```

That last point matters given what we already found in this audit — both
`_permissions_cache`/`_subscription_cache` need explicit invalidation here or
a user who just paid could still see "subscription required" for up to 60s.

### Failed payments
- Razorpay: `payment.failed` webhook → `subscription_payments.status = 'failed'`,
  `failure_reason` from `payload.error_description`. Don't touch `businesses` —
  they stay on trial/current plan, nothing to downgrade yet.
- Stripe: `invoice.payment_failed` (for recurring) → same pattern, plus if this
  is a *renewal* failure (not first payment), set `payment_status = 'pending'`
  and start the grace period (Section 6) rather than suspending immediately.

### Subscription expiry — already exists, minor extension needed
Your `subscription_expiry.py` currently jumps straight from `paid` →
`suspended` on `subscription_end_at`. Add the grace period step (Section 6)
between those two states.

### Upgrade/downgrade
```python
@router.post("/v1/billing/change-plan")
def change_plan(payload: ChangePlanRequest, current_user=Depends(require_permission("settings.manage")), db=Depends(get_db)):
    # Upgrade: create a new checkout session for the price difference (simplest
    # for Phase 1 — no proration math). Downgrade: schedule the change for
    # subscription_end_at rather than applying immediately (avoid mid-cycle
    # refund logic in Phase 1) — store in a `pending_plan_id` column, applied
    # by the same daily expiry job when the current period ends.
    ...
```
Full proration (mid-cycle credit) is a Phase 3 item — Stripe supports it
natively via `stripe.Subscription.modify(proration_behavior=...)` if you later
move to Stripe's native Subscriptions API instead of one-off Checkout Sessions;
Razorpay has no equivalent, so keep the "schedule for period end" approach
consistent across both providers rather than having upgrade/downgrade behave
differently by country.

---

## 4. Frontend Implementation

New feature folder: `frontend/src/features/billing/` (separate from
`features/subscription/`, which stays as your read-only status display).

```
features/billing/
├── api/billingApi.js       ← createCheckout(), getCheckoutStatus(), fetchPlans()
├── hooks/useCheckout.js    ← useMutation wrapping createCheckout + polling
└── pages/
    ├── PricingPage.jsx     ← public pricing page (may already partly exist — check LandingPage.jsx)
    └── BillingSuccessPage.jsx
```

### Subscribe button flow
```jsx
// PricingPage.jsx
const { mutate: startCheckout, isPending } = useCheckout()

function handleSubscribe(planCode) {
  if (!isLoggedIn) {
    navigate(`/signup?plan=${planCode}`)
    return
  }
  startCheckout(planCode, {
    onSuccess: (data) => {
      if (data.provider === 'razorpay') {
        openRazorpayCheckout(data)   // Checkout.js modal, see below
      } else {
        window.location.href = data.checkout_url   // Stripe redirect
      }
    }
  })
}
```

### Razorpay — inline modal (India)
```jsx
function openRazorpayCheckout(data) {
  const rzp = new window.Razorpay({
    key: data.razorpay_key_id,
    amount: data.amount,
    currency: data.currency,
    order_id: data.razorpay_order_id,
    handler: function (response) {
      // response contains razorpay_payment_id/order_id/signature — this is
      // CLIENT-SIDE data. Do NOT treat this as proof of payment. Just use it
      // to start polling — the webhook is what actually activates the plan.
      navigate(`/billing/success?payment_id=${data.payment_id}`)
    },
    modal: {
      ondismiss: () => { /* user closed without paying — no state change needed */ }
    }
  })
  rzp.open()
}
```
Load `https://checkout.razorpay.com/v1/checkout.js` via a `<script>` tag in
`index.html` (same pattern as your Plus Jakarta Sans font loading — not an
`@import`).

### Status polling — the "don't trust the frontend" enforcement point
```jsx
// BillingSuccessPage.jsx
const { data: status } = useQuery({
  queryKey: ['checkout-status', paymentId],
  queryFn: () => fetchCheckoutStatus(paymentId),
  refetchInterval: (data) => data?.status === 'paid' ? false : 1500,  // poll every 1.5s until webhook lands
  enabled: !!paymentId,
})

useEffect(() => {
  if (status?.status === 'paid') {
    refetchSubscription()   // re-fetch useSubscription so authStore/UI updates
    navigate('/dashboard')
  }
}, [status])
```
Show "Activating your subscription..." with a spinner while `status === 'created'`.
Typical webhook latency is 1-3 seconds; if it's still `'created'` after ~20s,
show "This is taking longer than usual — we'll email you once confirmed"
rather than an infinite spinner, and stop polling.

### Displaying current subscription
`SubscriptionPage.jsx` already does this well — reuse `useSubscription()`
as-is. Just fix the dead `/upgrade` link (line 285) to point at the new
`PricingPage` instead, and add the "Manage billing" / cancel action there
(Section 6).

---

## 5. Security Review

| Risk | Mitigation |
|---|---|
| **Trusting frontend "payment success"** | Already covered above — activation happens only in the webhook handler, reading from your DB, never from the redirect URL/Checkout.js `handler` callback data. |
| **Webhook signature spoofing** | `razorpay.utility.verify_webhook_signature()` and `stripe.Webhook.construct_event()` — both raise on mismatch. **Never** skip this "to make testing easier" and forget to re-enable it — this is the single most common real-world SaaS billing vulnerability. |
| **Replayed webhooks / duplicate activation** | `subscription_events` unique constraint on `(provider, provider_event_id)`, `ON CONFLICT DO NOTHING` — see Section 3. |
| **Subscription manipulation via API** | `/v1/billing/*` endpoints never accept `payment_status`, `subscription_end_at`, or plan activation state as direct request fields — only `plan_code`. The only place those columns get written is `activation.py` (webhook-triggered) and the existing super-admin PATCH. |
| **Unauthorized feature access** | Unchanged — `SubscriptionMiddleware` + `TIER_FEATURES`/`plans.feature_limits` still gate this, same as today. |
| **Cross-tenant billing data leakage** | RLS on `subscription_payments`/`subscription_invoices` (business_id-scoped, same pattern as your other tables). `subscription_events` is never exposed via any tenant-facing endpoint at all — it's an internal log only super admin tooling (if you build any) should query directly. |
| **Webhook endpoint DoS / abuse** | These sit *outside* `SubscriptionMiddleware`'s excluded-paths check already needs updating (add `^/v1/billing/webhooks/`) — but they should still go through your existing `RateLimitMiddleware`. Also exclude from `SecurityHeadersMiddleware`'s CSRF-style checks if any apply, since these are legitimate server-to-server calls with no cookie/session. |
| **Amount tampering** (user intercepts checkout request, changes plan_code to a cheap plan but somehow gets charged for expensive one, or vice versa) | Server derives price from `plans` table server-side in `create_checkout`, never accepts a price from the frontend. Webhook activation re-verifies paid amount against the `subscription_payments` row it created (Section 3's amount-mismatch check). |
| **Secrets exposure** | `RAZORPAY_KEY_SECRET`, `STRIPE_SECRET_KEY`, `RAZORPAY_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET` → backend `.env` only, added to your existing env var list. Only `RAZORPAY_KEY_ID` (public) and Stripe's publishable key (if you ever use Stripe Elements instead of hosted Checkout) go to the frontend. |
| **Test-mode leaking into production** | Both providers have distinct test/live key pairs — make this explicit via `ENVIRONMENT` the same way your `/test-auth` endpoint is already gated, so a misconfigured `.env` can't silently process live money in a dev deploy. |

One gap in the currently-cited middleware exclusion list worth flagging now:
`EXCLUDED_PATHS` in `subscription.py:154-166` will need `/v1/billing/webhooks/`
added, or Razorpay/Stripe's server calls (which carry no `Authorization: Bearer`
header at all) will simply pass through untouched anyway — so this is actually
a non-issue, since `SubscriptionMiddleware.__call__` at line 331 already
returns early for any request without a Bearer token. No change needed there,
just confirming it during implementation.

---

## 6. SaaS Subscription Management

### Free trial
Already implemented (`trial_start_at`/`trial_end_at`, 30 days, set at
registration in `routers/subscription.py:108`). No change needed.

### Monthly/yearly plans
Covered by the `plans` table + `activate_subscription()`'s period calculation
above.

### Auto renewal
For Phase 1, **skip true recurring billing** — Razorpay Subscriptions API and
Stripe Subscriptions both require webhook-driven renewal logic (`invoice.paid`
recurring events) that's meaningfully more complex than one-off Checkout
Sessions. Phase 1 = one-off payment per period, with the expiry job (already
built) suspending access at period end, and an email reminder a few days
before (Phase 2). Phase 2 upgrades to true auto-renew using each provider's
native Subscription object once the one-off flow is proven in production.

### Cancellation
```python
@router.post("/v1/billing/cancel")
def cancel_subscription(current_user=Depends(require_permission("settings.manage")), db=Depends(get_db)):
    # Sets auto_renew = false. Does NOT immediately revoke access — business
    # keeps access until subscription_end_at, consistent with "you paid for
    # the period, you keep it."
    db.execute(text("UPDATE businesses SET auto_renew = false WHERE business_id = :bid"), {"bid": current_user["business_id"]})
    db.commit()
    return success_response({"message": "Auto-renewal disabled. Access continues until your current period ends."})
```

### Grace period after expiry
Add between "paid, expired" and "suspended" in `subscription_expiry.py`:
```python
# Instead of immediately suspending:
UPDATE businesses
SET grace_period_end_at = subscription_end_at + INTERVAL '3 days'
WHERE payment_status = 'paid' AND subscription_end_at < :now AND grace_period_end_at IS NULL;

# Separate query, only suspends once grace has ALSO passed:
UPDATE businesses
SET payment_status = 'suspended'
WHERE payment_status = 'paid' AND grace_period_end_at IS NOT NULL AND grace_period_end_at < :now;
```
`SubscriptionMiddleware`'s `_check_subscription_for_user` needs one added
condition: treat `grace_period_end_at IS NOT NULL AND now < grace_period_end_at`
as still-valid-but-flag-for-a-banner (frontend shows "Payment overdue — renew
within 3 days" via a response header or a lightweight `grace_warning` field,
rather than blocking).

### Feature restrictions
Already implemented via `TIER_FEATURES`/`get_feature_limits()`
(`utils/subscription_features.py`) — once `plans.feature_limits` (JSONB)
exists, migrate this function to read from the DB instead of the hardcoded
dict, so limits are editable without a deploy. Keep the function signature
identical so nothing calling `get_feature_limits()` elsewhere needs to change.

---

## 7. SmartBillr-Specific Recommendations

Your existing `SubscriptionPage.jsx` pricing (`monthly: ₹499/$9.99`,
`annual: ₹4,999/$99`, `lifetime: ₹14,999/$299`) is already reasonable for the
retail-SMB segment — I'd keep the numbers close to what you have rather than
re-deriving from scratch, with these adjustments:

| Plan | Suggested INR | Suggested USD | Positioning |
|---|---|---|---|
| **Free/Trial** | Free (30 days, matches your current trial) | Free | Full features, capped volume — matches your existing `TIER_FEATURES.trial` limits (50 products/customers, 100 sales/mo) |
| **Basic** (rename `monthly`) | ₹499/mo | $9.99/mo | Single-location shop, 1-2 staff — your current `monthly` tier limits (2 staff, 1 manager) fit this well |
| **Pro** (rename `annual`, but also sell it monthly) | ₹4,999/yr (≈₹416/mo) *or* ₹999/mo | $99/yr *or* $19/mo | Multi-staff, financial reports, unlimited products — you already gate `financial_reports`/`product_profit_view` here, which is the right differentiator |
| **Enterprise** (new — not in current 4 tiers) | Custom / "Contact us" | Custom | Multi-location, API access, dedicated support, custom integrations, SLA — retail chains with 5+ locations are the real target here, and this is the tier where you'd actually want a sales conversation, not self-checkout |

Two changes worth making to your current 4-tier structure:
1. **Rename `lifetime` → fold into Enterprise or drop it.** A ₹14,999 one-time
   lifetime deal is common in early-stage bootstrapping (quick cash, loyal
   early users) but works against you long-term for a billing SaaS — it caps
   your recurring revenue on your most price-insensitive early adopters
   permanently. If you keep it, cap how many you sell (e.g., "first 100
   customers only") rather than leaving it as a standing option.
2. **Offer Pro both monthly and yearly**, not annual-only. Retail shop owners
   often want to try a paid tier for a month before committing annually —
   forcing an annual jump from Basic is a bigger leap than most will take on
   the first upgrade.

---

## 8. Implementation Priority

### Phase 1 — Minimum payment system before launch
- `plans` table + seed migration (4-5 rows matching Section 7's pricing)
- `subscription_payments`, `subscription_events` tables
- Razorpay order creation + webhook (India)
- Stripe Checkout Session + webhook (global)
- `activate_subscription()` shared activation logic, with cache invalidation
- `POST /v1/billing/checkout`, `GET /v1/billing/checkout/{id}/status`, both webhook endpoints
- Frontend: Pricing page subscribe button → Razorpay modal / Stripe redirect → success polling page
- Fix the dead `/upgrade` link in `SubscriptionPage.jsx`
- **No** auto-renewal, **no** proration, **no** grace period yet — first
  successful payment just needs to correctly flip `payment_status` and get out
  of everyone's way.

### Phase 2 — Subscription automation
- Grace period logic in `subscription_expiry.py` + middleware awareness
- Cancellation endpoint (`auto_renew` flag)
- Email reminders before expiry (3 days out) — new, uses whatever email
  provider you're already set up with for other transactional email, if any
- True recurring billing via Razorpay Subscriptions API / Stripe Subscriptions
  (replacing the one-off Checkout Session renewal model)
- Upgrade/downgrade with "schedule for period end" logic
- `subscription_invoices` table + Stripe's auto-generated hosted invoice links

### Phase 3 — Advanced billing features
- Mid-cycle proration on upgrade (Stripe native; custom calc for Razorpay)
- Self-serve PDF invoices for Razorpay payments (reuse your existing `pdf`
  skill pattern from sales invoices)
- Usage-based add-ons (e.g., extra staff seats beyond plan limit, priced
  separately)
- Dunning management (multiple retry attempts on failed renewal before
  suspending, rather than a single grace period)
- Admin analytics: MRR, churn, plan distribution dashboard (super-admin `/admin`
  area — you already have the `verify_super_admin` infrastructure for this)

---

## What I did NOT change
- `SubscriptionMiddleware`'s enforcement logic — stays exactly as it is today.
- The daily expiry job's core suspend logic — only extended with a grace step.
- `businesses` table's existing subscription columns — kept, not replaced.
- The super-admin manual override endpoint — kept as the support/refund escape hatch.
- Your existing `payments` table (sale payments) — untouched, new billing
  tables are deliberately separately named to avoid any confusion or collision.
