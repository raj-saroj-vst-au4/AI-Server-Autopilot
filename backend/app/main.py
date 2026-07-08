import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, select, text

from . import config, models, monitor, security
from .database import Base, SessionLocal, engine
from .routers import auth, automations, chat, dashboard, events, servers

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("autopilot")


def run_migrations():
    """Idempotent, additive column migrations for tables that predate a field."""
    inspector = inspect(engine)
    if "servers" not in inspector.get_table_names():
        return
    cols = {c["name"] for c in inspector.get_columns("servers")}
    if "is_high_priority" not in cols:
        with engine.begin() as conn:
            conn.execute(text(
                "ALTER TABLE servers ADD COLUMN is_high_priority TINYINT(1) NOT NULL DEFAULT 0"
            ))
            conn.execute(text(
                "CREATE INDEX ix_servers_is_high_priority ON servers (is_high_priority)"
            ))
        log.info("migration: added servers.is_high_priority")


def seed_admin():
    db = SessionLocal()
    try:
        existing = db.scalars(
            select(models.User).where(models.User.username == config.ADMIN_USERNAME)
        ).first()
        if existing is None:
            db.add(models.User(
                username=config.ADMIN_USERNAME,
                password_hash=security.hash_password(config.ADMIN_PASSWORD),
            ))
            db.commit()
            log.info("seeded admin user '%s'", config.ADMIN_USERNAME)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    run_migrations()
    seed_admin()
    monitor.start()
    yield
    monitor.stop()


app = FastAPI(title="Server Autopilot", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(servers.router)
app.include_router(events.router)
app.include_router(automations.router)
app.include_router(chat.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
