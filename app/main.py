from contextlib import asynccontextmanager
import os
from pathlib import Path
import threading
import time

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app import auth, db
from app.config import ROOT, STATIC
from app.examples import examples
from app.cards import CardStore
from app.schemas import Preview
from app.workflows import routes, owner_hash
from app.importing import import_routes
from app.demo import demo_routes
from app.printing import print_routes

COOKIE = "card_teacher"


class Login(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pin: str = Field(min_length=1, max_length=12)


class BodyLimit:
    """Limit streamed bodies too, before FastAPI parses JSON."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] not in {"POST", "PUT", "PATCH"}:
            return await self.app(scope, receive, send)
        chunks, size = [], 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            size += len(chunk)
            limit = 12 * 1024 * 1024 if (scope['path'] in ('/api/student/images', '/api/teacher/import/image') or (scope['path'].startswith('/api/teacher/cards/') and scope['path'].endswith('/image'))) else (2 * 1024 * 1024 if scope['path'].startswith('/api/teacher/import') else (600_000 if scope['path'] == '/api/teacher/layout/svg/inspect' else (65_536 if scope['path'].startswith('/api/teacher/layout') else 32_768)))
            if size > limit:
                return await JSONResponse({"detail": "Request is too large."}, status_code=413)(scope, receive, send)
            chunks.append(chunk)
            if not message.get("more_body", False):
                break
        delivered = False

        async def buffered():
            nonlocal delivered
            if delivered:
                return await receive()
            delivered = True
            return {"type": "http.request", "body": b"".join(chunks), "more_body": False}

        await self.app(scope, buffered, send)


def create_app(data_dir=None, teacher_pin=None):
    data = Path(data_dir or os.environ.get("CARD_APP_DATA_DIR", ROOT / "data"))
    database = data / "app.sqlite"
    attempts, attempt_lock = {}, threading.Lock()

    @asynccontextmanager
    async def lifespan(app):
        data.mkdir(parents=True, exist_ok=True)
        (data / "uploads").mkdir(exist_ok=True)
        db.initialize(database)
        generated = auth.configure_pin(database, teacher_pin if teacher_pin is not None else os.environ.get("CARD_APP_TEACHER_PIN"))
        if generated:
            print(f"\nFirst-run teacher PIN: {generated}\nKeep this PIN; only its hash is stored. See README for reset instructions.\n", flush=True)
        yield

    app = FastAPI(title="Classroom Cards", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.database = database
    app.add_middleware(BodyLimit)

    @app.middleware("http")
    async def security(request, call_next):
        # A custom header plus no CORS allowance prevents cross-site browser writes.
        if request.method in {"POST", "PUT", "PATCH", "DELETE"} and request.headers.get("x-card-app") != "1":
            response = JSONResponse({"detail": "Use the classroom app to make this request."}, status_code=403)
        else:
            response = await call_next(request)
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Cache-Control"] = "no-store"
        return response

    def require_teacher(request):
        if not auth.authenticated(database, request.cookies.get(COOKIE)):
            raise HTTPException(401, "Teacher sign-in required.")

    @app.get("/")
    def home():
        return FileResponse(STATIC / "index.html")

    @app.get("/student")
    def student():
        return FileResponse(STATIC / "student.html")

    @app.get("/preview")
    def preview_page():
        return FileResponse(STATIC / "preview.html")

    @app.get("/teacher/login")
    def login_page():
        return FileResponse(STATIC / "login.html")

    @app.get("/teacher")
    def teacher(request: Request):
        if not auth.authenticated(database, request.cookies.get(COOKIE)):
            return RedirectResponse("/teacher/login", status_code=303)
        return FileResponse(ROOT / "app" / "pages" / "projects.html")

    @app.get("/teacher/project")
    def project_page(request: Request):
        if not auth.authenticated(database, request.cookies.get(COOKIE)):
            return RedirectResponse("/teacher/login", status_code=303)
        return FileResponse(ROOT / "app" / "pages" / "project.html")

    @app.get("/teacher/studio")
    def studio(request: Request):
        if not auth.authenticated(database, request.cookies.get(COOKIE)):
            return RedirectResponse("/teacher/login", status_code=303)
        return RedirectResponse('/teacher/project' + ('?project=' + request.query_params['project'] if request.query_params.get('project') else '') + '#layout', status_code=303)

    @app.get("/teacher/print")
    def print_page(request: Request):
        if not auth.authenticated(database, request.cookies.get(COOKIE)):
            return RedirectResponse("/teacher/login", status_code=303)
        return RedirectResponse('/teacher/project' + ('?project=' + request.query_params['project'] if request.query_params.get('project') else '') + '#print', status_code=303)

    @app.get("/api/health")
    def health():
        with db.connect(database) as connection:
            connection.execute("SELECT 1")
        return {"status": "ok"}

    @app.get("/api/project")
    def project(project_id: str = "field-guide"):
        return db.project(database, project_id)

    @app.get("/api/examples")
    def preview_examples():
        return examples()

    @app.post("/api/preview")
    def preview(body: Preview, request: Request):
        teacher = auth.authenticated(database, request.cookies.get(COOKIE))
        owner = owner_hash(request) if body.image_id and not teacher else None
        result, _ = CardStore(database, data / "uploads").preview(body, owner, teacher)
        return result

    @app.post("/api/teacher/login")
    def login(body: Login, request: Request):
        address = request.client.host if request.client else "local"
        now = time.monotonic()
        with attempt_lock:
            for key in list(attempts):
                if now - attempts[key][0] >= 60:
                    del attempts[key]
            window, count = attempts.get(address, (now, 0))
            if count >= 5 or address not in attempts and len(attempts) >= 1000:
                raise HTTPException(429, "Too many attempts. Wait one minute and try again.")
            attempts[address] = (window, count + 1)
        if not auth.verify_pin(database, body.pin):
            raise HTTPException(401, "That PIN was not recognized.")
        with attempt_lock:
            attempts.pop(address, None)
        response = JSONResponse({"ok": True})
        response.set_cookie(COOKIE, auth.create_session(database), max_age=auth.SESSION_SECONDS,
                            httponly=True, samesite="strict", secure=request.url.scheme == "https")
        return response

    @app.post("/api/teacher/logout")
    def logout(request: Request):
        require_teacher(request)
        with db.connect(database) as connection:
            connection.execute("DELETE FROM teacher_sessions WHERE token_hash=?", (auth.digest(request.cookies[COOKIE]),))
        response = JSONResponse({"ok": True})
        response.delete_cookie(COOKIE)
        return response

    @app.get("/api/teacher/dashboard")
    def dashboard(request: Request):
        require_teacher(request)
        with db.connect(database) as connection:
            first = connection.execute('SELECT id FROM projects WHERE deleted_at IS NULL ORDER BY created_at,id LIMIT 1').fetchone()
        if first:
            project = db.project(database, first['id'])
        else:
            project = db.project(database, None)
        with db.connect(database) as connection:
            mode = connection.execute("PRAGMA journal_mode").fetchone()[0]
        return {"project": project, "database": "Ready", "journal_mode": mode, "milestones": [1, 2, 3, 4, 5, 6]}

    app.include_router(routes(database, data / "uploads", require_teacher))
    app.include_router(import_routes(database, data / "uploads", require_teacher))
    app.include_router(print_routes(database, data / 'uploads', require_teacher))
    app.include_router(demo_routes())
    app.mount("/static", StaticFiles(directory=STATIC), name="static")
    return app


app = create_app()





