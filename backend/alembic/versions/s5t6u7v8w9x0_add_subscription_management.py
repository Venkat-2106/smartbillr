"""add subscription and payment fields to businesses table

Revision ID: s5t6u7v8w9x0
Revises: p1q2r3s4t5u6
Create Date: 2026-06-25 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "s5t6u7v8w9x0"
down_revision: Union[str, None] = "p1q2r3s4t5u6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    biz_cols = {c["name"] for c in inspector.get_columns("businesses")}

    BUSINESS_COLUMNS = [
        ("payment_status", sa.String(20), False, "pending"),
        ("subscription_type", sa.String(20), False, "trial"),
        ("subscription_start_at", postgresql.TIMESTAMP(timezone=True), True, None),
        ("subscription_end_at", postgresql.TIMESTAMP(timezone=True), True, None),
        ("trial_start_at", postgresql.TIMESTAMP(timezone=True), True, None),
        ("trial_end_at", postgresql.TIMESTAMP(timezone=True), True, None),
        ("is_active", sa.Boolean(), False, sa.text("true")),
    ]

    for name, col_type, nullable, default in BUSINESS_COLUMNS:
        if name not in biz_cols:
            kw = {"nullable": nullable}
            if default is not None:
                kw["server_default"] = default
            op.add_column("businesses", sa.Column(name, col_type, **kw))

    # Seed subscription.manage permission for Super Admin role
    conn = op.get_bind()

    existing = conn.execute(
        sa.text("SELECT id FROM permissions WHERE code = 'subscription.manage'")
    ).fetchone()

    if not existing:
        result = conn.execute(
            sa.text(
                "INSERT INTO permissions (code, description) VALUES ('subscription.manage', 'Manage business subscriptions') RETURNING id"
            )
        )
        perm_id = result.fetchone()[0]

        admin_role = conn.execute(
            sa.text("SELECT id FROM roles WHERE name = 'admin' LIMIT 1")
        ).fetchone()

        if admin_role:
            conn.execute(
                sa.text(
                    "INSERT INTO role_permissions (role_id, permission_id) VALUES (:rid, :pid)"
                ).bindparams(rid=admin_role[0], pid=perm_id)
            )


def downgrade() -> None:
    conn = op.get_bind()

    perm = conn.execute(
        sa.text("SELECT id FROM permissions WHERE code = 'subscription.manage'")
    ).fetchone()
    if perm:
        conn.execute(
            sa.text("DELETE FROM role_permissions WHERE permission_id = :pid").bindparams(pid=perm[0])
        )
        conn.execute(
            sa.text("DELETE FROM permissions WHERE id = :pid").bindparams(pid=perm[0])
        )

    op.drop_column("businesses", "is_active")
    op.drop_column("businesses", "trial_end_at")
    op.drop_column("businesses", "trial_start_at")
    op.drop_column("businesses", "subscription_end_at")
    op.drop_column("businesses", "subscription_start_at")
    op.drop_column("businesses", "subscription_type")
    op.drop_column("businesses", "payment_status")
