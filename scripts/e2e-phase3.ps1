try { Start-Transcript -Path "C:\temp\e2e3.log" -Force | Out-Null } catch {}

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

$parts = (Get-Content "C:\temp\e2e-env.txt" -Raw).Trim() -split "\|"
$url = $parts[0]; $svc = $parts[2]
$svcHeaders = @{ apikey = $svc; Authorization = "Bearer $svc" }
$cookieName = "sb-ovvxrhzvaytytaelotic-auth-token"
$token = (Get-Content "C:\temp\e2e-token.txt" -Raw).Trim()
$cookieEnc = [Uri]::EscapeDataString('{"access_token":"' + $token + '"}')

# T1: /admin WITH session cookie -> expect 200
$r = Invoke-Expression "curl.exe -s -o NUL -w 'T1_STATUS:%{http_code} T1_LOC:%{redirect_url}' -H 'Cookie: $cookieName=$cookieEnc' 'http://localhost:3000/admin'"
Write-Host "T1_ADMIN_WITH_COOKIE: $r"

# T2: /admin WITHOUT cookie -> expect 307 (gate stays shut)
$r = Invoke-Expression "curl.exe -s -o NUL -w 'T2_STATUS:%{http_code} T2_LOC:%{redirect_url}' 'http://localhost:3000/admin'"
Write-Host "T2_ADMIN_NO_COOKIE: $r"

# T3: stats -> 200
$t3 = Invoke-Api -Uri "http://localhost:3000/api/admin/stats" -Headers @{ Authorization = "Bearer $token" }
$b3 = ""; try { $j = $t3.body | ConvertFrom-Json; $b3 = "keys=$(($j.PSObject.Properties.Name) -join ',')" } catch {}
Write-Host "T3_STATS: $($t3.status) $b3"

# T4: users list -> 200
$t4 = Invoke-Api -Uri "http://localhost:3000/api/admin/users?page=1&limit=50" -Headers @{ Authorization = "Bearer $token" }
$b4 = ""; try { $j = $t4.body | ConvertFrom-Json; $b4 = "total=$($j.total) returned=$($j.users.Count)" } catch {}
Write-Host "T4_USERS: $($t4.status) $b4"

# T5: audit log -> 200
$t5 = Invoke-Api -Uri "http://localhost:3000/api/admin/audit-log?page=1&limit=5" -Headers @{ Authorization = "Bearer $token" }
$b5 = ""; try { $j = $t5.body | ConvertFrom-Json; $b5 = "entries=$($j.entries.Count) total=$($j.total)" } catch {}
Write-Host "T5_AUDIT: $($t5.status) $b5"

# T6: content/settings routes -> 200
$t6 = Invoke-Api -Uri "http://localhost:3000/api/admin/settings" -Headers @{ Authorization = "Bearer $token" }
Write-Host "T6_SETTINGS: $($t6.status)"
$t7 = Invoke-Api -Uri "http://localhost:3000/api/admin/benchmark-prompts" -Headers @{ Authorization = "Bearer $token" }
Write-Host "T7_BENCHMARK: $($t7.status)"

# Cleanup temp user if one was created
if (Test-Path "C:\temp\e2e-user.txt") {
  $info = (Get-Content "C:\temp\e2e-user.txt") -split "\|"
  $del = Invoke-Api -Uri "$url/auth/v1/admin/users/$($info[0])" -Method DELETE -Headers $svcHeaders
  Write-Host "CLEANUP_DELETE_USER: $($del.status)"
  Remove-Item "C:\temp\e2e-user.txt" -ErrorAction SilentlyContinue
}
Remove-Item "C:\temp\e2e-token.txt" -ErrorAction SilentlyContinue

Write-Host "E2E_DONE"
try { Stop-Transcript | Out-Null } catch {}
