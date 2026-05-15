import logging
import os
import threading
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler

from .scraper import DEFAULT_TRACKED_CARD_LIMIT, sync_top_pokemon_cards


logger = logging.getLogger(__name__)

# Full sync of the entire tracked catalog (default 500 cards). This is the
# heavy job; SNKRDUNK rate-limiting means it realistically takes 1-2 hours.
SYNC_INTERVAL_HOURS = int(os.getenv("SYNC_INTERVAL_HOURS", "3") or 3)

# Hot sync of the most-popular subset. The client wants near-realtime updates,
# so we refresh the top N cards on a much faster cadence. Tuned to stay under
# SNKRDUNK's public rate-limits: ~2 requests per card × 100 cards ≈ 4-5 minutes.
HOT_SYNC_TOP_N = int(os.getenv("HOT_SYNC_TOP_N", "100") or 100)
HOT_SYNC_INTERVAL_MINUTES = int(os.getenv("HOT_SYNC_INTERVAL_MINUTES", "15") or 15)

# Run a full sync shortly after boot so a freshly-restarted backend doesn't
# leave stale data on the homepage for hours. Configurable so test runs can
# disable it.
RUN_FULL_SYNC_ON_STARTUP = os.getenv("RUN_FULL_SYNC_ON_STARTUP", "true").lower() != "false"

scheduler = BackgroundScheduler(timezone="UTC")
_sync_lock = threading.Lock()


def _run_sync_job(label: str, limit: int) -> int:
    if not _sync_lock.acquire(blocking=False):
        logger.info("%s skipped because another SNKRDUNK sync is already running.", label)
        return 0
    try:
        return sync_top_pokemon_cards(limit=limit)
    finally:
        _sync_lock.release()


def scheduled_sync() -> None:
    synced = _run_sync_job("Scheduled SNKRDUNK full sync", DEFAULT_TRACKED_CARD_LIMIT)
    logger.info("Scheduled SNKRDUNK full sync finished. Cards synced: %s", synced)


def hot_sync() -> None:
    """Refresh just the most-popular cards on a fast cadence.

    Most user activity hits the top of the popularity list, so updating those
    every ~15 minutes is the closest we can get to "near-realtime" without
    triggering SNKRDUNK's IP blocks (a full 500-card sync still takes time).
    """
    if HOT_SYNC_TOP_N <= 0:
        return
    synced = _run_sync_job("Hot sync", HOT_SYNC_TOP_N)
    logger.info("Hot sync (top %s) finished. Cards synced: %s", HOT_SYNC_TOP_N, synced)


def start_scheduler() -> None:
    if scheduler.running:
        return
    now = datetime.utcnow()
    # Full catalog refresh — runs once shortly after boot, then on the slower cadence.
    scheduler.add_job(
        scheduled_sync,
        "interval",
        hours=SYNC_INTERVAL_HOURS,
        id="sync_top_pokemon_cards",
        next_run_time=now + timedelta(seconds=30) if RUN_FULL_SYNC_ON_STARTUP else None,
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    # Hot refresh — runs ~5 min after boot (so the slower full sync gets a head
    # start fetching cookies), then every HOT_SYNC_INTERVAL_MINUTES.
    scheduler.add_job(
        hot_sync,
        "interval",
        minutes=HOT_SYNC_INTERVAL_MINUTES,
        id="hot_sync_top_cards",
        next_run_time=now + timedelta(minutes=5),
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    logger.info(
        "Scheduler started. Full sync every %sh, hot sync (top %s) every %sm.",
        SYNC_INTERVAL_HOURS,
        HOT_SYNC_TOP_N,
        HOT_SYNC_INTERVAL_MINUTES,
    )


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
