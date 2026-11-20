from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .api import router
from .db import ROOT, database_path, engine_for, migrate
from .income_api import router as income_router
from .installments import router as advances_router
from .spending_api import router as spending_router


def create_app(path: Path | None = None):
    @asynccontextmanager
    async def lifespan(app):
        engine = engine_for(path or database_path())
        try:
            migrate(engine)
            app.state.engine = engine
            yield
        finally:
            engine.dispose()

    app = FastAPI(title="Moradia | Gestão Financeira", version="0.4.3", lifespan=lifespan,
                  docs_url=None, redoc_url=None)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"])

    @app.middleware("http")
    async def local_requests(request: Request, call_next):
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            origin = request.headers.get("origin")
            allowed = {f"http://{request.headers.get('host')}", "http://127.0.0.1:5173"}
            if origin and origin not in allowed:
                return JSONResponse({"detail": "Origem da solicitação não autorizada."}, status_code=403)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    app.include_router(router)
    app.include_router(income_router)
    app.include_router(spending_router)
    app.include_router(advances_router)
    dist = ROOT / "frontend" / "dist"
    if dist.is_dir():
        app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
    return app


app = create_app()
