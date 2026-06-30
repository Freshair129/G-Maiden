@echo off
REM Run G-Maiden in dev mode (hot-reload) to check UI/settings changes.
REM Build is unsigned — local smoke-testing only, does not reach users.
cd /d "%~dp0"
echo [G-Maiden] starting dev (pnpm tauri dev)...
call pnpm tauri dev
if errorlevel 1 (
  echo.
  echo [G-Maiden] dev exited with an error. If deps are missing, run: pnpm install
  pause
)
