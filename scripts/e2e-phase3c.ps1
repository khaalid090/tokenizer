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
    if ($resp) { return @{ status = [int]$resp.StatusCode; body = $_.Exception.Message } }
    return @{ status = 0; body = $_.Exception.Message }
  }
}

$parts = (Get-Content "C:\temp\e2e-env.txt" -Raw).Trim() -split "|"
$url = $parts[0]; $svc = $parts[2]
$svcHeaders = @{ apikey = $svc; Authorization = "Bearer $svc" }
$token = (Get-Content "C:\temp\e2e-token.txt" -Raw).Trim()
$cookieEnc = [Uri]::EscapeDataString('{"access_token":"' + $token + '"}')
$cookieName = "sb-ovvxrhzvaytytaelotic-auth-token"

# T1: /admin WITH session cookie -> expect 200 (curl.exe is authoritative on cookies)
$cj = if ($token -match '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$') { $token } else { "" }
if ($cj) {
  $res = Invoke-Expression "curl.exe -s -o NUL -w 'T1_STATUS:%{http_code} T1_LOC:%{redirect_url}' -H 'Cookie: $cookieName=$cookieEnc' 'http://localhost:3000/admin'"
  Write-Host "T1_CURL: $res"
} else { Write-Host "T1_SKIP: token is not a JWT" }

# T2: /admin WITHOUT cookie -> 307
$res = Invoke-Expression "curl.exe -s -o NUL -w '%{http_code}' 'http://localhost:3000/admin'"
Write-Host "T2_NO_COOKIE: $res"

# T3-T5: API via Invoke-WebRequest
$t3 = Invoke-Api -Uri "http://localhost:3000/api/admin/stats" -Headers @{ Authorization = "Bearer $token" }
$b3 = ""; try { $j = $t3.body | ConvertFrom-Json; $b3 = "keys=(" + ($j.PSObject.Properties.Name -join ",") + ")" } catch {}
Write-Host "T3_STATS: $($t3.status) $b3"

$t4 = Invoke-Api -Uri "http://localhost:3000/api/admin/users?page=1&limit=50" -Headers @{ Authorization = "Bearer $token" }
$b4 = ""; try { $j = $t4.body | ConvertFrom-Json; $b4 = "total=" + $j.total + " returned=" + $j.users.Count } catch {}
Write-Host "T4_USERS: $($t4.status) $b4"

$t5 = Invoke-Api -Uri "http://localhost:3000/api/admin/audit-log?page=1&limit=5" -Headers @{ Authorization = "Bearer $token" }
$b5 = ""; try { $j = $t5.body | ConvertFrom-Json; $b5 = "entries=" + $j.entries.Count + " total=" + $j.total } catch {}
Write-Host "T5_AUDIT: $($t5.status) $b5"

# T6/T7: print full error bodies when 500
$t6 = Invoke-Api -Uri "http://localhost:3000/api/admin/settings" -Headers @{ Authorization = "Bearer $token" }
Write-Host "T6_SETTINGS_STATUS: $($t6.status) BODY: " + $t6.body.Substring(0, [Math]::Min(300, $t6.body.Length))
$t7 = Invoke-Api -Uri "http://localhost:3000/api/admin/benchmark-prompts" -Headers @{ Authorization = "Bearer $token" }
Write-Host "T7_BENCHMARK_STATUS: $($t7.status) BODY: " + $t7.body.Substring(0, [Math]::Min(300, $t7.body.Length))

# cleanup temp user
if (Test-Path "C:\temp\e2e-user.txt") {
  $info = (Get-Content "C:\temp\e2e-user.txt") -split "|"
  $del = Invoke-Api -Uri "$url/auth/v1/admin/users/$($info[0])" -Method DELETE -Headers $svcHeaders
  Write-Host "CLEANUP_DELETE_USER: $($del.status)"
  Remove-Item "C:\temp\e2e-user.txt" -ErrorAction SilentlyContinue
}
Remove-Item "C:\temp\e2e-token.txt" -ErrorAction SilentlyContinue
Write-Host "E2E3_DONE"
try { Stop-Transcript | Out-Null } catch {}
