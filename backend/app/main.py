from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from app.middleware.auth import verify_token
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate, pagination_response

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
    return success_response({"message": "SmartBillr API is running! ✅"})

@app.get("/health")
def health_check():
    return success_response({
        "status": "healthy",
        "app": "SmartBillr API",
        "version": "1.0.0"
    })

# Protected test route
@app.get("/test-auth")
def test_auth(current_user: dict = Depends(verify_token)):
    return success_response({
        "message": "Auth is working!",
        "user_id": current_user["user_id"],
        "business_id": current_user["business_id"]
    })

# Test pagination
@app.get("/test-pagination")
def test_pagination(pagination: dict = Depends(paginate)):
    # Fake 50 items for testing
    fake_items = [{"id": i, "name": f"Item {i}"} for i in range(1, 51)]

    # Slice items based on pagination
    start = pagination["offset"]
    end = start + pagination["limit"]
    paged_items = fake_items[start:end]

    return success_response(
        pagination_response(
            data=paged_items,
            total=50,
            page=pagination["page"],
            limit=pagination["limit"]
        )
    )