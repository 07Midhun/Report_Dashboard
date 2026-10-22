@echo off
echo Starting local PostgreSQL server...
"D:\SCHNELL\postgresql-18.6-5-windows-x64-binaries\pgsql\bin\pg_ctl.exe" -D "D:\SCHNELL\postgresql-18.6-5-windows-x64-binaries\pgsql\data" -l "D:\SCHNELL\postgresql-18.6-5-windows-x64-binaries\pgsql\data\server.log" start
"D:\SCHNELL\postgresql-18.6-5-windows-x64-binaries\pgsql\bin\pg_isready.exe" -h 127.0.0.1 -p 5432
if %ERRORLEVEL% EQU 0 (
    echo PostgreSQL is running and ready on port 5432!
) else (
    echo Failed to start PostgreSQL. Check D:\SCHNELL\postgresql-18.6-5-windows-x64-binaries\pgsql\data\server.log
)
pause
