@echo off
echo Stopping PostgreSQL server...
"D:\SCHNELL\postgresql-18.6-5-windows-x64-binaries\pgsql\bin\pg_ctl.exe" -D "D:\SCHNELL\postgresql-18.6-5-windows-x64-binaries\pgsql\data" stop -m fast
pause
