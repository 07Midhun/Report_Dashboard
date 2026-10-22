@echo off
title Schnell Ward-Wise Pole Management Dashboard Launcher
echo ===================================================================
echo     Schnell Ward-Wise Pole Management Dashboard Launcher
echo ===================================================================
echo.

cd /d "D:\SCHNELL\Dashboard"

echo [1/3] Checking and starting PostgreSQL 18...
"D:\SCHNELL\postgresql-18.6-5-windows-x64-binaries\pgsql\bin\pg_isready.exe" -h 127.0.0.1 -p 5432 >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Starting PostgreSQL server...
    start "PostgreSQL Server" /min "D:\SCHNELL\postgresql-18.6-5-windows-x64-binaries\pgsql\bin\pg_ctl.exe" -D "D:\SCHNELL\postgresql-18.6-5-windows-x64-binaries\pgsql\data" -l "D:\SCHNELL\postgresql-18.6-5-windows-x64-binaries\pgsql\data\server.log" start
    timeout /t 3 /nobreak >nul
) else (
    echo PostgreSQL is already active and accepting connections on port 5432.
)

echo.
echo [2/3] Starting FastAPI Backend on http://127.0.0.1:8000 ...
start "Schnell Backend (Port 8000)" cmd /k "cd /d D:\SCHNELL\Dashboard && python run_server.py"

echo.
echo [3/3] Starting Vite Frontend on http://localhost:5173 ...
start "Schnell Frontend (Port 5173)" cmd /k "cd /d D:\SCHNELL\Dashboard\frontend && npm run dev"

timeout /t 3 /nobreak >nul
echo.
echo ===================================================================
echo   All services launched! Opening Dashboard in your browser...
echo   Frontend URL : http://localhost:5173
echo   Swagger Docs : http://127.0.0.1:8000/docs
echo.
echo   Default Credentials:
echo     Administrator: admin / Admin@12345
echo     Operator     : operator / User@12345
echo ===================================================================
start http://localhost:5173
pause
