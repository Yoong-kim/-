import feedparser
import httpx
import asyncio
import logging
from datetime import datetime, timezone
from bs4 import BeautifulSoup
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models import Source, Article

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
}


def _parse_date(entry) -> datetime | None:
    for attr in ("published_parsed", "updated_parsed"):
        val = getattr(entry, attr, None)
        if val:
            try:
                return datetime(*val[:6], tzinfo=timezone.utc).replace(tzinfo=None)
            except Exception:
                pass
    return None


def _extract_image(entry) -> str | None:
    # Try media:content
    media = getattr(entry, "media_content", None)
    if media and isinstance(media, list) and media[0].get("url"):
        return media[0]["url"]
    # Try enclosures
    enclosures = getattr(entry, "enclosures", None)
    if enclosures:
        for enc in enclosures:
            if enc.get("type", "").startswith("image"):
                return enc.get("url")
    # Try parsing summary HTML for img tag
    summary = getattr(entry, "summary", "") or ""
    if "<img" in summary:
        try:
            soup = BeautifulSoup(summary, "lxml")
            img = soup.find("img")
            if img and img.get("src"):
                return img["src"]
        except Exception:
            pass
    return None


def _clean_summary(text: str | None) -> str:
    if not text:
        return ""
    try:
        soup = BeautifulSoup(text, "lxml")
        return soup.get_text(separator=" ", strip=True)[:500]
    except Exception:
        return text[:500]


async def fetch_feed(source: Source, db: AsyncSession) -> int:
    """Fetch RSS feed for a source and save new articles. Returns count of new articles."""
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True, headers=HEADERS) as client:
            resp = await client.get(source.url)
            resp.raise_for_status()
            content = resp.content
    except Exception as e:
        logger.warning(f"[{source.name}] HTTP fetch failed: {e}")
        return 0

    try:
        feed = feedparser.parse(content)
    except Exception as e:
        logger.warning(f"[{source.name}] Parse failed: {e}")
        return 0

    new_count = 0
    for entry in feed.entries:
        url = getattr(entry, "link", None)
        title = getattr(entry, "title", None)
        if not url or not title:
            continue

        # Check duplicate
        existing = await db.scalar(select(Article.id).where(Article.url == url))
        if existing:
            continue

        summary_raw = getattr(entry, "summary", None) or getattr(entry, "description", None)
        article = Article(
            source_id=source.id,
            title=title.strip(),
            url=url,
            summary=_clean_summary(summary_raw),
            image_url=_extract_image(entry),
            published_at=_parse_date(entry),
        )
        db.add(article)
        new_count += 1

    source.last_fetched = datetime.utcnow()
    await db.commit()
    logger.info(f"[{source.name}] Fetched {new_count} new articles")
    return new_count


async def fetch_all_sources(db: AsyncSession) -> dict:
    result = await db.execute(select(Source).where(Source.is_active == True))
    sources = result.scalars().all()

    total_new = 0
    results = {}
    for source in sources:
        count = await fetch_feed(source, db)
        results[source.name] = count
        total_new += count

    return {"total_new": total_new, "per_source": results}
