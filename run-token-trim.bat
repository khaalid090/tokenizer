@echo off
REM ============================================================================
REM  TokenTrim — One-Click Launcher (Windows)
REM  Usage:  run-token-trim.bat [dev|build|desktop|clean|help]
REM ============================================================================

setlocal

set "PROJECT_DIR=%~dp0"
set "PROJECT_PARENT=%~dp0.."
set "NODE_PORT=3000"
set "SKIP_PREREQ=0"
set "RUN_MODE=dev"

rem --- Parse args -------------------------------------------------------------
if "%~1"=="" goto :run_default
if /i "%~1"=="dev"        set "RUN_MODE=dev"
if /i "%~1"=="build"      set "RUN_MODE=build"
if /i "%~1"=="desktop"    set "RUN_MODE=desktop"
if /i "%~1"=="clean"      set "RUN_MODE=clean"
if /i "%~1"=="help"       call :show_help
goto :done

:run_default
set "RUN_MODE=dev"
goto :main

:main
echo.
echo   ╔═══════════════════════════════════════════════════════════╗
echo   ║            TokenTrim — Launcher v1.0                      ║
echo   ║  https://github.com/your-username/tokentrim (placeholder) ║
echo   ╚═══════════════════════════════════════════════════════════╝
echo.

rem --- Prerequisite checks ----------------------------------------------------
call :check_node   || goto :err_node
call :check_pnpm   || goto :err_pnpm
call :check_rust   || goto :err_rust
if "%RUN_MODE%"=="desktop" (
    call :check_vs   || goto :err_vs
)

rem --- Clean ------------------------------------------------------------------
if "%RUN_MODE%"=="clean" (
    echo [1/5] Cleaning...
    if exist "%PROJECT_DIR%node_modules" rmdir /s /q "%PROJECT_DIR%node_modules"
    if exist "%PROJECT_DIR%.next" rmdir /s /q "%PROJECT_DIR%.next"
    if exist "%PROJECT_DIR%out" rmdir /s /q "%PROJECT_DIR%out"
    if exist "%PROJECT_DIR%data" rmdir /s /q "%PROJECT_DIR%data"
    echo [OK] Cleaned.
    goto :done
)

rem --- Install dependencies ---------------------------------------------------
echo [1/5] Installing dependencies (pnpm install)...
cd /d "%PROJECT_DIR%"
pnpm install --no-frozen-lockfile
if errorlevel 1 (
    echo [FAIL] pnpm install failed!
    pause
    goto :done
)
echo [OK] Dependencies installed.

rem --- Env setup ----------------------------------------------------------------
echo [2/5] Setting up environment...
if not exist "%PROJECT_DIR%.env.local" (
    if exist "%PROJECT_DIR%.env.example" (
        copy /Y "%PROJECT_DIR%.env.example" "%PROJECT_DIR%.env.local" >nul
        echo [OK] Created .env.local from .env.example
        echo [NOTE] Edit .env.local with your Supabase keys if needed.
    ) else (
        echo [WARN] No .env.example found; creating minimal .env.local
        echo NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co>"%PROJECT_DIR%.env.local"
        echo NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key>>"%PROJECT_DIR%.env.local"
    )
)

rem --- Start --------------------------------------------------------------------
echo [3/5] Starting TokenTrim ...
cd /d "%PROJECT_DIR%"

if "%RUN_MODE%"=="dev" (
    echo     Mode:  Dev server (http://localhost:%NODE_PORT%)
    echo     Ctrl+C to stop.
    echo.
    pnpm dev --turbopack
) else if "%RUN_MODE%"=="build" (
    echo     Mode:  Production build
    echo     Running pnpm build ...
    pnpm build
    if errorlevel 1 (
        echo [FAIL] Build failed!
        pause
        goto :done
    )
    echo [OK] Build complete. Starting production server...
    start "" cmd /c "cd /d %PROJECT_DIR% && pnpm start"
    echo [OK] Production server starting. Open http://localhost:3000
) else if "%RUN_MODE%"=="desktop" (
    echo     Mode:  Desktop (Tauri)
    echo     Building web export...
    pnpm build:desktop
    if errorlevel 1 (
        echo [FAIL] Desktop build failed!
        pause
        goto :done
    )
    echo [OK] Web export complete. Building Tauri app...
    pnpm tauri:build
)
goto :done

rem --- Helper functions ---------------------------------------------------------

:check_node
where node >nul 2>&1
if errorlevel 1 (
    echo [FAIL] Node.js not found. Install from https://nodejs.org/ (v18+ required)
    pause
    exit /b 1
)
for /f "tokens=2 delims=v." %%v in ('node -v') do set "NODE_MAJOR=%%v"
if %NODE_MAJOR% LSS 18 (
    echo [FAIL] Node.js v18+ required, found v%NODE_MAJOR%.
    pause
    exit /b 1
)
echo [OK] Node.js v%NODE_MAJOR% found.
exit /b 0

:check_pnpm
where pnpm >nul 2>&1
if errorlevel 1 (
    echo [FAIL] pnpm not found. Install via: npm install -g pnpm
    pause
    exit /b 1
)
echo [OK] pnpm found.
exit /b 0

:check_rust
where rustup >nul 2>&1
if errorlevel 1 (
    echo [WARN] Rust toolchain not found. Install from https://rustup.rs
)
echo [OK] Rust check complete.
exit /b 0

:check_vs
where cargo >nul 2>&1
if errorlevel 1 (
    echo [FAIL] Cargo (Rust toolchain) not found. Install Rust from https://rustup.rs
    pause
    exit /b 1
)
echo [OK] Cargo found.
exit /b 0

:show_help
echo.
echo   TokenTrim Launcher — Usage
echo.
echo   run-token-trim.bat [mode]
echo.
echo   Modes:
echo     dev        Start Next.js dev server   (default)
echo     build      Build & run production
echo     desktop    Build desktop app (Tauri)
echo     clean      Remove node_modules, .next, out, data
echo     help       Show this help
echo.
exit /b 0

:done
echo.
echo   Done.
pause
endlocal
