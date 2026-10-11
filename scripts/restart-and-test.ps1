# Restart the TokenTrim dev server and verify the admin gate behaviour.
Start-Transcript -Path "C:\temp\test-results.log" -Force | Out-Null
$proj = "C:\Users\pc\Documents\tokentrim"

# 1. Stop anything listening on :3000
$conns = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
foreach ($c in $conns) {
  try { Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop; Write-Host "KILLED PID $($c.OwningProcess)" } catch {}
}
Start-Sleep -Seconds 2

# 2. Start dev server fresh (loads updated .env.local)
$out = "C:\temp\devrun.log"
$err = "C:\temp\devrun.err"
Remove-Item $out, $err -ErrorAction SilentlyContinue
Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/c", "cd /d $proj && pnpm dev --turbopack > $out 2> $err" `
  -WindowStyle Hidden
Write-Host "STARTED dev server, waiting for ready..."

# 3. Poll until it responds (max ~120s)
$ok = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 2
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:3000/" -TimeoutSec 5 -UseBasicParsing -MaximumRedirection 0
    $ok = $true; break
  } catch {
    if ($_.Exception.Response) { $ok = $true; break }
  }
}
if ($ok) { Write-Host "SERVER READY" } else { Write-Host "SERVER NOT READY" }

# 4. Test 1: /admin without a session cookie must 307 -> /
try {
  $r1 = Invoke-WebRequest -Uri "http://localhost:3000/admin" -TimeoutSec 30 -UseBasicParsing -MaximumRedirection 0
  Write-Host "ADMIN_NO_COOKIE_STATUS: $($r1.StatusCode)"
} catch {
  if ($_.Exception.Response) {
    Write-Host "ADMIN_NO_COOKIE_STATUS: $([int]$_.Exception.Response.StatusCode) -> $($_.Exception.Response.Headers['Location'])"
  } else {
    Write-Host "ADMIN_NO_COOKIE_ERR: $($_.Exception.Message)"
  }
}

# 5. Test 2: admin API without Bearer must 401
try {
  $r2 = Invoke-WebRequest -Uri "http://localhost:3000/api/admin/stats" -TimeoutSec 30 -UseBasicParsing
  Write-Host "API_NO_TOKEN: $($r2.StatusCode) $($r2.Content)"
} catch {
  if ($_.Exception.Response) {
    $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $body = $sr.ReadToEnd()
    Write-Host "API_NO_TOKEN: $([int]$_.Exception.Response.StatusCode) $body"
  } else {
    Write-Host "API_NO_TOKEN_ERR: $($_.Exception.Message)"
  }
}

Write-Host "ALL_TESTS_DONE"
Stop-Transcript | Out-Null

