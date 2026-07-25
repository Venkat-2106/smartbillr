"""drop global sales.invoice_no UNIQUE constraint

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-07-25 12:30:00.000000

"""

from typing import Sequence, Union
from alembic import op


revision: str = "f3a4b5c6d7e8"
down_revision: Union[str, None] = "e2f3a4b5c6d7"


def upgrade() -> None:
    # The original table-level UNIQUE(invoice_no) constraint (auto-named
    # "sales_invoice_no_key") blocks every business from having its own
    # INV-0001.  The correct per-tenant constraint already exists as
    # uix_sales_invoice_business (business_id, invoice_no) WHERE is_deleted=false.
    op.execute("ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_invoice_no_key")


def downgrade() -> None:
    op.execute("ALTER TABLE sales ADD CONSTRAINT sales_invoice_no_key UNIQUE (invoice_no)")
