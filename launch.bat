@echo off
echo ========================================
echo    Sentiment Analysis System
echo    (Quick Launch)
echo ========================================
echo.

REM Activate virtual environment and start server
call .venv\Scripts\activate.bat && uvicorn backend.app:app --host 0.0.0.0 --port 8000 --reload

echo.
echo Server stopped. Press any key to exit...
pause >nul
