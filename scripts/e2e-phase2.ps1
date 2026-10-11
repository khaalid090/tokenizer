try { Start-Transcript -Path "C:\temp\e2e2.log" -Force | Out-Null } catch {}

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
$url = $parts[0]; $anon = $parts[1]; $svc = $parts[2]
$svcHeaders = @{ apikey = $svc; Authorization = "Bearer $svc" }

$token = $null
$approach = ""

# --- A: magic-link for the existing admin ---
try {
  $gen = Invoke-Api -Uri "$url/auth/v1/admin/generate-link" -Method POST -Headers $svcHeaders `
    -Body (@{ type = "magic_link"; email = "khalidandsacad@gmail.com" } | ConvertTo-Json)
  Write-Host "GENERATE_LINK: $($gen.status)"
  if ($gen.status -eq 200) {
    $g = $gen.body | ConvertFrom-Json
    Write-Host "  hashed_token: $([bool]$g.hashed_token) type: $($g.verification_type)"
    if ($g.hashed_token) {
      $v = Invoke-Api -Uri "$url/auth/v1/verify" -Method POST -Headers @{ apikey = $anon } `
        -Body (@{ type = "magiclink"; token_hash = $g.hashed_token } | ConvertTo-Json)
      Write-Host "  VERIFY: $($v.status)"
      if ($v.status -eq 200) {
        $s = $v.body | ConvertFrom-Json
        if ($s.access_token) { $token = $s.access_token; $approach = "A-magiclink" }
        else { Write-Host "  NO_ACCESS_TOKEN in verify response" }
      } else {
        Write-Host "  VERIFY_BODY: $($v.body.Substring(0, [Math]::Min(220, $v.body.Length)))"
      }
    }
  } else {
    Write-Host "  GEN_BODY: $($gen.body.Substring(0, [Math]::Min(220, $gen.body.Length)))"
  }
} catch { Write-Host "APPROACH_A_ERR: $($_.Exception.Message)" }

# --- B: temporary confirmed user promoted to admin ---
if (-not $token) {
  try {
    $mail = "tokentrim-e2e-$((Get-Random) % 1000000)@example.com"
    $pass = "E2eTest!$(Get-Random -Minimum 100000 -Maximum 999999)x"
    $created = Invoke-Api -Uri "$url/auth/v1/admin/users" -Method POST -Headers $svcHeaders `
      -Body (@{ email = $mail; password = $pass; email_confirm = $true } | ConvertTo-Json)
    Write-Host "CREATE_USER: $($created.status)"
    if ($created.status -ne 200 -and $created.status -ne 201) {
      Write-Host "  CREATE_BODY: $($created.body.Substring(0, [Math]::Min(220, $created.body.Length)))"
      throw "user create failed"
    }
    $cu = $created.body | ConvertFrom-Json
    $uid = $cu.id; if (-not $uid) { $uid = $cu.user.id }
    Write-Host "  uid: $uid"

    $profGet = Invoke-Api -Uri "$url/rest/v1/profiles?id=eq.$uid&select=id" -Headers $svcHeaders
    $rows = $profGet.body | ConvertFrom-Json
    if (-not $rows -or $rows.Count -eq 0) {
      $ins = Invoke-Api -Uri "$url/rest/v1/profiles" -Method POST -Headers $svcHeaders `
        -Body (@{ id = $uid; email = $mail; is_admin = $true } | ConvertTo-Json)
      Write-Host "  PROFILE_INSERT: $($ins.status)"
    } else {
      $upd = Invoke-Api -Uri "$url/rest/v1/profiles?id=eq.$uid" -Method PATCH -Headers $svcHeaders `
        -Body (@{ is_admin = $true } | ConvertTo-Json)
      Write-Host "  PROFILE_PROMOTE: $($upd.status)"
    }

    $sess = Invoke-Api -Uri "$url/auth/v1/token?grant_type=password" -Method POST -Headers @{ apikey = $anon } `
      -Body (@{ email = $mail; password = $pass } | ConvertTo-Json)
    Write-Host "  PASSWORD_GRANT: $($sess.status)"
    if ($sess.status -eq 200) {
      $token = ($sess.body | ConvertFrom-Json).access_token
      $approach = "B-temp-admin"
      Set-Content -Path "C:\temp\e2e-user.txt" -Value "$uid|$mail"
    }
  } catch { Write-Host "APPROACH_B_ERR: $($_.Exception.Message)" }
}

if (-not $token) { Write-Host "NO_TOKEN - E2E aborted"; Stop-Transcript | Out-Null; exit 1 }
Write-Host "TOKEN_OK via $approach (len=$($token.Length))"
Set-Content -Path "C:\temp\e2e-token.txt" -Value $token
Write-Host "PHASE2_DONE"
try { Stop-Transcript | Out-Null } catch {}
