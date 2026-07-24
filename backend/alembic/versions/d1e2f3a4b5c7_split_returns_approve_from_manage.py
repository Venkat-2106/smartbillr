"""split returns approve from manage (2026-07)

Permission split for sales_returns and purchase_returns:
  - "manage" (staff, manager, admin): create, list, delete returns.
  - "approve" (manager, admin only): change status via PUT (approve/reject).
  Staff with manage-only can create returns but non-pending statuses are
  silently downgraded to "pending" in the POST endpoint.

Revision ID: d1e2f3a4b5c7
Revises: c6d7e8f9a0b1
Create Date: 2026-07-24 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text as sa_text

revision: str = 'd1e2f3a4b5c7'
down_revision: Union[str, None] = 'c6d7e8f9a0b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    conn = op.get_bind()

    new_perms = [
        ("sales_returns.approve", "Approve sales returns"),
        ("purchase_returns.approve", "Approve purchase returns"),
    ]

    perm_ids = {}
    for code, desc in new_perms:
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

    role_ids = {}
    for role_name in ("admin", "manager"):
        row = conn.execute(
            sa_text("SELECT id FROM roles WHERE name = :name").bindparams(name=role_name)
        ).fetchone()
        if row:
            role_ids[role_name] = row[0]

    for role_name, role_id in role_ids.items():
        for perm_code, perm_id in perm_ids.items():
            existing = conn.execute(
                sa_text(
                    "SELECT 1 FROM role_permissions WHERE role_id = :rid AND permission_id = :pid"
                ).bindparams(rid=role_id, pid=perm_id)
            ).fetchone()
            if not existing:
                conn.execute(
                    sa_text(
                        "INSERT INTO role_permissions (role_id, permission_id) VALUES (:rid, :pid)"
                    ).bindparams(rid=role_id, pid=perm_id)
                )

    manage_perms = [
        "sales_returns.manage",
        "purchase_returns.manage",
    ]
    for role_name in ("admin", "manager", "staff"):
        row = conn.execute(
            sa_text("SELECT id FROM roles WHERE name = :name").bindparams(name=role_name)
        ).fetchone()
        if not row:
            continue
        role_id = row[0]
        for code in manage_perms:
            perm_row = conn.execute(
                sa_text("SELECT id FROM permissions WHERE code = :code").bindparams(code=code)
            ).fetchone()
            if not perm_row:
                continue
            perm_id = perm_row[0]
            existing = conn.execute(
                sa_text(
                    "SELECT 1 FROM role_permissions WHERE role_id = :rid AND permission_id = :pid"
                ).bindparams(rid=role_id, pid=perm_id)
            ).fetchone()
            if not existing:
                conn.execute(
                    sa_text(
                        "INSERT INTO role_permissions (role_id, permission_id) VALUES (:rid, :pid)"
                    ).bindparams(rid=role_id, pid=perm_id)
                )


def downgrade():
    conn = op.get_bind()

    for code in ("sales_returns.approve", "purchase_returns.approve"):
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
