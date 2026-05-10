from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from app.middleware.auth import verify_token
from app.utils.response import success_response, error_response
from app.routers import business, category, customer, supplier, product, sale, payment, purchase, stock

app = FastAPI(
    title="SmartBillr API",
    description="Backend API for SmartBillr Billing Application",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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