from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
import os

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
_connect_src = f"'self' {SUPABASE_URL}" if SUPABASE_URL else "'self'"
CSP_HEADER_VALUE = (
    "default-src 'self'; "
    f"connect-src {_connect_src}; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data:; "
    "font-src 'self'; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "form-action 'self'"
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)

        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"

        response.headers["Content-Security-Policy"] = CSP_HEADER_VALUE

        # Prevent browser caching of authenticated responses
        if not request.url.path in ("/", "/health") and not request.url.path.startswith("/v1/plans"):
            response.headers["Cache-Control"] = "no-store"

        return response
