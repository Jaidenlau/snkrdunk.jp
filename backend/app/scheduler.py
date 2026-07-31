import logging
import os
import threading
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler

from .scraper import DEFAULT_TRACKED_CARD_LIMIT, sync_top_pokemon_cards


logger = logging.getLogger(__name__)

# Full sync of the entire tracked catalog (default 2000 cards). This is the
# heavy job; SNKRDUNK rate-limiting means it realistically takes 1-2 hours.
SYNC_INTERVAL_HOURS = int(os.getenv("SYNC_INTERVAL_HOURS", "2") or 2)

# Hot sync of the most-popular subset. The client wants near-realtime updates,
# so we refresh the top N cards on a much faster cadence. Tuned to stay under
# SNKRDUNK's public rate-limits: ~2 requests per card × 200 cards, plus delay/jitter.
HOT_SYNC_TOP_N = int(os.getenv("HOT_SYNC_TOP_N", "300") or 300)
HOT_SYNC_INTERVAL_MINUTES = int(os.getenv("HOT_SYNC_INTERVAL_MINUTES", "10") or 10)

# Run a full sync shortly after boot so a freshly-restarted backend doesn't
# leave stale data on the homepage for hours. Configurable so test runs can
# disable it.
RUN_FULL_SYNC_ON_STARTUP = os.getenv("RUN_FULL_SYNC_ON_STARTUP", "true").lower() != "false"

scheduler = BackgroundScheduler(timezone="UTC")
# Separate locks so the fast hot-sync is never blocked by the slow full sync.
_full_sync_lock = threading.Lock()
_hot_sync_lock = threading.Lock()


def scheduled_sync() -> None:
    if not _full_sync_lock.acquire(blocking=False):
        logger.info("Full sync skipped — already running.")
        return
    try:
        synced = sync_top_pokemon_cards(limit=DEFAULT_TRACKED_CARD_LIMIT)
        logger.info("Scheduled SNKRDUNK full sync finished. Cards synced: %s", synced)
    finally:
        _full_sync_lock.release()


def hot_sync() -> None:
    """Refresh just the most-popular cards on a fast cadence.

    Runs concurrently with the full sync so top cards always get their
    10-minute updates even while the slow 5000-card full sync is in progress.
    """
    if HOT_SYNC_TOP_N <= 0:
        return
    if not _hot_sync_lock.acquire(blocking=False):
        logger.info("Hot sync skipped — already running.")
        return
    try:
        # clear_stale_ranks=False: the hot sync only covers the top N cards, so it
        # must not null the ranks of every card outside that window (which the full
        # sync populated). Only the full catalog sync prunes stale ranks.
        synced = sync_top_pokemon_cards(limit=HOT_SYNC_TOP_N, clear_stale_ranks=False)
        logger.info("Hot sync (top %s) finished. Cards synced: %s", HOT_SYNC_TOP_N, synced)
    finally:
        _hot_sync_lock.release()


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
        "Scheduler started. Full sync every %sh, hot sync (top %s cards) every %sm.",
        SYNC_INTERVAL_HOURS,
        HOT_SYNC_TOP_N,
        HOT_SYNC_INTERVAL_MINUTES,
    )


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
