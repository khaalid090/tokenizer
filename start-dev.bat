@echo off
rem ============================
rem  TokenTrim — Start Dev
rem ============================
cd /d "%~dp0"
echo Starting TokenTrim dev server ...
call :check_pnpm
pnpm dev --turbopack
goto :eof

:check_pnpm
where pnpm >nul 2>&1
if errorlevel 1 (
    echo [FAIL] pnpm not found. Install: npm install -g pnpm
    pause
    exit /b 1
)
exit /b 0
