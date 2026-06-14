from fastapi.responses import JSONResponse
from uuid import UUID
from datetime import datetime, date
import json

class CustomEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, UUID):
            return str(obj)
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        return super().default(obj)

def success_response(data, status_code: int = 200):
    return JSONResponse(
        status_code=status_code,
        content=json.dumps(data, cls=CustomEncoder),
        media_type="application/json"
    )

def error_response(message: str, status_code: int = 400):
    return JSONResponse(
        status_code=status_code,
        content={
            "success": False,
            "message": message
        }
    )