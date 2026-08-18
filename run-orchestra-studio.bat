@echo off
echo [G-Orchestra Studio] Starting Orchestrator Backend (Port 4577) & Vite Frontend (Port 5599)...
echo.
start "G-Orchestra Backend" cmd /k "cd orchestration && node server.mjs"
start "G-Orchestra Studio Frontend" cmd /k "cd orchestration/studio && pnpm run dev"
echo [G-Orchestra Studio] Backend and Frontend started in separate windows.
echo - Backend: http://localhost:4577
echo - Frontend: http://localhost:5599
echo.
pause
