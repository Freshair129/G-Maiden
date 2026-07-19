@echo off
REM G-Signal Latency GATE P3 — run both latency_harness (headless) and latency_live
REM (on-device probes) in sequence, with clear exit-code handling.
REM
REM Exit codes:
REM   0 = PASS (both measured hops met latency budgets, SKIPs count as success)
REM   1 = FAIL (at least one measured hop exceeded its budget)
REM   77 = SKIP (prerequisites missing; the gate meaningfully cannot run)

setlocal enabledelayedexpansion

echo.
echo =================================================================
echo  G-Signal Latency GATE P3   run_gate_p3.bat
echo =================================================================
echo.

REM --- Phase 1: headless latency_harness (GATE P3 core) ---
echo Phase 1: Headless harness (hops 2-5 wired, hops 1/6 budgeted)
echo.
"%USERPROFILE%\.cargo\bin\cargo.exe" run --release --manifest-path "%~dp0Cargo.toml" --bin latency_harness
set /a HARNESS_EXIT=%ERRORLEVEL%

if %HARNESS_EXIT% EQU 77 (
  echo.
  echo [latency_harness] SKIPPED — model/fixtures not found.
  echo Proceeding to latency_live for context...
  echo.
) else if %HARNESS_EXIT% EQU 1 (
  echo.
  echo [latency_harness] FAILED — measured hops exceeded latency budget.
  echo.
) else (
  echo.
  echo [latency_harness] PASSED
  echo.
)

REM --- separator ---
echo.
echo -----------------------------------------------------------------
echo.

REM --- Phase 2: live probes (latency_live, hops 1/6 on real device) ---
echo Phase 2: Live probes (hops 1/6 on this machine — requires display/audio)
echo.
"%USERPROFILE%\.cargo\bin\cargo.exe" run --release --manifest-path "%~dp0Cargo.toml" --bin latency_live
set /a LIVE_EXIT=%ERRORLEVEL%

if %LIVE_EXIT% EQU 77 (
  echo.
  echo [latency_live] SKIPPED — no display or audio device found.
  echo.
) else if %LIVE_EXIT% EQU 1 (
  echo.
  echo [latency_live] FAILED — a live-probed hop exceeded latency budget.
  echo.
) else (
  echo.
  echo [latency_live] PASSED
  echo.
)

REM --- Overall verdict ---
echo.
echo =================================================================
echo  GATE P3 Summary
echo =================================================================
echo.

REM Determine overall exit code:
REM   - FAIL dominates (1 > 0 > 77)
REM   - At least one SKIP and no FAIL → exit 77
REM   - All PASS or mix of PASS+SKIP → exit 0

set /a OVERALL_EXIT=0

if %HARNESS_EXIT% EQU 1 goto fail
if %LIVE_EXIT% EQU 1 goto fail

REM Neither is fail. Check for skip:
if %HARNESS_EXIT% EQU 77 goto has_skip
if %LIVE_EXIT% EQU 77 goto has_skip
goto pass

:fail
set /a OVERALL_EXIT=1
echo GATE P3 FAILED
goto end

:has_skip
set /a OVERALL_EXIT=77
echo GATE P3 SKIPPED (prerequisites missing or no live device)
goto end

:pass
set /a OVERALL_EXIT=0
echo GATE P3 PASSED
goto end

:end
echo =================================================================
echo.
exit /b !OVERALL_EXIT!
