<#
.SYNOPSIS
    TokenTrim — Start dev server (PowerShell)
.DESCRIPTION
    Checks prerequisites, installs deps, sets up env, and starts the Next.js
    dev server. Run:  pwsh start-dev.ps1
#>

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path $PSCommandPath -Parent
$NodePort   = 3000

function Test-Prereq {
    param([string]$Cmd, [string]$Url, [int]$MinVersion = 0)
    if (-not (Get-Command $Cmd -ErrorAction SilentlyContinue)) {
        Write-Host "[FAIL] $Cmd not found. $Url" -ForegroundColor Red
        exit 1
    }
    Write-Host "[OK] $Cmd found."
}

# Prereqs
Write-Host "`n  ╔═══════════════════════════════════════════╗"
Write-Host "  ║  TokenTrim Launcher v1.0                ║"
Write-Host "  ╚═══════════════════════════════════════════╝`n"

Test-Prereq -Cmd "node"   -Url "https://nodejs.org/"
Test-Prereq -Cmd "pnpm"   -Url "npm install -g pnpm"

$pnpmVer = (Get-Command pnpm).Version
Write-Host "[OK] pnpm $pnpmVer`n"

# Install deps
Write-Host "[1/4] Installing dependencies ..."
Push-Location $ProjectDir
pnpm install --no-frozen-lockfile
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] pnpm install failed!" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Dependencies installed.`n"

# Env setup
Write-Host "[2/4] Setting up environment ..."
if (-not (Test-Path "$ProjectDir\.env.local")) {
    if (Test-Path "$ProjectDir\.env.example") {
        Copy-Item "$ProjectDir\.env.example" "$ProjectDir\.env.local" -Force
        Write-Host "[OK] Created .env.local from .env.example"
    } else {
        Set-Content -Path "$ProjectDir\.env.local" -Value "NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co`nNEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key"
        Write-Host "[NOTE] Created minimal .env.local. Edit it with your Supabase keys."
    }
}
Write-Host "[OK] Environment ready.`n"

# Start
Write-Host "[3/4] Starting dev server on http://localhost:$NodePort ...`n"
pnpm dev --turbopack
