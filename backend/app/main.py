from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from app.middleware.auth import verify_token
from app.utils.response import success_response, error_response
from app.routers import (
    business, category, customer, supplier,
    product, sale, payment, purchase, staff,
    stock, expense, sales_return, purchase_return, profiles,
    dashboard   # ← NEW: dedicated dashboard aggregation router
)
import os

app = FastAPI(
    title="SmartBillr API",
    description="Backend API for SmartBillr Billing Application",
    version="1.0.0"
)

# FIX: CORS origins now read from environment variable instead of hardcoded localhost only.
# Set ALLOWED_ORIGINS in .env as a comma-separated list:
# ALLOWED_ORIGINS=https://app.smartbillr.com,http://localhost:3000
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")
ALLOWED_ORIGINS = [origin.strip() for origin in _raw_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(business.router)
app.include_router(category.router)
app.include_router(customer.router)
app.include_router(supplier.router)
app.include_router(product.router)
app.include_router(sale.router)
app.include_router(payment.router)
app.include_router(purchase.router)
app.include_router(stock.router)
app.include_router(expense.router)
app.include_router(sales_return.router)
app.include_router(purchase_return.router)
app.include_router(profiles.router)
app.include_router(staff.router)
app.include_router(dashboard.router)   # ← NEW

@app.get("/")
def root():
    return success_response({"message": "SmartBillr API is running! ✅"})


@app.get("/health")
def health_check():
    return success_response({
        "status": "healthy",
        "app": "SmartBillr API",
        "version": "1.0.0"
    })


@app.get("/test-auth")
def test_auth(current_user: dict = Depends(verify_token)):
    return success_response({
        "message": "Auth is working!",
        "user_id": current_user["user_id"],
        "business_id": current_user["business_id"]
    })