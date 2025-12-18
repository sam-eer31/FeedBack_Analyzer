@echo off
echo ========================================
echo    Sentiment Analysis System
echo ========================================
echo.

REM Check if virtual environment exists
if not exist ".venv" (
    echo Creating virtual environment...
    python -m venv .venv
)

REM Activate virtual environment
echo Activating virtual environment...
call .venv\Scripts\activate.bat

REM Install dependencies if requirements.txt exists
if exist "requirements.txt" (
    echo Installing dependencies...
    pip install -r requirements.txt
)

REM Setup completed
echo Setup completed. 
echo Now run launch.bat to start the server
echo Press any key to exit...
pause >nul
