Start-Transcript -Path "C:\temp\test2.log" -Force | Out-Null
$proj = "C:\Users\pc\Documents\tokentrim"

# 1. Kill every dev-server process (next dev / pnpm / turbopack) for this project
$procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and $_.CommandLine -match "tokentrim|next dev" -and $_.ProcessId -ne $PID }
foreach ($p in $procs) {
  try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; Write-Host "KILLED $($p.ProcessId): $($p.Name)" } catch {}
}
Start-Sleep -Seconds 3

# 2. Confirm port 3000 is free
$busy = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($busy) {
  foreach ($b in $busy) { try { Stop-Process -Id $b.OwningProcess -Force } catch {} }
  Start-Sleep -Seconds 2
}
Write-Host "PORT_3000_FREE: $(-not (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue))"

# 3. Start fresh - `pnpm dev` alone (the script already includes --turbopack)
$out = "C:\temp\devrun.log"; $err = "C:\temp\devrun.err"
Remove-Item $out, $err -ErrorAction SilentlyContinue
Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/c", "cd /d $proj && pnpm dev > $out 2> $err" `
  -WindowStyle Hidden
Write-Host "STARTED, polling port 3000..."

# 4. Poll up to 3 minutes
$ready = $false
for ($i = 0; $i -lt 90; $i++) {
  Start-Sleep -Seconds 2
  if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) {
    $ready = $true; break
  }
}
Write-Host "SERVER_READY: $ready (after $((($i+1)*2))s)"
if (-not $ready) { Get-Content $out -Tail 15 -ErrorAction SilentlyContinue }

# 5. Gate test A: /admin with NO session cookie -> expect 307 to /
try {
  $r1 = Invoke-WebRequest -Uri "http://localhost:3000/admin" -TimeoutSec 60 -UseBasicParsing -MaximumRedirection 0
  Write-Host "ADMIN_NO_COOKIE: $($r1.StatusCode)"
} catch {
  if ($_.Exception.Response) {
    Write-Host "ADMIN_NO_COOKIE: $([int]$_.Exception.Response.StatusCode) -> $($_.Exception.Response.Headers['Location'])"
  } else { Write-Host "ADMIN_NO_COOKIE_ERR: $($_.Exception.Message)" }
}

# 6. Gate test B: admin API with NO Bearer -> expect 401
try {
  $r2 = Invoke-WebRequest -Uri "http://localhost:3000/api/admin/stats" -TimeoutSec 60 -UseBasicParsing
  Write-Host "API_NO_TOKEN: $($r2.StatusCode) $($r2.Content)"
} catch {
  if ($_.Exception.Response) {
    $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    Write-Host "API_NO_TOKEN: $([int]$_.Exception.Response.StatusCode) $($sr.ReadToEnd())"
  } else { Write-Host "API_NO_TOKEN_ERR: $($_.Exception.Message)" }
}

Write-Host "ALL_TESTS_DONE"
Stop-Transcript | Out-Null
