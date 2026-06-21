@echo off
REM G-Signal Latency Harness — GATE P3
REM Engineering Spec §1: p50 <= 250ms, p99 <= 300ms
REM
REM Run this from a command prompt or PowerShell terminal.
REM Requires Rust toolchain (rustup.rs). Runtime: ~18 seconds.
REM Exit code: 0 = PASS, 1 = FAIL

echo.
echo =================================================================
echo  G-Signal Latency Harness  --  GATE P3
echo  Engineering Spec §1
echo  Runtime: ~18 seconds (100 iterations x ~180ms)
echo =================================================================
echo.

"%USERPROFILE%\.cargo\bin\cargo.exe" run --release --manifest-path "%~dp0Cargo.toml"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [GATE P3 PASSED]
) else (
    echo.
    echo [GATE P3 FAILED]
)

echo.
pause
