from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from app.middleware.auth import verify_token
from app.middleware.security import SecurityHeadersMiddleware
from app.middleware.ratelimit import RateLimitMiddleware
from app.middleware.request_size_limit import RequestSizeLimitMiddleware
from app.utils.response import success_response, error_response
from app.routers import (
    business, category, customer, supplier,
    product, sale, payment, purchase, staff,
    stock, expense, sales_return, purchase_return, profiles,
    dashboard, reports, auth
)
import logging
import os

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

app = FastAPI(
    title="SmartBillr API",
    description="Backend API for SmartBillr Billing Application",
    version="1.0.0"
)

# ── Rate Limiting ─────────────────────────────────────────────────────────────
# Auth paths (/auth/*, /profiles/check-email): 5 req/min per IP
# All other API endpoints: 100 req/min per user (IP fallback for unauthenticated)
# Uses in-process cachetools.TTLCache — no external dependencies.
app.add_middleware(RateLimitMiddleware)

# ── Security Headers ──────────────────────────────────────────────────────────
app.add_middleware(SecurityHeadersMiddleware)

# ── GZip compression ──────────────────────────────────────────────────────────
app.add_middleware(GZipMiddleware, minimum_size=1000)

# ── CORS ──────────────────────────────────────────────────────────────────────
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")
ALLOWED_ORIGINS = [origin.strip() for origin in _raw_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

# ── Request Body Size Limit ────────────────────────────────────────────────────
# JSON endpoints: 10 MB max.  Multipart uploads: 50 MB max.
# Returns 413 Payload Too Large with consistent error format.
app.add_middleware(RequestSizeLimitMiddleware)

# ── Global exception handler ──────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logging.exception(exc)
    return JSONResponse(
        status_code=500,
        content={"success": False, "error": "Internal Server Error"},
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
app.include_router(dashboard.router)
app.include_router(reports.router)
app.include_router(auth.router)


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


# ── /test-auth is ONLY available in development ───────────────────────────────
# In production (ENVIRONMENT=production) this route does not exist.
# It is never registered — it cannot be called, discovered, or abused.
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

if ENVIRONMENT == "development":
    @app.get("/test-auth")
    def test_auth(current_user: dict = Depends(verify_token)):
        return success_response({
            "message": "Auth is working!",
            "user_id": current_user["user_id"],
            "business_id": current_user["business_id"]
        })