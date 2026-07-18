from fastapi.responses import Response, JSONResponse
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
        content=json.loads(json.dumps(data, cls=CustomEncoder))
    )

def error_response(message: str, status_code: int = 400, extensions: dict = None):
    content = {
        "success": False,
        "message": message
    }
    if extensions:
        content.update(extensions)
    return JSONResponse(
        status_code=status_code,
        content=content
    )