/*
 * =============================================================================
 * Create a non-superuser application role for RLS enforcement
 * =============================================================================
 *
 * Before: DATABASE_URL connects as `postgres` (rolbypassrls = true), meaning
 *         every RLS policy on the 16 tenant tables is a dead letter.
 * After:  DATABASE_URL connects as `app_user` (rolbypassrls = false), making
 *         RLS the active backstop for business data isolation.
 *
 * Run this against your Supabase production DB (psql or SQL editor).
 * Test in staging first — see "Smoke tests" below.
 *
 * Usage:
 *   1. Replace '<strong-password>' with a secure password.
 *   2. Run this script.
 *   3. Update Render DATABASE_URL to: postgresql://app_user:<password>@<host>:<port>/<db>
 *   4. Redeploy, then verify with:
 *        SELECT rolname, rolsuper, rolbypassrls
 *        FROM pg_roles
 *        WHERE rolname = current_user;
 *      Expected: postgres / false / false
 */

-- ── 1. Create the role ────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user LOGIN PASSWORD '<strong-password>'
            NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
    ELSE
        RAISE NOTICE 'Role app_user already exists — skipping creation.';
    END IF;
END
$$;

-- ── 2. Grant schema access ────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO app_user;

-- ── 3. Grant DML on all existing tables ───────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;

-- ── 4. Grant sequence usage (for serial / identity columns) ───────────────────
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- ── 5. Default privileges for future tables ───────────────────────────────────
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

/*
 * =============================================================================
 * Smoke tests (run after flipping DATABASE_URL)
 * =============================================================================
 *
 * These should all pass without permission errors:
 *   ☐ Sale creation              — POST /v1/sales
 *   ☐ Stock adjustment           — POST /v1/stocks (or sale creating stock movement)
 *   ☐ Payment recording          — POST /v1/payments
 *   ☐ Materialized view refresh  — REFRESH MATERIALIZED VIEW (via whichever
 *                                   maintenance route triggers it)
 *
 * Common post-switch failures & fixes:
 *   - "permission denied for sequence …_id_seq"
 *       → Run: GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
 *   - "permission denied for materialized view …" on REFRESH
 *       → GRANT ALL ON <materialized_view> TO app_user;
 *   - Functions with SECURITY DEFINER that assume superuser
 *       → Alter to SECURITY INVOKER or grant the function to app_user
 */
