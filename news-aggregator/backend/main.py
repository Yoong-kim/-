from fastapi import FastAPI, Depends, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, or_, and_
from sqlalchemy.orm import selectinload
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from contextlib import asynccontextmanager
from datetime import datetime
from pydantic import BaseModel
from typing import Optional
import os
import logging

from database import get_db, init_db
from models import Source, Article
from fetcher import fetch_all_sources, fetch_feed
from default_sources import DEFAULT_SOURCES

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s - %(message)s")
logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def scheduled_fetch():
    from database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        result = await fetch_all_sources(db)
        logger.info(f"Scheduled fetch complete: {result['total_new']} new articles")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await _seed_default_sources()

    scheduler.add_job(scheduled_fetch, "interval", minutes=30, id="news_fetch", replace_existing=True)
    scheduler.start()
    logger.info("Scheduler started (every 30 min)")

    # Initial fetch on startup
    await scheduled_fetch()

    yield

    scheduler.shutdown()


async def _seed_default_sources():
    from database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        added = 0
        for s in DEFAULT_SOURCES:
            existing = await db.scalar(select(Source.id).where(Source.url == s["url"]))
            if not existing:
                db.add(Source(**s))
                added += 1
        if added:
            await db.commit()
            logger.info(f"Seeded {added} default sources")


app = FastAPI(title="뉴스 애그리게이터", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Pydantic schemas ──────────────────────────────────────────────────────────

class SourceCreate(BaseModel):
    name: str
    url: str
    category: str = "일반"
    fetch_interval: int = 30


class SourceUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    category: Optional[str] = None
    is_active: Optional[bool] = None
    fetch_interval: Optional[int] = None


class ArticleUpdate(BaseModel):
    is_read: Optional[bool] = None
    is_bookmarked: Optional[bool] = None
    is_hidden: Optional[bool] = None
    note: Optional[str] = None


# ── Source endpoints ───────────────────────────────────────────────────────────

@app.get("/api/sources")
async def list_sources(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Source).order_by(Source.category, Source.name))
    sources = result.scalars().all()
    return [
        {
            "id": s.id,
            "name": s.name,
            "url": s.url,
            "category": s.category,
            "is_active": s.is_active,
            "last_fetched": s.last_fetched.isoformat() if s.last_fetched else None,
            "fetch_interval": s.fetch_interval,
        }
        for s in sources
    ]


@app.post("/api/sources", status_code=201)
async def create_source(body: SourceCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.scalar(select(Source.id).where(Source.url == body.url))
    if existing:
        raise HTTPException(400, "이미 등록된 URL입니다")
    source = Source(**body.model_dump())
    db.add(source)
    await db.commit()
    await db.refresh(source)
    return {"id": source.id, "name": source.name, "message": "소스가 추가되었습니다"}


@app.patch("/api/sources/{source_id}")
async def update_source(source_id: int, body: SourceUpdate, db: AsyncSession = Depends(get_db)):
    source = await db.get(Source, source_id)
    if not source:
        raise HTTPException(404, "소스를 찾을 수 없습니다")
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(source, field, val)
    await db.commit()
    return {"message": "업데이트 완료"}


@app.delete("/api/sources/{source_id}")
async def delete_source(source_id: int, db: AsyncSession = Depends(get_db)):
    source = await db.get(Source, source_id)
    if not source:
        raise HTTPException(404, "소스를 찾을 수 없습니다")
    await db.delete(source)
    await db.commit()
    return {"message": "삭제 완료"}


@app.post("/api/sources/{source_id}/fetch")
async def fetch_source_now(source_id: int, db: AsyncSession = Depends(get_db)):
    source = await db.get(Source, source_id)
    if not source:
        raise HTTPException(404, "소스를 찾을 수 없습니다")
    count = await fetch_feed(source, db)
    return {"new_articles": count, "message": f"{count}개의 새 기사를 가져왔습니다"}


@app.post("/api/fetch-all")
async def fetch_all_now(db: AsyncSession = Depends(get_db)):
    result = await fetch_all_sources(db)
    return result


# ── Article endpoints ─────────────────────────────────────────────────────────

@app.get("/api/articles")
async def list_articles(
    page: int = Query(1, ge=1),
    per_page: int = Query(30, ge=1, le=100),
    category: Optional[str] = None,
    source_id: Optional[int] = None,
    search: Optional[str] = None,
    bookmarked: Optional[bool] = None,
    unread: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
):
    conditions = [Article.is_hidden == False]

    if category:
        result = await db.execute(select(Source.id).where(Source.category == category))
        source_ids = [r[0] for r in result.all()]
        if not source_ids:
            return {"articles": [], "total": 0, "page": page, "per_page": per_page}
        conditions.append(Article.source_id.in_(source_ids))

    if source_id:
        conditions.append(Article.source_id == source_id)

    if search:
        conditions.append(
            or_(
                Article.title.ilike(f"%{search}%"),
                Article.summary.ilike(f"%{search}%"),
            )
        )

    if bookmarked is not None:
        conditions.append(Article.is_bookmarked == bookmarked)

    if unread is not None:
        conditions.append(Article.is_read == (not unread))

    total = await db.scalar(select(func.count(Article.id)).where(and_(*conditions)))

    offset = (page - 1) * per_page
    result = await db.execute(
        select(Article)
        .options(selectinload(Article.source))
        .where(and_(*conditions))
        .order_by(desc(Article.published_at.is_(None)), desc(Article.published_at), desc(Article.fetched_at))
        .offset(offset)
        .limit(per_page)
    )
    articles = result.scalars().all()

    return {
        "articles": [_article_dict(a) for a in articles],
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": max(1, (total + per_page - 1) // per_page),
    }


@app.patch("/api/articles/{article_id}")
async def update_article(article_id: int, body: ArticleUpdate, db: AsyncSession = Depends(get_db)):
    article = await db.get(Article, article_id)
    if not article:
        raise HTTPException(404, "기사를 찾을 수 없습니다")
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(article, field, val)
    await db.commit()
    return {"message": "업데이트 완료"}


@app.post("/api/articles/mark-all-read")
async def mark_all_read(
    category: Optional[str] = None,
    source_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import update as sa_update

    conditions = [Article.is_hidden == False, Article.is_read == False]
    if source_id:
        conditions.append(Article.source_id == source_id)
    elif category:
        result = await db.execute(select(Source.id).where(Source.category == category))
        source_ids = [r[0] for r in result.all()]
        conditions.append(Article.source_id.in_(source_ids))

    await db.execute(sa_update(Article).where(and_(*conditions)).values(is_read=True))
    await db.commit()
    return {"message": "모두 읽음으로 표시했습니다"}


@app.delete("/api/articles/cleanup")
async def cleanup_old_articles(
    days: int = Query(30, ge=1),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import delete as sa_delete
    from datetime import timedelta

    cutoff = datetime.utcnow() - timedelta(days=days)
    result = await db.execute(
        sa_delete(Article).where(
            and_(Article.fetched_at < cutoff, Article.is_bookmarked == False)
        )
    )
    await db.commit()
    return {"deleted": result.rowcount, "message": f"{result.rowcount}개의 오래된 기사를 삭제했습니다"}


# ── Stats ─────────────────────────────────────────────────────────────────────

@app.get("/api/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    total_articles = await db.scalar(select(func.count(Article.id)))
    unread = await db.scalar(select(func.count(Article.id)).where(Article.is_read == False, Article.is_hidden == False))
    bookmarked = await db.scalar(select(func.count(Article.id)).where(Article.is_bookmarked == True))
    total_sources = await db.scalar(select(func.count(Source.id)).where(Source.is_active == True))

    # Category counts
    cat_result = await db.execute(
        select(Source.category, func.count(Article.id).label("cnt"))
        .join(Article, Article.source_id == Source.id)
        .where(Article.is_hidden == False)
        .group_by(Source.category)
        .order_by(desc("cnt"))
    )
    categories = [{"category": r.category, "count": r.cnt} for r in cat_result.all()]

    return {
        "total_articles": total_articles,
        "unread": unread,
        "bookmarked": bookmarked,
        "active_sources": total_sources,
        "categories": categories,
    }


@app.get("/api/categories")
async def get_categories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Source.category).distinct().order_by(Source.category))
    return [r[0] for r in result.all()]


# ── Static frontend ───────────────────────────────────────────────────────────

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")

if os.path.exists(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

    @app.get("/")
    async def serve_index():
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))


# ── Helpers ───────────────────────────────────────────────────────────────────

def _article_dict(a: Article) -> dict:
    return {
        "id": a.id,
        "title": a.title,
        "url": a.url,
        "summary": a.summary,
        "image_url": a.image_url,
        "published_at": a.published_at.isoformat() if a.published_at else None,
        "fetched_at": a.fetched_at.isoformat() if a.fetched_at else None,
        "is_read": a.is_read,
        "is_bookmarked": a.is_bookmarked,
        "is_hidden": a.is_hidden,
        "note": a.note,
        "source": {
            "id": a.source.id,
            "name": a.source.name,
            "category": a.source.category,
        } if a.source else None,
    }
