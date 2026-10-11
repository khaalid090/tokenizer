@echo off
rem ============================
rem  TokenTrim — Complete Setup
rem  Run this once after cloning / pulling changes
rem ============================
cd /d "%~dp0"

echo.
echo   ╔═══════════════════════════════════════════╗
echo   ║  TokenTrim — Setup & Run Script v1.0      ║
echo   ╚═══════════════════════════════════════════╝
echo.

set "SKIP_PREREQ=0"

if "%~1"=="/skip-prereq" set "SKIP_PREREQ=1"

rem 1. Prereqs
if "%SKIP_PREREQ%"=="0" (
    call :check_node  || exit /b 1
    call :check_pnpm  || exit /b 1
    call :check_rust  || echo [WARN] Rust missing (only needed for desktop)
)

rem 2. Install
echo Checking pnpm install ...
pnpm install --frozen-lockfile 2>nul || pnpm install --no-frozen-lockfile
if errorlevel 1 (
    echo [FAIL] pnpm install failed!
    pause
    exit /b 1
)
echo [OK] Dependencies installed.

rem 3. Env
echo Setting up environment ...
if not exist ".env.local" (
    if exist ".env.example" copy /Y ".env.example" ".env.local" >nul
    echo [OK] .env.local ready (edit if needed).
)

rem 4. Dev server
echo Starting dev server ...
echo Open http://localhost:3000
pnpm dev --turbopack

exit /b 0

:check_node
where node >nul 2>&1
if errorlevel 1 (
    echo [FAIL] Node.js not found. Install: https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=2 delims=v." %%v in ('node -v') do set "N=%%%v"
if %N% LSS 18 (
    echo [FAIL] Node.js 18+ required, found v%N%.
    pause
    exit /b 1
)
echo [OK] Node.js v%N%
exit /b 0

:check_pnpm
where pnpm >nul 2>&1
if errorlevel 1 (
    echo [FAIL] pnpm not found. Install: npm install -g pnpm
    pause
    exit /b 1
)
echo [OK] pnpm found.
exit /b 0

:check_rust
where rustup >nul 2>&1
if errorlevel 1 (
    echo [WARN] Rust toolchain not found. Install: https://rustup.rs
)
exit /b 0
