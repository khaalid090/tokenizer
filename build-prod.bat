@echo off
rem ============================
rem  TokenTrim — Production Build
rem ============================
cd /d "%~dp0"
echo Building TokenTrim (production) ...
call :check_pnpm
pnpm build
if errorlevel 1 (
    echo [FAIL] Build failed!
    pause
    exit /b 1
)
echo [OK] Build complete. Starting server ...
start "" cmd /c "cd /d %~dp0 && pnpm start"
echo Open http://localhost:3000
pause

:check_pnpm
where pnpm >nul 2>&1
if errorlevel 1 (
    echo [FAIL] pnpm not found. Install: npm install -g pnpm
    pause
    exit /b 1
)
exit /b 0
