@echo off
rem ============================
rem  TokenTrim — Clean All
rem ============================
cd /d "%~dp0"
echo Cleaning project ...
if exist "node_modules"   rmdir /s /q "node_modules"
if exist ".next"         rmdir /s /q ".next"
if exist "out"           rmdir /s /q "out"
if exist "data"          rmdir /s /q "data"
if exist "pnpm-lock.yaml" del /q "pnpm-lock.yaml"
echo [OK] Cleaned.
pause
