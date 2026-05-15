import logging
import os
import threading
import time
from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from ..auth import require_admin
from ..database import SessionLocal, get_db
from ..scraper import DEFAULT_TRACKED_CARD_LIMIT, import_cards, refresh_single_card, sync_top_pokemon_cards


logger = logging.getLogger(__name__)
router = APIRouter(tags=["cards"])


CARD_LIST_LIMIT = int(os.getenv("CARD_LIST_LIMIT", str(DEFAULT_TRACKED_CARD_LIMIT)) or DEFAULT_TRACKED_CARD_LIMIT)

# Throttle per-card on-view refreshes so users hammering F5 don't drain
# SNKRDUNK quota. Five minutes per card is enough to feel "live" but stays
# polite to the upstream API.
CARD_REFRESH_MIN_INTERVAL_SECONDS = int(
    os.getenv("CARD_REFRESH_MIN_INTERVAL_SECONDS", "300") or 300
)
_card_refresh_last_run: Dict[int, float] = {}
_card_refresh_lock = threading.Lock()


def _maybe_refresh_card_in_background(card_id: int, snkrdunk_id: Optional[str]) -> None:
    """Kick off a single-card refresh in a thread, with per-card throttling.

    The endpoint returns immediately; the refresh writes to DB so the *next*
    page view shows fresh prices. We don't block the request because SNKRDUNK
    calls can take several seconds.
    """
    if not snkrdunk_id:
        return
    now = time.monotonic()
    with _card_refresh_lock:
        last = _card_refresh_last_run.get(card_id, 0.0)
        if now - last < CARD_REFRESH_MIN_INTERVAL_SECONDS:
            return
        _card_refresh_last_run[card_id] = now

    def _run() -> None:
        local_db = SessionLocal()
        try:
            refresh_single_card(snkrdunk_id, db=local_db)
        except Exception:  # noqa: BLE001 — never let refresh crash the request
            logger.exception("On-view refresh failed for card_id=%s", card_id)
        finally:
            local_db.close()

    threading.Thread(target=_run, daemon=True).start()


@router.get("/cards", response_model=list[schemas.CardOut])
def list_cards(db: Session = Depends(get_db)):
    return (
        db.query(models.Card)
        .options(selectinload(models.Card.condition_prices))
        .order_by(models.Card.popularity_rank.is_(None), models.Card.popularity_rank.asc(), models.Card.id.asc())
        .limit(CARD_LIST_LIMIT)
        .all()
    )


@router.get("/cards/{card_id}", response_model=schemas.CardDetail)
def get_card(card_id: int, db: Session = Depends(get_db)):
    card = (
        db.query(models.Card)
        .options(
            selectinload(models.Card.price_history),
            selectinload(models.Card.condition_prices),
            selectinload(models.Card.sale_events),
        )
        .filter(models.Card.id == card_id)
        .first()
    )
    if card is None:
        raise HTTPException(status_code=404, detail="Card not found")
    # Trigger an async background refresh so the next view shows live prices.
    # Throttled per-card to keep us well under SNKRDUNK's rate limits.
    _maybe_refresh_card_in_background(card.id, card.snkrdunk_id)
    card.price_history.sort(key=lambda row: row.captured_at)
    # Hand-roll the response so we can attach `recent_sales` (the model attribute is
    # `sale_events`, but the API field is named `recent_sales` for clarity).
    detail = schemas.CardDetail.model_validate(card).model_copy(
        update={
            "recent_sales": [
                schemas.SaleEventOut.model_validate(event)
                for event in sorted(card.sale_events, key=lambda e: e.captured_at, reverse=True)
            ],
        }
    )
    return detail


@router.post("/admin/sync-cards", response_model=schemas.SyncResult)
def sync_cards(
    db: Session = Depends(get_db),
    _admin_user: models.User = Depends(require_admin),
):
    synced = sync_top_pokemon_cards(limit=DEFAULT_TRACKED_CARD_LIMIT, db=db)
    if synced:
        message = f"Synced {synced} card(s)"
    else:
        stored_count = db.query(models.Card).filter(models.Card.popularity_rank.isnot(None)).count()
        message = (
            "SNKRDUNK did not return public products right now, likely due to rate limiting or temporary blocking. "
            f"Kept serving the existing {stored_count} stored card(s). Try again later or use Admin import if needed."
        )
    return schemas.SyncResult(ok=True, synced=synced, message=message)


@router.post("/admin/import-cards", response_model=schemas.SyncResult)
def import_card_data(
    cards: list[schemas.CardImport],
    db: Session = Depends(get_db),
    _admin_user: models.User = Depends(require_admin),
):
    payload = [card.model_dump() for card in cards]
    synced = import_cards(payload, db=db)
    message = f"Imported {synced} card(s)" if synced else "Import finished with no cards saved"
    return schemas.SyncResult(ok=True, synced=synced, message=message)
