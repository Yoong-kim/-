"""Default Korean news RSS sources loaded on first run."""

# Google News RSS는 지역/언어 설정으로 한국 뉴스를 안정적으로 제공합니다.
# 직접 언론사 RSS는 서버 차단 여부에 따라 동작이 다를 수 있으니
# 관리 화면에서 추가/제거 가능합니다.

DEFAULT_SOURCES = [
    # ── Google News (안정적, 한국어) ────────────────────────────────
    {
        "name": "Google 뉴스 - 헤드라인",
        "url": "https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko",
        "category": "종합",
    },
    {
        "name": "Google 뉴스 - 기술",
        "url": "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtdHZHZ0pMVWlnQVAB?hl=ko&gl=KR&ceid=KR:ko",
        "category": "IT/기술",
    },
    {
        "name": "Google 뉴스 - 비즈니스",
        "url": "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtdHZHZ0pMVWlnQVAB?hl=ko&gl=KR&ceid=KR:ko",
        "category": "경제",
    },
    {
        "name": "Google 뉴스 - 과학",
        "url": "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp0Y1RjU0FtdHZHZ0pMVWlnQVAB?hl=ko&gl=KR&ceid=KR:ko",
        "category": "과학",
    },
    {
        "name": "Google 뉴스 - 세계",
        "url": "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp1ZEdvU0FtdHZHZ0pMVWlnQVAB?hl=ko&gl=KR&ceid=KR:ko",
        "category": "해외",
    },
    {
        "name": "Google 뉴스 - 스포츠",
        "url": "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNREp1ZEdvU0FtdHZHZ0pMVWlnQVAB?hl=ko&gl=KR&ceid=KR:ko",
        "category": "스포츠",
    },
    # ── 직접 언론사 RSS (성공률은 환경에 따라 다름) ─────────────────
    {"name": "연합뉴스", "url": "https://www.yna.co.kr/rss/news.xml", "category": "종합"},
    {"name": "한겨레", "url": "https://www.hani.co.kr/rss/", "category": "정치/사회"},
    {"name": "경향신문", "url": "https://www.khan.co.kr/rss/rssdata/total_news.xml", "category": "정치/사회"},
    {"name": "매일경제", "url": "https://www.mk.co.kr/rss/30000001/", "category": "경제"},
    {"name": "한국경제", "url": "https://www.hankyung.com/feed/all-news", "category": "경제"},
    {"name": "ZDNet Korea", "url": "https://www.zdnet.co.kr/rss/rss.asp", "category": "IT/기술"},
    {"name": "전자신문", "url": "https://www.etnews.com/rss/allArticle.xml", "category": "IT/기술"},
    # ── 해외 (영문) ──────────────────────────────────────────────────
    {"name": "BBC News", "url": "https://feeds.bbci.co.uk/news/rss.xml", "category": "해외"},
    {"name": "TechCrunch", "url": "https://techcrunch.com/feed/", "category": "IT/기술"},
    {"name": "The Verge", "url": "https://www.theverge.com/rss/index.xml", "category": "IT/기술"},
    {"name": "Hacker News", "url": "https://hnrss.org/frontpage", "category": "IT/기술"},
]
