@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules\vite\bin\vite.js (
  echo Chua cai thu vien. Chay npm ci trong thu muc nay truoc.
  pause
  exit /b 1
)
echo Mo LABVIRT local. Khong deploy Firebase.
call npm run dev -- --host 127.0.0.1 --open
endlocal
