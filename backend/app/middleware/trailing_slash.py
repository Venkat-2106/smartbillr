from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.routing import compile_path


def _registered_patterns(app):
    """
    Compiled path regexes for every registered route, computed once per app
    and cached on app.state. Used to decide whether stripping a trailing
    slash would land on a real route.
    """
    cached = getattr(app.state, "_trailing_slash_patterns", None)
    if cached is None:
        cached = [
            compile_path(route.path)[0]
            for route in app.routes
            if getattr(route, "path", None)
        ]
        app.state._trailing_slash_patterns = cached
    return cached


class TrailingSlashMiddleware(BaseHTTPMiddleware):
    """
    The frontend's axios interceptor appends a trailing slash to every outgoing
    request path (frontend/src/api/axios.js). Most backend routes are registered
    WITHOUT a trailing slash, so nearly every request round-tripped through a
    307 redirect before FastAPI served it - doubling latency on an already-slow
    Render + Supabase(Tokyo) hop.

    A blind strip does NOT work here: ~20 core list/create endpoints ARE
    registered with a trailing slash (@router.get("/") under e.g. prefix
    /v1/products). Blindly stripping those would miss routing, FastAPI's
    redirect_slashes would bounce the client back to the slashed URL, and the
    next request would be stripped again - an infinite redirect loop.

    So this strips the slash ONLY when the stripped path actually matches a
    registered route pattern. Slashed-only routes are passed through untouched
    and keep matching directly. Unknown paths are left alone and 404 as usual.
    Query strings are unaffected (scope["path"] never contains them).

    Must be the OUTERMOST middleware (added last in main.py, after CORS) so
    every downstream middleware that matches on request.url.path -
    RateLimitMiddleware's AUTH_EXACT_PATHS/SKIP_PATHS, SecurityHeadersMiddleware's
    Cache-Control path check - sees the normalized path.
    """

    async def dispatch(self, request: Request, call_next):
        path = request.scope.get("path", "")
        if len(path) > 1 and path.endswith("/"):
            candidate = path.rstrip("/") or "/"
            app = request.scope.get("app")
            if app is not None:
                patterns = _registered_patterns(app)
                if any(pattern.match(candidate) for pattern in patterns):
                    request.scope["path"] = candidate
        return await call_next(request)
