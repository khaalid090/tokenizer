@echo off
rem ============================
rem  TokenTrim — Desktop Build
rem ============================
cd /d "%~dp0"
echo Building desktop app (Tauri) ...
call :check_pnpm
call :check_rust

echo [1/3] Building web export ...
call:build export
if errorlevel 1 (
    echo [FAIL] Web export failed!
    pause
    exit /b 1
)

echo [2/3] Building Tauri app ...
call:build desktop
if errorlevel 1 (
    echo [FAIL] Desktop build failed!
    pause
    exit /b 1
)

echo [OK] Desktop app built successfully!
pause

:check_pnpm
where pnpm >nul 2>&1
if errorlevel 1 (
    echo [FAIL] pnpm not found. Install: npm install -g pnpm
    pause
    exit /b 1
)
exit /b 0

:check_rust
where cargo >nul 2>&1
if errorlevel 1 (
    echo [FAIL] Cargo (Rust toolchain) not found. Install Rust from https://rustup.rs
    pause
    exit /b 1
)
echo [OK] Rust toolchain found.
exit /b 0

:build
if "%~1"=="export" (
    pnpm build:desktop
) else if "%~1"=="desktop" (
    pnpm tauri:build
)
exit /b %errorlevel%
