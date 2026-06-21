"""seed default permissions and admin role mapping

Revision ID: p1q2r3s4t5u6
Revises: n0o1p2q3r4s5
Create Date: 2026-06-21 18:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import text as sa_text

revision: str = "p1q2r3s4t5u6"
down_revision: Union[str, None] = "n0o1p2q3r4s5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ALL_PERMISSIONS = [
    ("dashboard.view", "View dashboard"),
    ("dashboard.financial", "View financial KPIs on dashboard and reports"),
    ("sales.view", "View sales"),
    ("sales.create", "Create sales invoices"),
    ("sales.edit", "Edit sales"),
    ("sales.delete", "Delete sales"),
    ("sales_returns.manage", "Manage sales returns"),
    ("purchases.view", "View purchases"),
    ("purchases.create", "Create purchases"),
    ("purchases.edit", "Edit purchases"),
    ("purchases.delete", "Delete purchases"),
    ("purchase_returns.manage", "Manage purchase returns"),
    ("payments.manage", "Manage payments"),
    ("customers.manage", "Manage customers"),
    ("suppliers.manage", "Manage suppliers"),
    ("products.view", "View products"),
    ("products.edit", "Edit products"),
    ("stock.view", "View stock"),
    ("stock.adjust", "Adjust stock"),
    ("view_product_profit", "View product cost price and profit"),
    ("expenses.manage", "Manage expenses"),
    ("reports.view", "View reports"),
    ("staff.manage", "Manage staff"),
    ("settings.manage", "Manage business settings"),
]

MANAGER_PERMISSIONS = [
    "dashboard.view", "dashboard.financial",
    "sales.view", "sales.create", "sales.edit", "sales.delete",
    "sales_returns.manage",
    "purchases.view", "purchases.create", "purchases.edit", "purchases.delete",
    "purchase_returns.manage",
    "payments.manage", "customers.manage", "suppliers.manage",
    "products.view", "products.edit", "stock.view", "stock.adjust",
    "view_product_profit", "expenses.manage",
    "reports.view",
]

STAFF_PERMISSIONS = [
    "dashboard.view", "sales.view", "sales.create",
    "customers.manage", "products.view", "stock.view",
]


def upgrade():
    conn = op.get_bind()

    role_ids = {}

    for role_name in ("admin", "manager", "staff"):
        row = conn.execute(
            sa_text("SELECT id FROM roles WHERE name = :name").bindparams(name=role_name)
        ).fetchone()
        if row:
            role_ids[role_name] = row[0]
        else:
            result = conn.execute(
                sa_text(
                    "INSERT INTO roles (name, description) VALUES (:name, :desc) RETURNING id"
                ).bindparams(name=role_name, desc=f"{role_name.capitalize()} role")
            )
            role_ids[role_name] = result.fetchone()[0]

    perm_ids = {}
    for code, desc in ALL_PERMISSIONS:
        existing = conn.execute(
            sa_text("SELECT id FROM permissions WHERE code = :code").bindparams(code=code)
        ).fetchone()
        if existing:
            perm_ids[code] = existing[0]
        else:
            result = conn.execute(
                sa_text(
                    "INSERT INTO permissions (code, description) VALUES (:code, :desc) RETURNING id"
                ).bindparams(code=code, desc=desc)
            )
            perm_ids[code] = result.fetchone()[0]

    for code in [p[0] for p in ALL_PERMISSIONS]:
        existing = conn.execute(
            sa_text(
                "SELECT 1 FROM role_permissions WHERE role_id = :rid AND permission_id = :pid"
            ).bindparams(rid=role_ids["admin"], pid=perm_ids[code])
        ).fetchone()
        if not existing:
            conn.execute(
                sa_text(
                    "INSERT INTO role_permissions (role_id, permission_id) VALUES (:rid, :pid)"
                ).bindparams(rid=role_ids["admin"], pid=perm_ids[code])
            )

    for code in MANAGER_PERMISSIONS:
        existing = conn.execute(
            sa_text(
                "SELECT 1 FROM role_permissions WHERE role_id = :rid AND permission_id = :pid"
            ).bindparams(rid=role_ids["manager"], pid=perm_ids[code])
        ).fetchone()
        if not existing:
            conn.execute(
                sa_text(
                    "INSERT INTO role_permissions (role_id, permission_id) VALUES (:rid, :pid)"
                ).bindparams(rid=role_ids["manager"], pid=perm_ids[code])
            )

    for code in STAFF_PERMISSIONS:
        existing = conn.execute(
            sa_text(
                "SELECT 1 FROM role_permissions WHERE role_id = :rid AND permission_id = :pid"
            ).bindparams(rid=role_ids["staff"], pid=perm_ids[code])
        ).fetchone()
        if not existing:
            conn.execute(
                sa_text(
                    "INSERT INTO role_permissions (role_id, permission_id) VALUES (:rid, :pid)"
                ).bindparams(rid=role_ids["staff"], pid=perm_ids[code])
            )


def downgrade():
    conn = op.get_bind()
    for code, _desc in ALL_PERMISSIONS:
        row = conn.execute(
            sa_text("SELECT id FROM permissions WHERE code = :code").bindparams(code=code)
        ).fetchone()
        if row:
            conn.execute(
                sa_text("DELETE FROM role_permissions WHERE permission_id = :pid").bindparams(pid=row[0])
            )
            conn.execute(
                sa_text("DELETE FROM permissions WHERE id = :pid").bindparams(pid=row[0])
            )
