from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from app.database import get_db
from app.middleware.auth import verify_token
from app.models.product import Product
from app.models.category import Category
from app.schemas.product import ProductCreate, ProductUpdate
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate, pagination_response

router = APIRouter(prefix="/products", tags=["Products"])


# ── Helper: fetch full product including generated prod_profit ──
def get_product_with_profit(db: Session, prod_id):
    row = db.execute(
        text("""
            SELECT prod_id, business_id, category_id, prod_name,
                   prod_sell_price, prod_cost_price, prod_profit,
                   prod_stock_qty, prod_low_stock_alert, tax_rate,
                   tax_code, barcode, unit, is_deleted,
                   prod_created_at, updated_at
            FROM products
            WHERE prod_id = :prod_id
        """),
        {"prod_id": str(prod_id)}
    ).fetchone()
    return row


# ── Helper: format row as dict ───────────────────────────────
def row_to_dict(row):
    return {
        "prod_id": str(row.prod_id),
        "business_id": str(row.business_id),
        "category_id": str(row.category_id) if row.category_id else None,
        "prod_name": row.prod_name,
        "prod_sell_price": float(row.prod_sell_price),
        "prod_cost_price": float(row.prod_cost_price),
        "prod_profit": float(row.prod_profit) if row.prod_profit is not None else None,
        "prod_stock_qty": row.prod_stock_qty,
        "prod_low_stock_alert": row.prod_low_stock_alert,
        "tax_rate": float(row.tax_rate) if row.tax_rate is not None else 0,
        "tax_code": row.tax_code,
        "barcode": row.barcode,
        "unit": row.unit,
        "is_deleted": row.is_deleted,
        "prod_created_at": str(row.prod_created_at) if row.prod_created_at else None,
        "updated_at": str(row.updated_at) if row.updated_at else None
    }


# ─────────────────────────────────────────
# POST /products → Create new product
# ─────────────────────────────────────────
@router.post("/")
def create_product(
    data: ProductCreate,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    # Validate category belongs to this business
    if data.category_id:
        category = db.query(Category).filter(
            Category.category_id == data.category_id,
            Category.business_id == business_id,
            Category.is_deleted == False
        ).first()
        if not category:
            return error_response("Category not found", status_code=404)

    new_product = Product(
        business_id=business_id,
        category_id=data.category_id,
        prod_name=data.prod_name,
        prod_sell_price=data.prod_sell_price,
        prod_cost_price=data.prod_cost_price,
        prod_stock_qty=data.prod_stock_qty,
        prod_low_stock_alert=data.prod_low_stock_alert,
        tax_rate=data.tax_rate,
        tax_code=data.tax_code,
        barcode=data.barcode,
        unit=data.unit
    )

    db.add(new_product)
    db.commit()
    db.refresh(new_product)

    # Fetch full row including generated prod_profit
    row = get_product_with_profit(db, new_product.prod_id)

    return success_response({
        "message": "Product created successfully",
        "product": row_to_dict(row)
    }, status_code=201)


# ─────────────────────────────────────────
# GET /products → Get all products
# ─────────────────────────────────────────
@router.get("/")
def get_all_products(
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
    pagination: dict = Depends(paginate)
):
    business_id = current_user["business_id"]

    total = db.query(func.count(Product.prod_id)).filter(
        Product.business_id == business_id,
        Product.is_deleted == False
    ).scalar()

    rows = db.execute(
        text("""
            SELECT prod_id, business_id, category_id, prod_name,
                   prod_sell_price, prod_cost_price, prod_profit,
                   prod_stock_qty, prod_low_stock_alert, tax_rate,
                   tax_code, barcode, unit, is_deleted,
                   prod_created_at, updated_at
            FROM products
            WHERE business_id = :business_id
              AND is_deleted = false
            OFFSET :offset LIMIT :limit
        """),
        {
            "business_id": business_id,
            "offset": pagination["offset"],
            "limit": pagination["limit"]
        }
    ).fetchall()

    return success_response(
        pagination_response(
            [row_to_dict(r) for r in rows],
            total,
            pagination["page"],
            pagination["limit"]
        )
    )


# ─────────────────────────────────────────
# GET /products/{prod_id} → Get one product
# ─────────────────────────────────────────
@router.get("/{prod_id}")
def get_product(
    prod_id: str,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    row = db.execute(
        text("""
            SELECT prod_id, business_id, category_id, prod_name,
                   prod_sell_price, prod_cost_price, prod_profit,
                   prod_stock_qty, prod_low_stock_alert, tax_rate,
                   tax_code, barcode, unit, is_deleted,
                   prod_created_at, updated_at
            FROM products
            WHERE prod_id = :prod_id
              AND business_id = :business_id
              AND is_deleted = false
        """),
        {"prod_id": prod_id, "business_id": business_id}
    ).fetchone()

    if not row:
        return error_response("Product not found", status_code=404)

    return success_response(row_to_dict(row))


# ─────────────────────────────────────────
# PUT /products/{prod_id} → Update product
# ─────────────────────────────────────────
@router.put("/{prod_id}")
def update_product(
    prod_id: str,
    data: ProductUpdate,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    product = db.query(Product).filter(
        Product.prod_id == prod_id,
        Product.business_id == business_id,
        Product.is_deleted == False
    ).first()

    if not product:
        return error_response("Product not found", status_code=404)

    # Validate category if being updated
    if data.category_id:
        category = db.query(Category).filter(
            Category.category_id == data.category_id,
            Category.business_id == business_id,
            Category.is_deleted == False
        ).first()
        if not category:
            return error_response("Category not found", status_code=404)
        product.category_id = data.category_id

    # Update only sent fields
    if data.prod_name is not None:
        product.prod_name = data.prod_name
    if data.prod_sell_price is not None:
        product.prod_sell_price = data.prod_sell_price
    if data.prod_cost_price is not None:
        product.prod_cost_price = data.prod_cost_price
    if data.prod_low_stock_alert is not None:
        product.prod_low_stock_alert = data.prod_low_stock_alert
    if data.tax_rate is not None:
        product.tax_rate = data.tax_rate
    if data.tax_code is not None:
        product.tax_code = data.tax_code
    if data.barcode is not None:
        product.barcode = data.barcode
    if data.unit is not None:
        product.unit = data.unit

    db.commit()
    db.refresh(product)

    # Fetch full row including generated prod_profit
    row = get_product_with_profit(db, product.prod_id)

    return success_response({
        "message": "Product updated successfully",
        "product": row_to_dict(row)
    })


# ─────────────────────────────────────────
# DELETE /products/{prod_id} → Soft delete
# ─────────────────────────────────────────
@router.delete("/{prod_id}")
def delete_product(
    prod_id: str,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    product = db.query(Product).filter(
        Product.prod_id == prod_id,
        Product.business_id == business_id,
        Product.is_deleted == False
    ).first()

    if not product:
        return error_response("Product not found", status_code=404)

    product.is_deleted = True
    db.commit()

    return success_response({
        "message": "Product deleted successfully"
    })