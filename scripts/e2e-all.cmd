@echo off
cd /d C:\Users\pc\Documents\tokentrim

:: --- Phase 2: acquire admin session ---
echo ===== PHASE2 RUN =====
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\e2e-phase2.ps1 > C:\temp\e2e2.log 2>&1
if errorlevel 1 (echo PHASE2 FAILED) else (echo PHASE2 OK)

:: --- Phase 3: auth/rate tests ---
echo ===== PHASE3 RUN =====
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\e2e-phase3.ps1 > C:\temp\e2e3.log 2>&1
if errorlevel 1 (echo PHASE3 FAILED) else (echo PHASE3 OK)

echo ===== E2E_ALL_DONE =====
