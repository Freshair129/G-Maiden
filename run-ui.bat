@echo off
setlocal EnableExtensions

REM ============================================================
REM  Script: run-ui.bat
REM  Purpose: Open G-Maiden UI for local review.
REM ============================================================

cd /d "%~dp0"

if /i "%~1"=="--help" goto :usage
if /i "%~1"=="-h" goto :usage
if /i "%~1"=="/?" goto :usage
if /i "%~1"=="--dev" goto :run_dev
if /i "%~1"=="--build-exe" goto :build_exe
if /i "%~1"=="--exe" goto :run_exe
if not "%~1"=="" (
  echo ERROR: unknown option "%~1" 1>&2
  echo.
  goto :usage
)

goto :run_exe

:run_exe
set "_EXE=G:\G-Maiden-gh-build\src-tauri\target\release\g-maiden.exe"
if exist "%_EXE%" goto :open_exe

set "_EXE=%~dp0src-tauri\target\release\g-maiden.exe"
if exist "%_EXE%" goto :open_exe

echo [G-Maiden] No built exe found.
echo [G-Maiden] Falling back to dev UI. Use --build-exe to build first.
echo.
goto :run_dev

:open_exe
echo [G-Maiden] Opening UI:
echo %_EXE%
start "" "%_EXE%"
exit /b 0

:run_dev
echo [G-Maiden] Starting dev UI: pnpm tauri dev
call pnpm tauri dev
if errorlevel 1 (
  echo.
  echo [G-Maiden] Dev UI exited with an error.
  echo If dependencies are missing, run: pnpm install ^& pnpm -C src install
  pause
  exit /b 1
)
exit /b 0

:build_exe
echo [G-Maiden] Building local exe, then opening UI.
call pnpm build
if errorlevel 1 (
  echo.
  echo [G-Maiden] Build returned an error.
  echo Note: local signing can fail without TAURI_SIGNING_PRIVATE_KEY, but the exe may still exist.
)
goto :run_exe

:usage
echo Usage: %~nx0 [--exe ^| --dev ^| --build-exe]
echo.
echo Options:
echo   --exe        Open the latest built exe. This is the default.
echo   --dev        Run pnpm tauri dev for live UI review.
echo   --build-exe  Build local exe, then open it if available.
echo   --help       Show this help.
exit /b 0
