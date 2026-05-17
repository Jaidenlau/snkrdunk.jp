import json
import logging
import os
import random
import re
import shlex
import subprocess
import threading
import time
import hashlib
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import urlencode, urljoin

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from sqlalchemy import or_
from sqlalchemy.orm import Session
from urllib3.util.retry import Retry

from .database import SessionLocal
from .models import Card, CardConditionPrice, CardSaleEvent, PriceHistory


logger = logging.getLogger(__name__)

BASE_URL = "https://snkrdunk.com"
POKEMON_TRADING_CARDS_URL = f"{BASE_URL}/en/brands/pokemon/trading-cards?categoryId=25"
POKEMON_TRADING_CARDS_API_URL = f"{BASE_URL}/en/v1/trading-cards"
CONDITION_PRICES_URL_TEMPLATE = f"{BASE_URL}/en/v1/trading-cards/{{card_id}}/min-prices-by-conditions"
USED_LISTINGS_URL_TEMPLATE = f"{BASE_URL}/en/v1/products/{{product_code}}/used-listings"
SALE_PRICES_URL_TEMPLATE = f"{BASE_URL}/en/v1/products/{{product_code}}/sale-prices"
TRADING_CARD_PRODUCT_CODE = "SW---{card_id}"
DEFAULT_TRACKED_CARD_LIMIT = int(os.getenv("MAX_TRACKED_CARDS", "2000") or 2000)
DEFAULT_SYNC_FETCH_WORKERS = int(os.getenv("SYNC_FETCH_WORKERS", "2") or 2)
DEFAULT_SYNC_PERSIST_BATCH_SIZE = int(os.getenv("SYNC_PERSIST_BATCH_SIZE", "25") or 25)
SNKRDUNK_REQUEST_DELAY_SECONDS = float(os.getenv("SNKRDUNK_REQUEST_DELAY_SECONDS", "0.7") or 0.7)
SNKRDUNK_REQUEST_JITTER_SECONDS = float(os.getenv("SNKRDUNK_REQUEST_JITTER_SECONDS", "0.6") or 0.6)
SNKRDUNK_COOLDOWN_SECONDS = int(os.getenv("SNKRDUNK_COOLDOWN_SECONDS", "1800") or 1800)
SNKRDUNK_USE_PLAYWRIGHT = os.getenv("SNKRDUNK_USE_PLAYWRIGHT", "true").lower() != "false"
SNKRDUNK_PLAYWRIGHT_TIMEOUT_SECONDS = int(os.getenv("SNKRDUNK_PLAYWRIGHT_TIMEOUT_SECONDS", "30") or 30)
BACKEND_DIR = Path(__file__).resolve().parent.parent
PLAYWRIGHT_FETCH_SCRIPT = BACKEND_DIR / "scripts" / "snkrdunk_browser_fetch.mjs"
USED_LISTINGS_PAGE_SIZE = 50
# Hard cap on pages per card so a single card cannot stall the whole sync if it has
# thousands of sold listings spread across rare grades. 20 pages = up to 1000 listings
# per card. The actual sync stops earlier per card via early-exit (see
# `fetch_sold_listings`) once every requested grade has its sample, OR when a partial
# page signals end-of-data.
USED_LISTINGS_MAX_PAGES = 20

# Per client request, only A/B/C/D/PSA 10 grades are tracked.
ALLOWED_GRADE_NAMES = {"A", "B", "C", "D", "PSA 10"}
CONDITION_SORT_ORDER = {
    "A": 10,
    "B": 20,
    "C": 30,
    "D": 40,
    "PSA 10": 100,
}
DEFAULT_CONDITION_NAME = "PSA 10"

# Sold-price aggregation settings. The /sale-prices endpoint requires an
# authenticated SNKRDUNK session (provided via SNKRDUNK_BROWSER_CURL). Without it,
# we transparently fall back to listing prices and label the source clearly.
SOLD_PRICE_SAMPLE_SIZE = 5
PRICE_SOURCE_SOLD_AVG = "sold_avg"
PRICE_SOURCE_LISTING = "listing_min"
PRICE_CHART_POINTS_KEY = "__price_chart_points__"
PRICE_CHART_GRADE_NAME = "PSA 10"
PRICE_OUTLIER_HIGH_MULTIPLIER = float(os.getenv("SNKRDUNK_PRICE_OUTLIER_HIGH_MULTIPLIER", "2.5") or 2.5)
PRICE_OUTLIER_LOW_MULTIPLIER = float(os.getenv("SNKRDUNK_PRICE_OUTLIER_LOW_MULTIPLIER", "0.35") or 0.35)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept": "application/json,text/html;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": POKEMON_TRADING_CARDS_URL,
}


SAFE_CURL_HEADERS = {
    "accept",
    "accept-language",
    "cookie",
    "referer",
    "user-agent",
    "x-requested-with",
    "sec-ch-ua",
    "sec-ch-ua-mobile",
    "sec-ch-ua-platform",
    "sec-fetch-dest",
    "sec-fetch-mode",
    "sec-fetch-site",
}

_snkrdunk_request_lock = threading.Lock()
_snkrdunk_browser_lock = threading.Lock()
_snkrdunk_next_request_at = 0.0
_snkrdunk_blocked_until = 0.0


class SnkrdunkTemporaryBlock(RuntimeError):
    """Raised when SNKRDUNK signals rate-limiting or temporary public blocking."""


class BrowserResponse:
    """Small response adapter matching the `requests.Response` surface we use."""

    def __init__(self, status_code: int, text: str, headers: Dict[str, str], url: str):
        self.status_code = status_code
        self.text = text
        self.headers = headers
        self.url = url

    def json(self) -> Any:
        return json.loads(self.text)

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise requests.HTTPError(f"{self.status_code} Error for url: {self.url}")


def _mark_snkrdunk_blocked(status_code: int, url: str) -> None:
    global _snkrdunk_blocked_until
    _snkrdunk_blocked_until = max(_snkrdunk_blocked_until, time.monotonic() + SNKRDUNK_COOLDOWN_SECONDS)
    logger.warning(
        "SNKRDUNK returned %s for %s. Entering %ss cooldown to avoid repeated blocked requests.",
        status_code,
        url,
        SNKRDUNK_COOLDOWN_SECONDS,
    )


def _respect_snkrdunk_pacing() -> None:
    """Throttle SNKRDUNK calls globally across worker threads.

    This is intentionally conservative. A 500-card sync can otherwise create a
    burst of category, condition-price, and used-listing requests that is more
    likely to trigger public rate limits.
    """
    global _snkrdunk_next_request_at
    with _snkrdunk_request_lock:
        now = time.monotonic()
        if now < _snkrdunk_blocked_until:
            remaining = int(_snkrdunk_blocked_until - now)
            raise SnkrdunkTemporaryBlock(f"SNKRDUNK cooldown active for ~{remaining}s")
        if now < _snkrdunk_next_request_at:
            time.sleep(_snkrdunk_next_request_at - now)
        delay = SNKRDUNK_REQUEST_DELAY_SECONDS + random.uniform(0, SNKRDUNK_REQUEST_JITTER_SECONDS)
        _snkrdunk_next_request_at = time.monotonic() + delay


def _snkrdunk_get(
    session: requests.Session,
    url: str,
    *,
    mark_blocking: bool = True,
    **kwargs: Any,
) -> requests.Response:
    _respect_snkrdunk_pacing()
    response = session.get(url, **kwargs)
    if response.status_code in (403, 429):
        browser_response = _snkrdunk_browser_get(url, session.headers, kwargs)
        if browser_response is not None:
            response = browser_response
    if mark_blocking and response.status_code in (403, 429):
        _mark_snkrdunk_blocked(response.status_code, url)
        raise SnkrdunkTemporaryBlock(f"SNKRDUNK returned {response.status_code}")
    return response


def _url_with_params(url: str, params: Any) -> str:
    if not params:
        return url
    query = urlencode(params, doseq=True)
    separator = "&" if "?" in url else "?"
    return f"{url}{separator}{query}"


def _snkrdunk_browser_get(
    url: str,
    headers: Dict[str, str],
    request_kwargs: Dict[str, Any],
) -> Optional[BrowserResponse]:
    """Fetch a blocked SNKRDUNK endpoint through real Chromium via Playwright.

    SNKRDUNK/CloudFront often rejects Python's HTTP fingerprint while allowing the
    same logged-in session in Chrome. This fallback runs only after a 403/429 from
    the lightweight requests path, and it is serialized so scheduled syncs do not
    stampede Chromium instances.
    """
    if not SNKRDUNK_USE_PLAYWRIGHT:
        return None
    if not PLAYWRIGHT_FETCH_SCRIPT.exists():
        logger.warning("Playwright fetch script is missing: %s", PLAYWRIGHT_FETCH_SCRIPT)
        return None

    full_url = _url_with_params(url, request_kwargs.get("params"))
    payload = {
        "url": full_url,
        "headers": dict(headers),
        "timeoutMs": int(request_kwargs.get("timeout") or SNKRDUNK_PLAYWRIGHT_TIMEOUT_SECONDS) * 1000,
        "headless": os.getenv("SNKRDUNK_PLAYWRIGHT_HEADLESS", "true").lower() != "false",
        "channel": os.getenv("SNKRDUNK_PLAYWRIGHT_CHANNEL") or None,
        "userDataDir": os.getenv("SNKRDUNK_PLAYWRIGHT_USER_DATA_DIR") or None,
    }

    with _snkrdunk_browser_lock:
        try:
            result = subprocess.run(
                ["node", str(PLAYWRIGHT_FETCH_SCRIPT)],
                cwd=str(BACKEND_DIR),
                input=json.dumps(payload),
                text=True,
                capture_output=True,
                timeout=SNKRDUNK_PLAYWRIGHT_TIMEOUT_SECONDS + 15,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            logger.warning("Playwright SNKRDUNK fetch failed to run for %s: %s", url, exc)
            return None

    if result.returncode != 0:
        logger.warning("Playwright SNKRDUNK fetch failed for %s: %s", url, result.stderr.strip()[:500])
        return None
    try:
        data = json.loads(result.stdout)
    except ValueError as exc:
        logger.warning("Playwright SNKRDUNK fetch returned invalid output for %s: %s", url, exc)
        return None

    status = int(data.get("status") or 0)
    logger.info("Playwright SNKRDUNK fetch returned %s for %s", status, full_url)
    return BrowserResponse(
        status_code=status,
        text=data.get("body") or "",
        headers=data.get("headers") or {},
        url=data.get("url") or full_url,
    )


def parse_browser_curl_headers(curl_command: str) -> Dict[str, str]:
    """Extract reusable public-browser headers from a copied cURL command.

    This intentionally ignores auth-like headers and logs only header names elsewhere.
    """
    headers: Dict[str, str] = {}
    if not curl_command.strip():
        return headers

    try:
        tokens = shlex.split(curl_command)
    except ValueError as exc:
        logger.warning("Could not parse browser cURL command: %s", exc)
        return headers

    index = 0
    while index < len(tokens):
        token = tokens[index]
        value: Optional[str] = None
        if token in {"-H", "--header", "-b", "--cookie"} and index + 1 < len(tokens):
            index += 1
            value = tokens[index]
        elif token.startswith("-H") and len(token) > 2:
            value = token[2:].strip()
        elif token.startswith("--header="):
            value = token.split("=", 1)[1]
        elif token.startswith("--cookie="):
            value = token.split("=", 1)[1]

        if value:
            if token in {"-b", "--cookie"} or token.startswith("--cookie="):
                headers["Cookie"] = value
            elif ":" in value:
                name, header_value = value.split(":", 1)
                if name.strip().lower() in SAFE_CURL_HEADERS:
                    headers[name.strip()] = header_value.strip()
        index += 1

    return headers


def apply_browser_curl_to_session(session: requests.Session, curl_command: Optional[str]) -> None:
    if not curl_command:
        return
    headers = parse_browser_curl_headers(curl_command)
    if headers:
        logger.info("Applying browser cURL headers: %s", sorted(headers.keys()))
        session.headers.update(headers)


def _session() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=2,
        connect=2,
        read=2,
        backoff_factor=0.7,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET",),
    )
    session.mount("https://", HTTPAdapter(max_retries=retry))
    session.headers.update(HEADERS)
    apply_browser_curl_to_session(session, os.getenv("SNKRDUNK_BROWSER_CURL"))
    return session


def _dig_values(value: Any) -> Iterable[Dict[str, Any]]:
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from _dig_values(child)
    elif isinstance(value, list):
        for child in value:
            yield from _dig_values(child)


def _first_string(item: Dict[str, Any], keys: Iterable[str]) -> Optional[str]:
    for key in keys:
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, dict):
            nested = _first_string(value, ("url", "src", "original", "medium", "large"))
            if nested:
                return nested
    return None


def _first_number(item: Dict[str, Any], keys: Iterable[str]) -> Optional[float]:
    for key in keys:
        value = item.get(key)
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            cleaned = re.sub(r"[^0-9.]", "", value)
            if cleaned:
                try:
                    return float(cleaned)
                except ValueError:
                    continue
        if isinstance(value, dict):
            nested = _first_number(value, ("amount", "value", "price", "minPrice"))
            if nested is not None:
                return nested
    return None


def _normalize_product(item: Dict[str, Any], rank: int) -> Optional[Dict[str, Any]]:
    name = _first_string(item, ("name", "title", "productName", "displayName", "englishName"))
    path = _first_string(item, ("productUrl", "url", "path", "href", "link"))
    snkrdunk_id = str(item.get("id") or item.get("productId") or item.get("snkrdunkId") or "").strip() or None

    if not name or not path:
        return None

    product_url = urljoin(BASE_URL, path)
    if "snkrdunk.com" not in product_url:
        return None

    image_url = _first_string(item, ("imageUrl", "image", "thumbnail", "thumbnailUrl", "mainImageUrl"))
    if image_url:
        image_url = urljoin(BASE_URL, image_url)

    price = _first_number(
        item,
        (
            "price",
            "currentPrice",
            "minPrice",
            "lowestPrice",
            "lastSalePrice",
            "marketPrice",
            "displayPrice",
        ),
    )
    currency = _first_string(item, ("currency", "currencyCode")) or "JPY"

    return {
        "snkrdunk_id": snkrdunk_id or product_url,
        "name": name,
        "image_url": image_url,
        "product_url": product_url,
        "current_price": price,
        "currency": currency.upper(),
        "popularity_rank": rank,
    }


def _currency_from_price_format(value: Optional[str]) -> str:
    if not value:
        return "JPY"
    upper = value.upper()
    if "HK$" in upper or "HKD" in upper:
        return "HKD"
    if "US $" in value or value.strip().startswith("$"):
        return "USD"
    if "¥" in value or "JPY" in upper:
        return "JPY"
    return "JPY"


def _normalize_trading_card_api_item(item: Dict[str, Any], rank: int) -> Optional[Dict[str, Any]]:
    card_id = item.get("id")
    name = item.get("name")
    if not card_id or not isinstance(name, str) or not name.strip():
        return None

    price = item.get("minPrice")
    if not isinstance(price, (int, float)):
        price = _first_number(item, ("minPrice", "price"))

    return {
        "snkrdunk_id": str(card_id),
        "name": name.strip(),
        "image_url": item.get("thumbnailUrl"),
        "product_url": f"{BASE_URL}/en/trading-cards/{card_id}",
        "current_price": float(price) if price is not None else None,
        "currency": _currency_from_price_format(item.get("minPriceFormat")),
        "popularity_rank": rank,
    }


def _extract_products_from_json(payload: Any, limit: int) -> List[Dict[str, Any]]:
    products: List[Dict[str, Any]] = []
    seen_urls = set()

    for item in _dig_values(payload):
        if len(products) >= limit:
            break
        product = _normalize_product(item, len(products) + 1)
        if not product or product["product_url"] in seen_urls:
            continue
        lower_url = product["product_url"].lower()
        lower_name = product["name"].lower()
        if "pokemon" not in lower_url and "pokemon" not in lower_name and "pokémon" not in lower_name:
            continue
        seen_urls.add(product["product_url"])
        products.append(product)

    return products


def _fetch_trading_cards_api(limit: int) -> List[Dict[str, Any]]:
    session = _session()
    products: List[Dict[str, Any]] = []
    page = 1
    per_page = min(max(limit, 1), 50)

    while len(products) < limit:
        logger.info(
            "Trying SNKRDUNK trading cards API: %s page=%s perPage=%s order=popular",
            POKEMON_TRADING_CARDS_API_URL,
            page,
            per_page,
        )
        try:
            response = _snkrdunk_get(
                session,
                POKEMON_TRADING_CARDS_API_URL,
                params={
                    "brandId": "pokemon",
                    "categoryId": 25,
                    "page": page,
                    "perPage": per_page,
                    "order": "popular",
                },
                timeout=20,
                mark_blocking=False,
            )
            response.raise_for_status()
            payload = response.json()
        except requests.RequestException as exc:
            logger.warning("SNKRDUNK trading cards API request failed: %s", exc)
            break
        except ValueError as exc:
            logger.warning("SNKRDUNK trading cards API returned invalid JSON: %s", exc)
            break

        trading_cards = payload.get("tradingCards") if isinstance(payload, dict) else None
        if not isinstance(trading_cards, list) or not trading_cards:
            logger.info("SNKRDUNK trading cards API returned no tradingCards list")
            break

        for item in trading_cards:
            if not isinstance(item, dict) or len(products) >= limit:
                continue
            product = _normalize_trading_card_api_item(item, len(products) + 1)
            if product:
                products.append(product)

        if len(trading_cards) < per_page:
            break
        page += 1

    if products:
        logger.info("SNKRDUNK trading cards API returned %s products", len(products))
    return products


def _fetch_api_candidates(limit: int) -> List[Dict[str, Any]]:
    # These are public frontend-style candidates. They may change, so failure falls through to HTML extraction.
    candidate_urls = [
        f"{BASE_URL}/api/products?brand=pokemon&categoryId=25&limit={limit}",
        f"{BASE_URL}/api/v1/products?brand=pokemon&categoryId=25&limit={limit}",
        f"{BASE_URL}/api/v1/products?brandId=pokemon&categoryId=25&limit={limit}",
        f"{BASE_URL}/en/api/products?brand=pokemon&categoryId=25&limit={limit}",
    ]
    session = _session()
    for url in candidate_urls:
        logger.info("Trying SNKRDUNK fallback API candidate: %s", url)
        try:
            response = _snkrdunk_get(session, url, timeout=15, mark_blocking=False)
            if response.status_code >= 400:
                logger.info("SNKRDUNK API candidate returned %s: %s", response.status_code, url)
                continue
            content_type = response.headers.get("content-type", "")
            if "json" not in content_type:
                logger.info("SNKRDUNK API candidate did not return JSON: %s (%s)", url, content_type)
                continue
            products = _extract_products_from_json(response.json(), limit)
            if products:
                logger.info("SNKRDUNK sync found %s products from %s", len(products), url)
                return products
        except requests.RequestException as exc:
            logger.warning("SNKRDUNK API candidate failed: %s (%s)", url, exc)
        except ValueError as exc:
            logger.warning("SNKRDUNK API candidate returned invalid JSON: %s (%s)", url, exc)
    return []


def _fetch_from_html(limit: int) -> List[Dict[str, Any]]:
    session = _session()
    logger.info("Trying SNKRDUNK HTML extraction: %s", POKEMON_TRADING_CARDS_URL)
    try:
        response = _snkrdunk_get(session, POKEMON_TRADING_CARDS_URL, timeout=20, mark_blocking=False)
        response.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("SNKRDUNK category page fetch failed: %s", exc)
        return []

    soup = BeautifulSoup(response.text, "html.parser")
    payloads: List[Any] = []

    next_data = soup.find("script", id="__NEXT_DATA__")
    if next_data and next_data.string:
        logger.info("Found SNKRDUNK __NEXT_DATA__ payload")
        try:
            payloads.append(json.loads(next_data.string))
        except ValueError as exc:
            logger.warning("SNKRDUNK __NEXT_DATA__ parse failed: %s", exc)

    for script in soup.find_all("script", type="application/ld+json"):
        if script.string:
            logger.info("Found SNKRDUNK JSON-LD payload")
            try:
                payloads.append(json.loads(script.string))
            except ValueError:
                continue

    for payload in payloads:
        products = _extract_products_from_json(payload, limit)
        if products:
            logger.info("SNKRDUNK sync found %s products from HTML payload", len(products))
            return products

    logger.info("SNKRDUNK HTML extraction found no products")
    return []


def fetch_condition_prices(snkrdunk_id: str, session: Optional[requests.Session] = None) -> List[Dict[str, Any]]:
    """Fetch the public per-condition minimum prices for a single SNKRDUNK trading card.

    Returns an empty list when the endpoint fails so callers can keep the rest of the
    sync running without aborting.
    """
    if not snkrdunk_id or not str(snkrdunk_id).isdigit():
        return []
    url = CONDITION_PRICES_URL_TEMPLATE.format(card_id=snkrdunk_id)
    owns_session = session is None
    sess = session or _session()
    try:
        response = _snkrdunk_get(sess, url, timeout=15, mark_blocking=False)
        if response.status_code >= 400:
            logger.info("min-prices-by-conditions returned %s for card %s", response.status_code, snkrdunk_id)
            return []
        payload = response.json()
    except requests.RequestException as exc:
        logger.warning("min-prices-by-conditions request failed for %s: %s", snkrdunk_id, exc)
        return []
    except ValueError as exc:
        logger.warning("min-prices-by-conditions invalid JSON for %s: %s", snkrdunk_id, exc)
        return []
    finally:
        if owns_session:
            sess.close()

    raw = payload.get("conditionPrices") if isinstance(payload, dict) else None
    if not isinstance(raw, list):
        return []

    conditions: List[Dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        condition_id = item.get("conditionId")
        condition_name = (item.get("conditionName") or "").strip()
        if condition_id is None or not condition_name:
            continue
        # Drop grades the client does not want to display.
        if condition_name not in ALLOWED_GRADE_NAMES:
            continue
        min_price = item.get("minPrice")
        min_price_format = item.get("minPriceFormat") or ""
        conditions.append(
            {
                "condition_id": int(condition_id),
                "condition_name": condition_name,
                "min_price": float(min_price) if isinstance(min_price, (int, float)) else None,
                "min_price_format": min_price_format,
                "currency": _currency_from_price_format(min_price_format),
                "sort_order": CONDITION_SORT_ORDER.get(condition_name, 500 + int(condition_id)),
                "price_source": PRICE_SOURCE_LISTING,
                "sales_count": 0,
            }
        )

    conditions.sort(key=lambda row: row["sort_order"])
    return conditions


def fetch_sold_listings(
    snkrdunk_id: str,
    needed_grades: Optional[Iterable[str]] = None,
    sample_size: int = SOLD_PRICE_SAMPLE_SIZE,
    session: Optional[requests.Session] = None,
) -> Dict[str, List[Dict[str, Any]]]:
    """Return the most recent sold listings per grade for a single SNKRDUNK card.

    Uses the fully public `/en/v1/products/{productCode}/used-listings` endpoint that
    powers the "Listed Items" section on the SNKRDUNK card page. Each listing carries
    `isSold`, `priceAmount`, `currency`, and `condition` fields. Listings are returned
    newest-first, so the first `sample_size` sold rows per condition correspond to the
    most recent sales for that grade.

    Returns a dict keyed by condition name, e.g.
        {"PSA 10": [{"price": 81.0, "currency": "USD", "listing_uid": "..."}, ...], ...}
    Empty dict on failure or when there are no public sold listings.
    """
    if not snkrdunk_id or not str(snkrdunk_id).isdigit():
        return {}

    wanted = {grade for grade in (needed_grades or ALLOWED_GRADE_NAMES) if grade}
    product_code = TRADING_CARD_PRODUCT_CODE.format(card_id=snkrdunk_id)
    url = USED_LISTINGS_URL_TEMPLATE.format(product_code=product_code)

    owns_session = session is None
    sess = session or _session()
    # Collect every sold listing across pages first, then sort by listing id desc
    # (newest listed first) before taking the top `sample_size` per grade. The API
    # does not guarantee a strict newest-first order, so per-page slicing produces
    # mixed-age samples.
    by_grade: Dict[str, List[Dict[str, Any]]] = {}
    grades_with_evidence: set[str] = set()
    try:
        for page in range(1, USED_LISTINGS_MAX_PAGES + 1):
            try:
                response = _snkrdunk_get(
                    sess,
                    url,
                    params={
                        "page": page,
                        "perPage": USED_LISTINGS_PAGE_SIZE,
                        "sortType": "latest",
                        "isOnlySold": "true",
                    },
                    timeout=15,
                    mark_blocking=False,
                )
            except requests.RequestException as exc:
                logger.warning("used-listings request failed for %s page=%s: %s", snkrdunk_id, page, exc)
                break
            if response.status_code >= 400:
                logger.info("used-listings returned %s for %s page=%s", response.status_code, snkrdunk_id, page)
                break
            try:
                payload = response.json()
            except ValueError as exc:
                logger.warning("used-listings invalid JSON for %s page=%s: %s", snkrdunk_id, page, exc)
                break

            listings = payload.get("usedListings") if isinstance(payload, dict) else None
            if not isinstance(listings, list) or not listings:
                break

            for item in listings:
                if not isinstance(item, dict):
                    continue
                condition = (item.get("condition") or "").strip()
                if wanted and condition not in wanted:
                    continue
                # Track every grade we've actually observed in the listings stream
                # (sold or not) so we can detect "no PSA 10 ever appears for this card".
                grades_with_evidence.add(condition)
                if not item.get("isSold"):
                    continue
                if not _is_single_card_listing(item):
                    logger.info(
                        "Skipping bundled sold listing for %s grade=%s listing_id=%s",
                        snkrdunk_id,
                        condition,
                        item.get("id"),
                    )
                    continue
                price_amount = item.get("priceAmount")
                if not isinstance(price_amount, (int, float)):
                    continue
                by_grade.setdefault(condition, []).append(
                    {
                        "price": float(price_amount),
                        "currency": (item.get("currency") or "USD").upper(),
                        "listing_uid": item.get("listingUID"),
                        "listing_id": item.get("id") or 0,
                        "price_format": item.get("price"),
                        "thumbnail_url": item.get("thumbnailUrl"),
                    }
                )

            # End-of-data: a partial page means there are no further listings.
            if len(listings) < USED_LISTINGS_PAGE_SIZE:
                break
            # Early-exit: once every grade we've actually seen evidence for has at
            # least `sample_size` sold rows, deeper pages will only give older sales
            # we'd ignore anyway. This keeps high-volume cards (Psyduck has 1300+
            # listings) from pulling more than they need.
            relevant = (wanted & grades_with_evidence) if wanted else grades_with_evidence
            if relevant and all(len(by_grade.get(g, [])) >= sample_size for g in relevant):
                break
    finally:
        if owns_session:
            sess.close()

    sales: Dict[str, List[Dict[str, Any]]] = {}
    for grade, rows in by_grade.items():
        # Listing ID is assigned at creation and monotonically increases; treat the
        # highest IDs as the most recent sold listings (true sold timestamp is not
        # exposed publicly).
        rows.sort(key=lambda r: r.get("listing_id") or 0, reverse=True)
        sales[grade] = rows[:sample_size]

    return sales


# Map SNKRDUNK condition_id integers (used by /sale-prices) to the human-readable
# grade names we display. Filled at module load via `fetch_condition_prices` calls
# but seeded with the well-known IDs we see in production payloads so that even a
# brand-new database has a usable mapping on first sync.
DEFAULT_CONDITION_ID_TO_NAME: Dict[int, str] = {
    18: "A",
    19: "B",
    20: "C",
    21: "D",
    22: "PSA 10",
}

FULLWIDTH_DIGIT_TRANSLATION = str.maketrans("０１２３４５６７８９", "0123456789")


def _listing_text_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, dict):
        return " ".join(_listing_text_value(child) for child in value.values())
    if isinstance(value, list):
        return " ".join(_listing_text_value(child) for child in value)
    return str(value)


def _listing_declared_quantity(item: Dict[str, Any]) -> Optional[int]:
    """Infer whether a SNKRDUNK listing is a lot/bundle rather than one card.

    SNKRDUNK can label a listing as PSA 10 while the listing details say
    "3 sheets" / "2枚"; those prices are for multiple cards and must not be used
    as a single-card market price.
    """
    for key in ("numberOfItems", "quantity", "itemCount", "cardCount"):
        raw = item.get(key)
        if isinstance(raw, int) and raw > 0:
            return raw
        if isinstance(raw, str) and raw.strip().isdigit():
            return int(raw.strip())

    text = " ".join(
        _listing_text_value(item.get(key))
        for key in (
            "size",
            "sizeLabel",
            "description",
            "conditionDescription",
            "title",
            "name",
        )
    ).translate(FULLWIDTH_DIGIT_TRANSLATION).lower()

    patterns = (
        r"(\d+)\s*(?:sheets?|cards?|pcs?|pieces?)\b",
        r"(\d+)\s*(?:枚|点|個)",
        r"(?:set|lot|bundle)\s+of\s+(\d+)",
        r"(\d+)\s*(?:連番|連)",
    )
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            try:
                return int(match.group(1))
            except (TypeError, ValueError):
                continue
    return None


def _is_single_card_listing(item: Dict[str, Any]) -> bool:
    declared_quantity = _listing_declared_quantity(item)
    return declared_quantity is None or declared_quantity <= 1


def _median(values: List[float]) -> float:
    ordered = sorted(values)
    midpoint = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[midpoint]
    return (ordered[midpoint - 1] + ordered[midpoint]) / 2


def _filter_price_outlier_sales(
    snkrdunk_id: str,
    grade_name: str,
    sales: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Drop obvious bundle/lot prices that survive the listing text filter.

    Some SNKRDUNK sold rows are technically one listing but contain several PSA
    slabs in the photos (for example 10 cards sold together). The API may not
    expose that quantity, so the safest second signal is a single sale that is
    several times above the recent median for the same card+grade.
    """
    numeric_sales = [
        sale for sale in sales if isinstance(sale.get("price"), (int, float)) and float(sale["price"]) > 0
    ]
    if len(numeric_sales) < 2:
        return sales

    median_price = _median([float(sale["price"]) for sale in numeric_sales])
    if median_price <= 0:
        return sales

    low_limit = median_price * PRICE_OUTLIER_LOW_MULTIPLIER
    high_limit = median_price * PRICE_OUTLIER_HIGH_MULTIPLIER
    filtered: List[Dict[str, Any]] = []
    removed = 0
    for sale in sales:
        price = sale.get("price")
        if isinstance(price, (int, float)):
            numeric_price = float(price)
            if numeric_price < low_limit or numeric_price > high_limit:
                removed += 1
                logger.info(
                    "Skipping price outlier for %s grade=%s price=%s median=%s listing_id=%s",
                    snkrdunk_id,
                    grade_name,
                    numeric_price,
                    median_price,
                    sale.get("listing_id"),
                )
                continue
        filtered.append(sale)

    return filtered if filtered else sales


def fetch_sale_prices_authenticated(
    snkrdunk_id: str,
    session: Optional[requests.Session] = None,
    needed_grades: Optional[Iterable[str]] = None,
    sample_size: int = SOLD_PRICE_SAMPLE_SIZE,
) -> Optional[Dict[str, List[Dict[str, Any]]]]:
    """Authenticated sold-price lookup.

    Hits SNKRDUNK's `/en/v1/products/{code}/sale-prices` endpoint, which returns
    actual sold prices with `soldAt` timestamps but requires a logged-in session
    cookie. We rely on `SNKRDUNK_BROWSER_CURL` (parsed by `_session()`) to attach
    the user's browser cookies; without them the endpoint returns 401 and we
    return `None` so callers can fall back to the public `/used-listings` path.

    Returns a dict keyed by grade name with the most-recent `sample_size` sales
    sorted oldest→newest, e.g.
        {"PSA 10": [{"price": 78.0, "currency": "USD", "sold_at": datetime(...)}, ...]}
    """
    if not snkrdunk_id or not str(snkrdunk_id).isdigit():
        return None
    if not os.getenv("SNKRDUNK_BROWSER_CURL") and not os.getenv("SNKRDUNK_PLAYWRIGHT_USER_DATA_DIR"):
        return None

    wanted = {grade for grade in (needed_grades or ALLOWED_GRADE_NAMES) if grade}
    product_code = TRADING_CARD_PRODUCT_CODE.format(card_id=snkrdunk_id)
    url = SALE_PRICES_URL_TEMPLATE.format(product_code=product_code)

    owns_session = session is None
    sess = session or _session()
    try:
        try:
            response = _snkrdunk_get(
                sess,
                url,
                params={"range": "ALL", "used": "true"},
                timeout=15,
                mark_blocking=False,
            )
        except requests.RequestException as exc:
            logger.warning("sale-prices request failed for %s: %s", snkrdunk_id, exc)
            return None
        if response.status_code in (401, 403):
            logger.info(
                "sale-prices auth required for %s (cookie expired? refresh SNKRDUNK_BROWSER_CURL)",
                snkrdunk_id,
            )
            return None
        if response.status_code >= 400:
            logger.info("sale-prices status %s for %s", response.status_code, snkrdunk_id)
            return None
        try:
            payload = response.json()
        except ValueError as exc:
            logger.warning("sale-prices invalid JSON for %s: %s", snkrdunk_id, exc)
            return None
    finally:
        if owns_session:
            sess.close()

    chart_rows: List[Dict[str, Any]] = []
    if isinstance(payload, dict):
        currency_payload = payload.get("currency")
        chart_currency = "USD"
        if isinstance(currency_payload, dict):
            chart_currency = str(currency_payload.get("id") or chart_currency).upper()
        elif isinstance(currency_payload, str):
            chart_currency = currency_payload.upper()
        points = payload.get("points")
        if isinstance(points, list):
            for point in points:
                if (
                    not isinstance(point, list)
                    or len(point) < 2
                    or not isinstance(point[0], (int, float))
                    or not isinstance(point[1], (int, float))
                ):
                    continue
                try:
                    sold_at = datetime.utcfromtimestamp(point[0] / 1000 if point[0] > 10_000_000_000 else point[0])
                except (OverflowError, ValueError, OSError):
                    continue
                chart_rows.append(
                    {
                        "price": float(point[1]),
                        "currency": chart_currency,
                        "sold_at": sold_at,
                        "listing_id": None,
                        "listing_uid": f"chart:{snkrdunk_id}:{int(point[0])}",
                        "price_format": None,
                    }
                )

    # Discover the list of sale rows. SNKRDUNK has used multiple shapes here so we
    # search every list-of-dicts in the payload and pick the one with the most
    # sale-like rows.
    candidates: List[List[Dict[str, Any]]] = []
    if isinstance(payload, dict):
        for key in ("salePrices", "prices", "sales", "data", "items", "results"):
            v = payload.get(key)
            if isinstance(v, list):
                candidates.append([row for row in v if isinstance(row, dict)])
    if isinstance(payload, list):
        candidates.append([row for row in payload if isinstance(row, dict)])
    if not candidates:
        return {PRICE_CHART_POINTS_KEY: chart_rows} if chart_rows else {}

    rows = max(candidates, key=len)
    by_grade: Dict[str, List[Dict[str, Any]]] = {}
    for row in rows:
        price = _first_number(row, ("price", "salePrice", "amount", "priceAmount"))
        if price is None:
            continue
        currency_raw = row.get("currency") or row.get("priceFormat") or row.get("displayPrice")
        if isinstance(currency_raw, str) and len(currency_raw) <= 6 and not any(ch.isdigit() for ch in currency_raw):
            currency = currency_raw
        else:
            currency = _currency_from_price_format(str(currency_raw or ""))
        # Resolve grade: try condition name first, then condition id mapping.
        grade_name: Optional[str] = None
        for k in ("condition", "conditionName", "grade", "gradeName"):
            v = row.get(k)
            if isinstance(v, str) and v.strip():
                grade_name = v.strip()
                break
        if grade_name is None:
            for k in ("conditionId", "condition_id", "gradeId"):
                v = row.get(k)
                if isinstance(v, int):
                    grade_name = DEFAULT_CONDITION_ID_TO_NAME.get(v)
                    break
        if grade_name is None or (wanted and grade_name not in wanted):
            continue

        sold_at_raw = (
            row.get("soldAt")
            or row.get("createdAt")
            or row.get("date")
            or row.get("at")
            or row.get("tradedAt")
        )
        sold_at: Optional[datetime] = None
        if isinstance(sold_at_raw, str):
            try:
                sold_at = datetime.fromisoformat(sold_at_raw.replace("Z", "+00:00")).replace(tzinfo=None)
            except ValueError:
                sold_at = None
        elif isinstance(sold_at_raw, (int, float)):
            try:
                # SNKRDUNK timestamps come as ms or s; treat large values as ms.
                sold_at = datetime.utcfromtimestamp(
                    sold_at_raw / 1000 if sold_at_raw > 10_000_000_000 else sold_at_raw
                )
            except (OverflowError, ValueError, OSError):
                sold_at = None

        by_grade.setdefault(grade_name, []).append(
            {
                "price": float(price),
                "currency": str(currency).upper(),
                "sold_at": sold_at,
                "listing_id": int(row.get("id") or row.get("listingId") or 0) or None,
                "listing_uid": row.get("listingUID") or row.get("uid"),
                "price_format": row.get("price") if isinstance(row.get("price"), str) else None,
            }
        )

    # Keep only the latest `sample_size` per grade, oldest→newest, so the average
    # reflects the freshest data and the chart can be drawn chronologically.
    out: Dict[str, List[Dict[str, Any]]] = {}
    for grade, items in by_grade.items():
        sortable = [it for it in items if it.get("sold_at") is not None]
        if sortable:
            sortable.sort(key=lambda r: r["sold_at"])  # oldest -> newest
            out[grade] = sortable[-sample_size:]
        else:
            # Fall back to listing_id desc when no timestamps were exposed.
            items.sort(key=lambda r: r.get("listing_id") or 0, reverse=True)
            out[grade] = list(reversed(items[:sample_size]))
    if chart_rows:
        out[PRICE_CHART_POINTS_KEY] = chart_rows
    return out


def fetch_top_pokemon_cards(limit: int = DEFAULT_TRACKED_CARD_LIMIT) -> List[Dict[str, Any]]:
    logger.info("Starting SNKRDUNK top Pokemon card fetch with limit=%s", limit)
    try:
        products = _fetch_trading_cards_api(limit)
        if products:
            return products[:limit]
        products = _fetch_api_candidates(limit)
        if products:
            return products[:limit]
        return _fetch_from_html(limit)[:limit]
    except SnkrdunkTemporaryBlock as exc:
        logger.warning("SNKRDUNK sync paused by safety cooldown: %s", exc)
        return []


def _enrich_with_sold_avg(
    snkrdunk_id: str,
    conditions: List[Dict[str, Any]],
    session: Optional[requests.Session],
) -> Dict[str, List[Dict[str, Any]]]:
    """Replace listing prices with the average of the last N sold prices per grade.

    Strategy:
      1. If SNKRDUNK_BROWSER_CURL is configured, try the authenticated `/sale-prices`
         endpoint first. It returns sold prices with real `sold_at` timestamps, which
         enable a SNKRDUNK-style time-series chart and accurate "last 3 sold" averaging
         for rare grades like PSA 10.
      2. Otherwise (or if /sale-prices returns nothing useful), fall back to the
         public `/used-listings` feed, ordered by listing id.

    Returns the raw `sales_by_grade` dict so callers can persist the underlying
    transactions (Trading History panel) without re-fetching from SNKRDUNK.
    """
    needed_grades = ALLOWED_GRADE_NAMES
    sales_by_grade: Dict[str, List[Dict[str, Any]]] = {}

    # Try the authenticated endpoint first. `None` means auth not configured or the
    # request failed; an empty dict means it succeeded but returned no rows.
    auth_result = fetch_sale_prices_authenticated(
        snkrdunk_id, session=session, needed_grades=needed_grades
    )
    if auth_result:
        sales_by_grade = auth_result

    # Always supplement with public used-listings so grades the auth endpoint missed
    # still surface in the Trading History.
    public_result = fetch_sold_listings(snkrdunk_id, needed_grades=needed_grades, session=session)
    for grade, rows in public_result.items():
        if grade not in sales_by_grade or not sales_by_grade[grade]:
            sales_by_grade[grade] = rows

    if not sales_by_grade:
        return {}

    for grade_name, sales in list(sales_by_grade.items()):
        if grade_name == PRICE_CHART_POINTS_KEY:
            continue
        sales_by_grade[grade_name] = _filter_price_outlier_sales(snkrdunk_id, grade_name, sales)

    by_name = {entry.get("condition_name"): entry for entry in conditions}
    for grade_name, sales in sales_by_grade.items():
        if grade_name == PRICE_CHART_POINTS_KEY:
            continue
        prices = [float(s["price"]) for s in sales if isinstance(s.get("price"), (int, float))]
        if not prices:
            continue
        avg_price = round(sum(prices) / len(prices), 2)
        currency = sales[0].get("currency") or "USD"
        entry = by_name.get(grade_name)
        if entry is None:
            # Build a synthetic condition row so the UI can display the sold-average
            # for grades that have recent sales but no current active listings.
            sort_order = CONDITION_SORT_ORDER.get(grade_name, 500)
            condition_id_lookup = {
                "A": 18, "B": 19, "C": 20, "D": 21, "PSA 10": 22,
            }
            entry = {
                "condition_id": condition_id_lookup.get(grade_name, sort_order),
                "condition_name": grade_name,
                "sort_order": sort_order,
            }
            conditions.append(entry)

        entry["min_price"] = avg_price
        entry["min_price_format"] = f"US ${int(round(avg_price))}"
        entry["price_source"] = PRICE_SOURCE_SOLD_AVG
        entry["sales_count"] = len(prices)
        entry["currency"] = currency

    return sales_by_grade


# Cap how many sold rows we persist per card so the trading-history table stays bounded.
SALE_EVENTS_PER_CARD = 25


def _replace_sale_events(
    db: Session,
    card: Card,
    sales_by_grade: Dict[str, List[Dict[str, Any]]],
    now: datetime,
) -> None:
    """Replace the card's stored Trading History rows with the latest fetched sold
    listings (newest by listing_id). Stays bounded by `SALE_EVENTS_PER_CARD`.
    """
    db.query(CardSaleEvent).filter(CardSaleEvent.card_id == card.id).delete(synchronize_session=False)
    db.flush()
    if not sales_by_grade:
        return

    flattened: List[Dict[str, Any]] = []
    for grade_name, rows in sales_by_grade.items():
        if grade_name == PRICE_CHART_POINTS_KEY:
            continue
        for row in rows:
            if not isinstance(row.get("price"), (int, float)):
                continue
            listing_id = int(row.get("listing_id") or 0)
            if not listing_id:
                stable_key = "|".join(
                    [
                        str(grade_name),
                        str(row["price"]),
                        str(row.get("sold_at") or ""),
                        str(row.get("listing_uid") or ""),
                    ]
                )
                # Authenticated sale-price rows can omit listing ids. The DB has
                # a unique (card_id, listing_id) constraint, so assign a stable
                # negative synthetic id instead of saving every auth-only row as 0.
                listing_id = -int(hashlib.sha1(stable_key.encode("utf-8")).hexdigest()[:12], 16)
            flattened.append(
                {
                    "listing_id": listing_id,
                    "listing_uid": row.get("listing_uid"),
                    "condition_name": grade_name,
                    "price": float(row["price"]),
                    "currency": (row.get("currency") or "USD").upper(),
                    "price_format": row.get("price_format"),
                    "thumbnail_url": row.get("thumbnail_url"),
                    # Real sold-at timestamp from the authenticated endpoint (or None
                    # when only the public feed is available).
                    "sold_at": row.get("sold_at"),
                }
            )
    # Order newest-first using the best signal we have: real sold_at when present,
    # listing_id otherwise.
    flattened.sort(
        key=lambda r: (r.get("sold_at") or datetime.min, r.get("listing_id") or 0),
        reverse=True,
    )
    seen_listing_ids: set[int] = set()
    for row in flattened[:SALE_EVENTS_PER_CARD]:
        if row["listing_id"] in seen_listing_ids:
            continue
        seen_listing_ids.add(row["listing_id"])
        db.add(
            CardSaleEvent(
                card_id=card.id,
                listing_id=row["listing_id"],
                listing_uid=row["listing_uid"],
                condition_name=row["condition_name"],
                price=row["price"],
                currency=row["currency"],
                price_format=row["price_format"],
                thumbnail_url=row["thumbnail_url"],
                # Use the real sold timestamp when we have it so the chart and the
                # Trading History table show actual sale dates. Falls back to the
                # sync time when only public data is available.
                captured_at=row.get("sold_at") or now,
            )
        )


def _replace_condition_prices(db: Session, card: Card, conditions: List[Dict[str, Any]], now: datetime) -> None:
    """Reset the card's condition prices to match the latest SNKRDUNK response.

    The unique (card_id, condition_id) constraint requires we flush deletes before
    inserting fresh rows that may reuse the same condition_id values.
    """
    db.query(CardConditionPrice).filter(CardConditionPrice.card_id == card.id).delete(synchronize_session=False)
    db.flush()
    for entry in conditions:
        db.add(
            CardConditionPrice(
                card_id=card.id,
                condition_id=entry["condition_id"],
                condition_name=entry["condition_name"],
                min_price=entry.get("min_price"),
                min_price_format=entry.get("min_price_format"),
                currency=entry.get("currency") or "USD",
                sort_order=entry.get("sort_order", 500),
                last_updated=now,
                price_source=entry.get("price_source") or PRICE_SOURCE_LISTING,
                sales_count=int(entry.get("sales_count") or 0),
            )
        )


def _select_default_price(
    conditions: List[Dict[str, Any]],
    fallback_price: Optional[float],
    fallback_currency: str,
) -> Dict[str, Any]:
    """Return the price/grade to display by default, preferring PSA 10.

    Always returns a dict with `price`, `currency`, `condition_id`, `condition_name`
    so price history rows can record which grade they describe.
    """
    psa10 = next(
        (c for c in conditions if c.get("condition_name") == DEFAULT_CONDITION_NAME and c.get("min_price") is not None),
        None,
    )
    chosen = psa10
    if chosen is None:
        priced = [c for c in conditions if c.get("min_price") is not None]
        if priced:
            chosen = min(priced, key=lambda c: c["min_price"])

    if chosen:
        return {
            "price": chosen["min_price"],
            "currency": chosen.get("currency") or "USD",
            "condition_id": chosen.get("condition_id"),
            "condition_name": chosen.get("condition_name"),
        }
    return {
        "price": fallback_price,
        "currency": fallback_currency,
        "condition_id": None,
        "condition_name": None,
    }


def upsert_cards(
    db: Session,
    products: List[Dict[str, Any]],
    clear_stale_ranks: bool = False,
    fetch_conditions: bool = True,
) -> int:
    synced = 0
    now = datetime.utcnow()
    incoming_keys = {
        (str(product.get("snkrdunk_id")) if product.get("snkrdunk_id") else product["product_url"])
        for product in products
    }

    if clear_stale_ranks:
        stale_cards = db.query(Card).filter(Card.popularity_rank.is_not(None)).all()
        for card in stale_cards:
            if (card.snkrdunk_id or card.product_url) not in incoming_keys:
                card.popularity_rank = None

    # Persist long syncs in small chunks. Previously a 350/500-card run fetched
    # every card detail first and only then started writing, so the website kept
    # serving stale DB rows for a long time and a mid-sync SNKRDUNK failure could
    # leave almost nothing fresh. Chunking keeps the existing per-card write logic
    # but makes each completed batch visible immediately.
    batch_size = max(1, DEFAULT_SYNC_PERSIST_BATCH_SIZE)
    if fetch_conditions and len(products) > batch_size:
        total_synced = 0
        for start in range(0, len(products), batch_size):
            batch = products[start : start + batch_size]
            total_synced += upsert_cards(
                db,
                batch,
                clear_stale_ranks=False,
                fetch_conditions=True,
            )
            logger.info(
                "batch sync progress: %s/%s cards persisted",
                min(start + len(batch), len(products)),
                len(products),
            )
        return total_synced

    # Phase 1: fetch per-card SNKRDUNK data in parallel. The HTTP work (condition
    # prices + paginated sold listings) dominates wall-time, but each card uses its
    # own thread-local requests.Session so they can run concurrently. Only DB writes
    # happen on the main thread (Phase 2) to keep SQLAlchemy/SQLite single-threaded.
    fetch_workers = DEFAULT_SYNC_FETCH_WORKERS

    def _fetch_one(product: Dict[str, Any]) -> Dict[str, Any]:
        snkrdunk_id = product.get("snkrdunk_id")
        if not (fetch_conditions and snkrdunk_id):
            return {"product": product, "conditions": [], "sales_by_grade": {}}
        local_session = _session()
        try:
            conditions = fetch_condition_prices(str(snkrdunk_id), session=local_session) or []
            sales_by_grade: Dict[str, List[Dict[str, Any]]] = {}
            sales_by_grade = _enrich_with_sold_avg(
                str(snkrdunk_id), conditions, session=local_session
            )
            return {"product": product, "conditions": conditions, "sales_by_grade": sales_by_grade}
        except SnkrdunkTemporaryBlock as exc:
            logger.warning("per-card fetch paused for snkrdunk_id=%s: %s", snkrdunk_id, exc)
            return {"product": product, "conditions": [], "sales_by_grade": {}, "blocked": True}
        except Exception as exc:  # noqa: BLE001 — never let one card crash the batch
            logger.warning("per-card fetch failed for snkrdunk_id=%s: %s", snkrdunk_id, exc)
            return {"product": product, "conditions": [], "sales_by_grade": {}, "error": exc}
        finally:
            local_session.close()

    fetched_results: List[Dict[str, Any]] = []
    if fetch_conditions:
        with ThreadPoolExecutor(max_workers=fetch_workers) as pool:
            futures = {pool.submit(_fetch_one, product): product for product in products}
            for future in as_completed(futures):
                fetched_results.append(future.result())
                if len(fetched_results) % 25 == 0:
                    logger.info(
                        "fetch progress: %s/%s cards fetched",
                        len(fetched_results),
                        len(products),
                    )
    else:
        fetched_results = [{"product": p, "conditions": [], "sales_by_grade": {}} for p in products]

    # Phase 2: persist results sequentially. Reorder back to the original popularity
    # rank so card creation order is stable across runs.
    fetched_by_key = {
        (
            str(r["product"].get("snkrdunk_id"))
            if r["product"].get("snkrdunk_id")
            else r["product"]["product_url"]
        ): r
        for r in fetched_results
    }

    try:
        for product in products:
            key = str(product["snkrdunk_id"]) if product.get("snkrdunk_id") else product["product_url"]
            result = fetched_by_key.get(key) or {"product": product, "conditions": [], "sales_by_grade": {}}
            conditions = result["conditions"]
            sales_by_grade = result["sales_by_grade"]

            card = (
                db.query(Card)
                .filter(or_(Card.snkrdunk_id == product["snkrdunk_id"], Card.product_url == product["product_url"]))
                .first()
            )
            if card is None:
                card = Card(snkrdunk_id=product["snkrdunk_id"], product_url=product["product_url"], name=product["name"])
                db.add(card)
                db.flush()

            if conditions:
                _replace_condition_prices(db, card, conditions, now)
                _replace_sale_events(db, card, sales_by_grade, now)

            default = _select_default_price(
                conditions,
                product.get("current_price"),
                product.get("currency") or "JPY",
            )
            current_price = default["price"]
            currency = default["currency"]

            previous_price = card.current_price
            card.name = product["name"]
            card.image_url = product.get("image_url")
            card.current_price = current_price
            card.currency = currency
            card.popularity_rank = product.get("popularity_rank")
            card.last_updated = now

            # Record one snapshot per available grade so users can chart any condition over time.
            tracked: List[tuple[Optional[int], Optional[str], Optional[float], str]] = []
            if conditions:
                for entry in conditions:
                    if entry.get("min_price") is None:
                        continue
                    tracked.append(
                        (
                            entry.get("condition_id"),
                            entry.get("condition_name"),
                            float(entry["min_price"]),
                            entry.get("currency") or "USD",
                        )
                    )

            if not tracked and (current_price is not None or previous_price != current_price):
                tracked.append((default.get("condition_id"), default.get("condition_name"), current_price, currency))

            for cond_id, cond_name, price_value, price_currency in tracked:
                db.add(
                    PriceHistory(
                        card=card,
                        price=price_value,
                        currency=price_currency,
                        captured_at=now,
                        condition_id=cond_id,
                        condition_name=cond_name,
                    )
                )

            # When we have authenticated sale data with real timestamps, write each
            # individual sale into PriceHistory so the chart shows a real SNKRDUNK-
            # style timeline instead of a couple of sync snapshots. We dedupe by
            # (condition_name, price, captured_at) so repeated syncs don't pile up.
            if sales_by_grade:
                grade_to_id = {
                    entry["condition_name"]: entry.get("condition_id")
                    for entry in conditions
                }
                existing_keys = {
                    (h.condition_name, float(h.price or 0.0), h.captured_at)
                    for h in card.price_history
                    if h.captured_at is not None
                }
                chart_points = sales_by_grade.get(PRICE_CHART_POINTS_KEY) or []
                chart_condition_id = grade_to_id.get(PRICE_CHART_GRADE_NAME, 22)
                for point in chart_points:
                    sold_at = point.get("sold_at")
                    if not sold_at:
                        continue
                    price_val = float(point.get("price") or 0.0)
                    if not price_val:
                        continue
                    key = (PRICE_CHART_GRADE_NAME, price_val, sold_at)
                    if key in existing_keys:
                        continue
                    existing_keys.add(key)
                    db.add(
                        PriceHistory(
                            card=card,
                            price=price_val,
                            currency=(point.get("currency") or "USD").upper(),
                            captured_at=sold_at,
                            condition_id=chart_condition_id,
                            condition_name=PRICE_CHART_GRADE_NAME,
                        )
                    )
                for grade_name, sales in sales_by_grade.items():
                    if grade_name == PRICE_CHART_POINTS_KEY:
                        continue
                    cid_int = grade_to_id.get(grade_name)
                    for sale in sales:
                        sold_at = sale.get("sold_at")
                        if not sold_at:
                            continue  # only write timestamped rows here
                        price_val = float(sale.get("price") or 0.0)
                        if not price_val:
                            continue
                        key = (grade_name, price_val, sold_at)
                        if key in existing_keys:
                            continue
                        existing_keys.add(key)
                        db.add(
                            PriceHistory(
                                card=card,
                                price=price_val,
                                currency=(sale.get("currency") or "USD").upper(),
                                captured_at=sold_at,
                                condition_id=cid_int,
                                condition_name=grade_name,
                            )
                        )

            synced += 1
            # Commit after every card so progress is durable, the API serves
            # partial results during long syncs, and a transient failure later
            # in the loop doesn't roll back the whole batch.
            db.commit()
            if synced % 25 == 0:
                logger.info("sync progress: %s/%s cards persisted", synced, len(products))
    except Exception:
        db.rollback()
        raise

    db.commit()
    return synced


def import_cards(products: List[Dict[str, Any]], db: Optional[Session] = None) -> int:
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True

    try:
        normalized = []
        for rank, product in enumerate(products, start=1):
            item = dict(product)
            item["snkrdunk_id"] = item.get("snkrdunk_id") or item["product_url"]
            item["currency"] = (item.get("currency") or "USD").upper()
            item["popularity_rank"] = item.get("popularity_rank") or rank
            normalized.append(item)
        return upsert_cards(db, normalized, fetch_conditions=False)
    except Exception:
        logger.exception("Manual card import failed")
        db.rollback()
        return 0
    finally:
        if close_db:
            db.close()


def refresh_single_card(snkrdunk_id: str, db: Optional[Session] = None) -> bool:
    """Force-refresh prices for a single already-tracked card.

    Used by the card-detail endpoint to deliver near-realtime prices the moment
    a user opens a card page, without needing to wait for the next bulk sync.
    Returns True on success, False if the card isn't tracked or the fetch fails.
    """
    if not snkrdunk_id:
        return False
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True

    try:
        card = db.query(Card).filter(Card.snkrdunk_id == str(snkrdunk_id)).first()
        if card is None:
            return False
        product = {
            "snkrdunk_id": card.snkrdunk_id,
            "name": card.name,
            "image_url": card.image_url,
            "product_url": card.product_url,
            "current_price": card.current_price,
            "currency": card.currency or "JPY",
            "popularity_rank": card.popularity_rank,
        }
        synced = upsert_cards(db, [product], clear_stale_ranks=False, fetch_conditions=True)
        return bool(synced)
    except Exception:
        logger.exception("refresh_single_card failed for %s", snkrdunk_id)
        db.rollback()
        return False
    finally:
        if close_db:
            db.close()


def _existing_card_products(db: Session, limit: int) -> List[Dict[str, Any]]:
    """Build sync input from cards already stored locally.

    SNKRDUNK's public catalog endpoint is more aggressively blocked than the
    per-card endpoints. When the catalog is unavailable, refreshing existing
    card IDs is still useful: prices get fresher and the UI no longer sits at an
    old "last updated" timestamp just because discovery failed.
    """
    cards = (
        db.query(Card)
        .filter(Card.snkrdunk_id.is_not(None))
        .order_by(Card.popularity_rank.is_(None), Card.popularity_rank.asc(), Card.id.asc())
        .limit(limit)
        .all()
    )
    products: List[Dict[str, Any]] = []
    for card in cards:
        products.append(
            {
                "snkrdunk_id": card.snkrdunk_id,
                "name": card.name,
                "image_url": card.image_url,
                "product_url": card.product_url,
                "current_price": card.current_price,
                "currency": card.currency or "JPY",
                "popularity_rank": card.popularity_rank,
            }
        )
    return products


def sync_top_pokemon_cards(limit: int = DEFAULT_TRACKED_CARD_LIMIT, db: Optional[Session] = None) -> int:
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True

    try:
        products = fetch_top_pokemon_cards(limit)
        if not products:
            products = _existing_card_products(db, limit)
            if not products:
                logger.warning("SNKRDUNK sync completed with no extractable products")
                return 0
            logger.warning(
                "SNKRDUNK catalog returned no products; refreshing %s existing stored card(s) instead",
                len(products),
            )
            return upsert_cards(db, products, clear_stale_ranks=False)
        return upsert_cards(db, products, clear_stale_ranks=True)
    except Exception:
        logger.exception("SNKRDUNK sync failed")
        db.rollback()
        return 0
    finally:
        if close_db:
            db.close()
