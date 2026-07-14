"""
Shared batch stock-adjustment logic for purchase returns and sales returns.

Replaces per-item N+1 UPDATE + INSERT loops with:
  1 single SELECT  (check stock availability)
  1 single UPDATE  (deduct stock for all items)
  1 single INSERT  (log all stock movements)
"""
import uuid
import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def bulk_check_and_reduce_stock(
    db: AsyncSession,
    *,
    business_id: str,
    user_id: str,
    items,                     # list of objects with .product_id (UUID) and .return_qty (int)
    reference_id: str,         # purchase_return ID (the header PK)
    movement_type: str,        # 'purchase_return'
    movement_notes_prefix: str = "Stock reduced from purchase return",
) -> str | None:
    """
    Batch check + deduct stock and insert stock_movements in one round-trip each.

    Returns None on success, or an error-message string (caller returns 400).
    On any failure, no rows are written — the caller owns the transaction.
    """
    product_ids = [str(it.product_id) for it in items]
    qty_map     = {str(it.product_id): it.return_qty for it in items}

    # ── 1. Bulk stock check (single SELECT) ───────────────────────────────
    check_params: dict = {"bid": str(business_id)}
    check_parts = []
    for i, pid in enumerate(product_ids):
        tag = f"p{i}"
        check_parts.append(f"CAST(:{tag} AS uuid)")
        check_params[tag] = pid

    # TOCTOU FIX: FOR UPDATE serializes concurrent transactions on these
    # product rows so two requests can't both read stale stock and pass
    # the "enough stock" check simultaneously.
    rows = (await db.execute(text(f"""
        SELECT prod_id, prod_stock_qty
        FROM   products
        WHERE  prod_id     IN ({", ".join(check_parts)})
          AND  business_id = CAST(:bid AS uuid)
        FOR UPDATE
    """), check_params)).fetchall()

    if len(rows) != len(product_ids):
        await db.rollback()
        found = {str(r.prod_id) for r in rows}
        missing = [pid for pid in product_ids if pid not in found]
        return f"Products not found: {', '.join(missing)}"

    insufficient = []
    prev_stock_map = {}
    for row in rows:
        pid = str(row.prod_id)
        cur = int(row.prod_stock_qty)
        req = qty_map[pid]
        if cur < req:
            insufficient.append(f"Product {pid}: need {req} but only {cur} in stock")
        prev_stock_map[pid] = cur

    if insufficient:
        await db.rollback()
        return "; ".join(insufficient)

    # ── 2. Bulk UPDATE stock qty (single statement) ───────────────────────
    product_ids_tuple = ", ".join(
        f"(CAST('{pid}' AS uuid), {qty_map[pid]})" for pid in product_ids
    )
    await db.execute(text(f"""
        UPDATE products AS p
        SET    prod_stock_qty = p.prod_stock_qty - v.qty,
               updated_by     = CAST(:uid AS uuid)
        FROM   (VALUES {product_ids_tuple}) AS v(pid, qty)
        WHERE  p.prod_id     = v.pid
          AND  p.business_id = CAST(:bid AS uuid)
    """), {"uid": str(user_id), "bid": str(business_id)})

    # ── 3. Bulk INSERT stock_movements (single statement) ──────────────────
    value_clauses = []
    params: dict = {"bid": str(business_id), "rid": reference_id, "uid": str(user_id)}
    for i, pid in enumerate(product_ids):
        tag = f"i{i}"
        value_clauses.append(
            f"(CAST(:{tag}_id AS uuid), CAST(:{tag}_pid AS uuid), "
            f" CAST(:bid AS uuid), :{tag}_type, :{tag}_qty, :{tag}_ps, "
            f" CAST(:rid AS uuid), :{tag}_notes, CAST(:uid AS uuid))"
        )
        params[f"{tag}_id"]     = str(uuid.uuid4())
        params[f"{tag}_pid"]    = pid
        params[f"{tag}_type"]   = movement_type
        params[f"{tag}_qty"]    = -qty_map[pid]
        params[f"{tag}_ps"]     = prev_stock_map[pid]
        params[f"{tag}_notes"]  = f"{movement_notes_prefix} {reference_id}"

    await db.execute(text(f"""
        INSERT INTO stock_movements (
            move_id, product_id, business_id, move_type,
            move_qty, move_prev_stock,
            purchase_reference_id, move_notes, move_created_by
        ) VALUES {", ".join(value_clauses)}
    """), params)

    return None
