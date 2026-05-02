from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Create FastAPI app
app = FastAPI(
    title="SmartBillr API",
    description="Backend API for SmartBillr Billing Application",
    version="1.0.0"
)

# Allow React frontend to talk to FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # React default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Test route
@app.get("/")
def root():
    return {"message": "SmartBillr API is running! ✅"}

# Health check route
@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "app": "SmartBillr API",
        "version": "1.0.0"
    }