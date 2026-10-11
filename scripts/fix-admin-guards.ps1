$enc = New-Object System.Text.UTF8Encoding($false)
$root = "C:\Users\pc\Documents\tokentrim\app\api\admin"
$files = Get-ChildItem $root -Recurse -Filter route.ts
$pattern = 'if \("response" in auth\) return auth\.response;'
$replacement = 'if (auth instanceof NextResponse) return auth;'
foreach ($f in $files) {
  $content = [IO.File]::ReadAllText($f.FullName)
  $updated = [regex]::Replace($content, $pattern, $replacement)
  if ($updated -ne $content) {
    [IO.File]::WriteAllText($f.FullName, $updated, $enc)
    Write-Host "FIXED: $($f.FullName)"
  }
}
Write-Host "DONE"
