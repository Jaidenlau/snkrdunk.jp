import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from .database import Base, engine
from .routes import auth, cards, portfolio
from .scheduler import start_scheduler, stop_scheduler


logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)


def _run_lightweight_migrations() -> None:
    """Apply small additive schema changes for the SQLite MVP.

    SQLite's CREATE TABLE IF NOT EXISTS doesn't add new columns to existing
    tables, so we patch the few columns we have introduced after launch and
    purge legacy untagged price history rows whose semantics differ from the
    current per-grade tracking.
    """
    inspector = inspect(engine)
    statements: list[str] = []
    cleanup_statements: list[str] = []

    if "price_history" in inspector.get_table_names():
        existing_history = {col["name"] for col in inspector.get_columns("price_history")}
        if "condition_id" not in existing_history:
            statements.append("ALTER TABLE price_history ADD COLUMN condition_id INTEGER")
        if "condition_name" not in existing_history:
            statements.append("ALTER TABLE price_history ADD COLUMN condition_name VARCHAR")
        # Untagged rows pre-date per-grade tracking and mix incompatible price meanings.
        cleanup_statements.append("DELETE FROM price_history WHERE condition_name IS NULL")

    if "card_condition_prices" in inspector.get_table_names():
        existing_cond = {col["name"] for col in inspector.get_columns("card_condition_prices")}
        if "price_source" not in existing_cond:
            statements.append("ALTER TABLE card_condition_prices ADD COLUMN price_source VARCHAR DEFAULT 'listing_min'")
        if "sales_count" not in existing_cond:
            statements.append("ALTER TABLE card_condition_prices ADD COLUMN sales_count INTEGER DEFAULT 0")
        # Drop grades the client no longer wants to track so the UI does not show stale tabs.
        cleanup_statements.append(
            "DELETE FROM card_condition_prices WHERE condition_name NOT IN ('A','B','C','D','PSA 10')"
        )
        cleanup_statements.append(
            "DELETE FROM price_history WHERE condition_name IS NOT NULL "
            "AND condition_name NOT IN ('A','B','C','D','PSA 10')"
        )

    if not statements and not cleanup_statements:
        return

    with engine.begin() as conn:
        for statement in statements:
            logger.info("Running migration: %s", statement)
            conn.execute(text(statement))
        for statement in cleanup_statements:
            result = conn.execute(text(statement))
            row_count = getattr(result, "rowcount", 0) or 0
            if row_count:
                logger.info("Cleanup '%s' removed %s row(s)", statement.split(" WHERE ")[0], row_count)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _run_lightweight_migrations()
    if os.getenv("DISABLE_SCHEDULER", "false").lower() != "true":
        start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(title="Pokemon Price Tracker API", version="0.1.0", lifespan=lifespan)

frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_origin, "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(cards.router)
app.include_router(portfolio.router)
