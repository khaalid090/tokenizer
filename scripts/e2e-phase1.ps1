Start-Transcript -Path "C:\temp\e2e.log" -Force | Out-Null
$proj = "C:\Users\pc\Documents\tokentrim"

function Invoke-Api {
  param([string]$Uri, [string]$Method = "GET", [hashtable]$Headers = @{}, [string]$Body = $null, [int]$Timeout = 90)
  try {
    $p = @{ Uri = $Uri; Method = $Method; Headers = $Headers; TimeoutSec = $Timeout; UseBasicParsing = $true }
    if ($Body) { $p.Body = $Body; $p.ContentType = "application/json" }
    $r = Invoke-WebRequest @p
    return @{ status = [int]$r.StatusCode; body = [string]$r.Content }
  } catch {
    $resp = $_.Exception.Response
    if ($resp) {
      $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
      return @{ status = [int]$resp.StatusCode; body = $sr.ReadToEnd() }
    }
    return @{ status = 0; body = $_.Exception.Message }
  }
}

# ---------------------------------------------------------------------------
# 1. Restart dev server so it picks up SUPABASE_SERVICE_ROLE_KEY
# ---------------------------------------------------------------------------
$procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and $_.CommandLine -match "tokentrim|next dev" -and $_.ProcessId -ne $PID }
foreach ($p in $procs) {
  try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; Write-Host "KILLED $($p.ProcessId)" } catch {}
}
Start-Sleep -Seconds 3
Remove-Item "C:\temp\devrun.log", "C:\temp\devrun.err" -ErrorAction SilentlyContinue
Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/c", "cd /d $proj && pnpm dev > C:\temp\devrun.log 2> C:\temp\devrun.err" `
  -WindowStyle Hidden
Write-Host "DEV SERVER STARTING..."
$ready = $false
for ($i = 0; $i -lt 90; $i++) {
  Start-Sleep -Seconds 2
  if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { $ready = $true; break }
}
Write-Host "SERVER_READY: $ready ($(($i+1)*2)s)"
if (-not $ready) {
  Get-Content "C:\temp\devrun.log" -Tail 20 -ErrorAction SilentlyContinue
  Write-Host "ABORT"
  Stop-Transcript | Out-Null
  exit 1
}

# ---------------------------------------------------------------------------
# 2. Read env
# ---------------------------------------------------------------------------
$map = @{}
foreach ($line in (Get-Content "$proj\.env.local")) {
  $l = $line.Trim([char]0xFEFF)
  if ($l -match '^[A-Za-z_][A-Za-z0-9_]*=') {
    $eq = $l.IndexOf("=")
    $map[$l.Substring(0, $eq)] = $l.Substring($eq + 1)
  }
}
$url = $map["NEXT_PUBLIC_SUPABASE_URL"]
$anon = $map["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
$svc = $map["SUPABASE_SERVICE_ROLE_KEY"]
Write-Host "SERVICE_KEY_LEN: $($svc.Length)"
Set-Content -Path "C:\temp\e2e-env.txt" -Value "$url|$anon|$svc"
Write-Host "PHASE1_DONE"
Stop-Transcript | Out-Null
