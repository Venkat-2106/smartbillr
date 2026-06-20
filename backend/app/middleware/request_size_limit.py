from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse


JSON_MAX_SIZE = 10 * 1024 * 1024
MULTIPART_MAX_SIZE = 50 * 1024 * 1024


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        content_type = (request.headers.get("content-type") or "").lower()
        content_length = request.headers.get("content-length")

        limit = MULTIPART_MAX_SIZE if "multipart/form-data" in content_type else JSON_MAX_SIZE

        if content_length:
            try:
                size = int(content_length)
                if size > limit:
                    return JSONResponse(
                        status_code=413,
                        content={
                            "success": False,
                            "message": f"Request too large. Maximum {limit // (1024 * 1024)}MB, Please contact the file owner for assistance."
                        }
                    )
            except ValueError:
                pass

        original_receive = request._receive
        received_bytes = 0

        async def size_limited_receive():
            nonlocal received_bytes
            message = await original_receive()
            if message["type"] == "http.request":
                chunk = message.get("body", b"") or b""
                received_bytes += len(chunk)
                if received_bytes > limit:
                    raise PayloadTooLarge(limit)
            return message

        request._receive = size_limited_receive

        try:
            return await call_next(request)
        except PayloadTooLarge as e:
            return JSONResponse(
                status_code=413,
                content={
                    "success": False,
                    "message": f"Request too large. Maximum {e.limit // (1024 * 1024)}MB. Please contact the file owner for assistance."
                }
            )


class PayloadTooLarge(Exception):
    def __init__(self, limit: int):
        self.limit = limit
