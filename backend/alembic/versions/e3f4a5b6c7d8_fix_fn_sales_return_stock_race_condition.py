"""fix fn_sales_return_stock: add FOR UPDATE to prevent stock race condition

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-07-07 11:00:00.000000

"""

from typing import Sequence, Union
from alembic import op


revision: str = "e3f4a5b6c7d8"
down_revision: Union[str, None] = "d2e3f4a5b6c7"


FN_WITH_FOR_UPDATE = r"""
CREATE OR REPLACE FUNCTION public.fn_sales_return_stock()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$

DECLARE

    item        RECORD;

    v_prev_stock INTEGER;

    v_new_stock  INTEGER;

BEGIN

    -- -- Only fire when ALL THREE conditions are true -----------------------

    -- 1. The new status is 'approved'

    -- 2. restock flag is TRUE (business wants stock back)

    -- 3. Something actually changed (avoid re-firing if no change)

    -- ----------------------------------------------------------------------

    IF  NEW.return_status = 'approved'

    AND NEW.restock       = TRUE

    AND (

        OLD.return_status IS DISTINCT FROM 'approved'

        OR

        OLD.restock       IS DISTINCT FROM TRUE

    )

    THEN

        -- Loop through every item in this return

        FOR item IN

            SELECT product_id, return_qty

            FROM   sales_return_items

            WHERE  return_id = NEW.return_id

        LOOP

            -- Get current stock before the update

            SELECT prod_stock_qty

            INTO   v_prev_stock

            FROM   products

            WHERE  prod_id = item.product_id

            FOR UPDATE;



            v_new_stock := v_prev_stock + item.return_qty;



            -- Add the returned stock back to the product

            UPDATE products

            SET    prod_stock_qty = v_new_stock

            WHERE  prod_id = item.product_id;



            -- -- THE FIX -------------------------------------------------------

            -- Do NOT include move_new_stock in this INSERT.

            -- It is a GENERATED ALWAYS AS column -- PostgreSQL calculates

            -- it automatically as (move_prev_stock + move_qty).

            -- Inserting it manually causes: "cannot insert a non-DEFAULT

            -- value into column move_new_stock".

            -- -----------------------------------------------------------------

            INSERT INTO stock_movements (

                move_id,

                business_id,

                product_id,

                move_type,

                move_qty,

                move_prev_stock,

                reference_type,

                reference_id,

                move_notes,

                move_created_by

            ) VALUES (

                gen_random_uuid(),

                NEW.business_id,

                item.product_id,

                'sales_return',

                item.return_qty,

                v_prev_stock,

                'sales_return',

                NEW.return_id,

                'Stock added from approved sales return',

                NEW.created_by

            );



        END LOOP;



        -- Mark the return as stock_updated so we don't double-process

        UPDATE sales_returns

        SET    stock_updated = TRUE

        WHERE  return_id = NEW.return_id;



    END IF;



    RETURN NEW;

END;

$function$
"""

FN_WITHOUT_FOR_UPDATE = r"""
CREATE OR REPLACE FUNCTION public.fn_sales_return_stock()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$

DECLARE

    item        RECORD;

    v_prev_stock INTEGER;

    v_new_stock  INTEGER;

BEGIN

    -- -- Only fire when ALL THREE conditions are true -----------------------

    -- 1. The new status is 'approved'

    -- 2. restock flag is TRUE (business wants stock back)

    -- 3. Something actually changed (avoid re-firing if no change)

    -- ----------------------------------------------------------------------

    IF  NEW.return_status = 'approved'

    AND NEW.restock       = TRUE

    AND (

        OLD.return_status IS DISTINCT FROM 'approved'

        OR

        OLD.restock       IS DISTINCT FROM TRUE

    )

    THEN

        -- Loop through every item in this return

        FOR item IN

            SELECT product_id, return_qty

            FROM   sales_return_items

            WHERE  return_id = NEW.return_id

        LOOP

            -- Get current stock before the update

            SELECT prod_stock_qty

            INTO   v_prev_stock

            FROM   products

            WHERE  prod_id = item.product_id;



            v_new_stock := v_prev_stock + item.return_qty;



            -- Add the returned stock back to the product

            UPDATE products

            SET    prod_stock_qty = v_new_stock

            WHERE  prod_id = item.product_id;



            -- -- THE FIX -------------------------------------------------------

            -- Do NOT include move_new_stock in this INSERT.

            -- It is a GENERATED ALWAYS AS column -- PostgreSQL calculates

            -- it automatically as (move_prev_stock + move_qty).

            -- Inserting it manually causes: "cannot insert a non-DEFAULT

            -- value into column move_new_stock".

            -- -----------------------------------------------------------------

            INSERT INTO stock_movements (

                move_id,

                business_id,

                product_id,

                move_type,

                move_qty,

                move_prev_stock,

                reference_type,

                reference_id,

                move_notes,

                move_created_by

            ) VALUES (

                gen_random_uuid(),

                NEW.business_id,

                item.product_id,

                'sales_return',

                item.return_qty,

                v_prev_stock,

                'sales_return',

                NEW.return_id,

                'Stock added from approved sales return',

                NEW.created_by

            );



        END LOOP;



        -- Mark the return as stock_updated so we don't double-process

        UPDATE sales_returns

        SET    stock_updated = TRUE

        WHERE  return_id = NEW.return_id;



    END IF;



    RETURN NEW;

END;

$function$
"""


def upgrade() -> None:
    op.execute(FN_WITH_FOR_UPDATE)


def downgrade() -> None:
    op.execute(FN_WITHOUT_FOR_UPDATE)
