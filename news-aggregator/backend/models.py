from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class Source(Base):
    __tablename__ = "sources"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    url = Column(String(500), nullable=False, unique=True)
    category = Column(String(100), default="일반")
    is_active = Column(Boolean, default=True)
    last_fetched = Column(DateTime, nullable=True)
    fetch_interval = Column(Integer, default=30)  # minutes
    created_at = Column(DateTime, default=datetime.utcnow)

    articles = relationship("Article", back_populates="source", cascade="all, delete-orphan")


class Article(Base):
    __tablename__ = "articles"

    id = Column(Integer, primary_key=True, index=True)
    source_id = Column(Integer, ForeignKey("sources.id"), nullable=False)
    title = Column(String(500), nullable=False)
    url = Column(String(1000), nullable=False, unique=True)
    summary = Column(Text, nullable=True)
    image_url = Column(String(1000), nullable=True)
    published_at = Column(DateTime, nullable=True)
    fetched_at = Column(DateTime, default=datetime.utcnow)
    is_read = Column(Boolean, default=False)
    is_bookmarked = Column(Boolean, default=False)
    is_hidden = Column(Boolean, default=False)
    note = Column(Text, nullable=True)  # user annotation

    source = relationship("Source", back_populates="articles")
