#!/usr/bin/env bash
# 뉴스 애그리게이터 실행 스크립트

set -e
cd "$(dirname "$0")"

# Python 가상환경 생성 (없으면)
if [ ! -d ".venv" ]; then
  echo "📦 가상환경 생성 중..."
  python3 -m venv .venv
fi

# 가상환경 활성화
source .venv/bin/activate

# 의존성 설치
echo "📥 패키지 설치 중..."
pip install -q -r backend/requirements.txt

# 서버 실행
echo ""
echo "🚀 뉴스 애그리게이터 시작!"
echo "   브라우저에서 http://localhost:8000 으로 접속하세요"
echo "   종료: Ctrl+C"
echo ""

cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
