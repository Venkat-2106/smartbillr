# Import every model module so Base.metadata is complete.
# Routers only import the models they touch, and some tables are used
# exclusively via raw SQL (e.g. plans in billing) — without this, FK
# resolution fails at flush time (e.g. businesses.current_plan_id -> plans).
import app.models.billing
import app.models.business
import app.models.business_counters
import app.models.category
import app.models.customer
import app.models.expense
import app.models.payment
import app.models.product
import app.models.profile
import app.models.purchase
import app.models.purchase_return
import app.models.rbac
import app.models.sale
import app.models.sale_item
import app.models.sales_return
import app.models.stock
import app.models.super_admin
import app.models.supplier
