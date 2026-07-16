"""add composite indexes on audit_logs and low_stock_alerts

Revision ID: x0y1z2a3b4c5
Revises: aa1b2c3d4e5f
Create Date: 2026-07-17 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'x0y1z2a3b4c5'
down_revision: Union[str, None] = 'aa1b2c3d4e5f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.execute("COMMIT")
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_biz_created
        ON audit_logs (business_id, created_at DESC)
    """)
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_low_stock_alerts_biz_status
        ON low_stock_alerts (business_id, alert_status)
    """)


def downgrade():
    op.execute("DROP INDEX IF EXISTS idx_audit_logs_biz_created")
    op.execute("DROP INDEX IF EXISTS idx_low_stock_alerts_biz_status")
