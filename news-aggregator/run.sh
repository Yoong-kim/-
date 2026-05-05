#!/usr/bin/env bash
# 뉴스 애그리게이터 실행 스크립트

set -e
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${NEWS_PORT:-8000}"
URL="http://localhost:$PORT"

cd "$APP_DIR"

# ── 이미 실행 중이면 브라우저만 열기 ────────────────────────────────
if curl -s --max-time 1 "$URL/api/stats" > /dev/null 2>&1; then
  echo "✅ 서버가 이미 실행 중입니다 → $URL"
  _open_browser "$URL" 2>/dev/null || true
  exit 0
fi

# ── 가상환경 생성 (최초 1회) ─────────────────────────────────────────
if [ ! -d ".venv" ]; then
  echo "📦 가상환경 생성 중..."
  python3 -m venv .venv
fi

source .venv/bin/activate

# ── 패키지 설치 ──────────────────────────────────────────────────────
echo "📥 패키지 확인 중..."
pip install -q -r backend/requirements.txt

# ── 브라우저 열기 함수 ───────────────────────────────────────────────
open_browser() {
  local url="$1"
  # 서버가 뜰 때까지 최대 15초 대기
  for i in $(seq 1 15); do
    if curl -s --max-time 1 "$url/api/stats" > /dev/null 2>&1; then
      # 환경별 브라우저 열기
      if command -v xdg-open &>/dev/null; then
        xdg-open "$url" &
      elif command -v open &>/dev/null; then
        open "$url" &
      elif command -v wslview &>/dev/null; then
        wslview "$url" &
      elif [ -n "$BROWSER" ]; then
        $BROWSER "$url" &
      fi
      return 0
    fi
    sleep 1
  done
}

# ── 서버 실행 ────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════╗"
echo "║     📰 뉴스 애그리게이터 시작!      ║"
echo "╠══════════════════════════════════════╣"
echo "║  주소: $URL"
echo "║  종료: Ctrl+C"
echo "╚══════════════════════════════════════╝"
echo ""

# 백그라운드에서 브라우저 자동 오픈
open_browser "$URL" &

cd backend
exec uvicorn main:app --host 0.0.0.0 --port "$PORT"
