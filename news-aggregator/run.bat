@echo off
chcp 65001 >nul
title 뉴스 애그리게이터

set PORT=8000
set URL=http://localhost:%PORT%

cd /d "%~dp0"

REM ── 이미 실행 중이면 브라우저만 열기 ──────────────────────────────
curl -s --max-time 1 %URL%/api/stats >nul 2>&1
if %errorlevel%==0 (
    echo 이미 실행 중입니다. 브라우저를 엽니다...
    start %URL%
    exit /b 0
)

REM ── Python 확인 ────────────────────────────────────────────────────
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [오류] Python이 설치되어 있지 않습니다.
    echo.
    echo 아래 주소에서 Python을 설치하세요:
    echo https://www.python.org/downloads/
    echo.
    echo 설치 시 "Add Python to PATH" 반드시 체크!
    echo.
    pause
    exit /b 1
)

REM ── 가상환경 생성 (최초 1회) ───────────────────────────────────────
if not exist ".venv" (
    echo 가상환경 생성 중...
    python -m venv .venv
)

REM ── 패키지 설치 ────────────────────────────────────────────────────
echo 패키지 확인 중...
call .venv\Scripts\activate.bat
pip install -q -r backend\requirements.txt

REM ── 브라우저 자동 오픈 (백그라운드) ───────────────────────────────
start /b cmd /c "timeout /t 8 /nobreak >nul && start %URL%"

REM ── 서버 실행 ──────────────────────────────────────────────────────
echo.
echo ╔══════════════════════════════════════╗
echo ║     뉴스 애그리게이터 시작!          ║
echo ╠══════════════════════════════════════╣
echo ║  주소: %URL%
echo ║  종료: 이 창을 닫거나 Ctrl+C
echo ╚══════════════════════════════════════╝
echo.

cd backend
python -m uvicorn main:app --host 0.0.0.0 --port %PORT%

pause
