from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from app.middleware.auth import verify_token

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

@app.get("/")
def root():
    return {"message": "SmartBillr API is running! ✅"}

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "app": "SmartBillr API",
        "version": "1.0.0"
    }

# ✅ Test route — protected by auth middleware
@app.get("/test-auth")
def test_auth(current_user: dict = Depends(verify_token)):
    return {
        "success": True,
        "message": "Auth is working!",
        "user_id": current_user["user_id"],
        "business_id": current_user["business_id"]
    }