$path = "C:\Users\pc\Documents\tokentrim\lib\supabase.ts"
$enc = New-Object System.Text.UTF8Encoding($false)
$content = [IO.File]::ReadAllText($path)
$pattern = '\.then\(\(\) => undefined\)\r?\n\s*\.catch\(\(\) => undefined\);'
$replacement = '.then(() => undefined, () => undefined); // PromiseLike: no .catch()'
$updated = [regex]::Replace($content, $pattern, $replacement)
if ($updated -ne $content) {
  [IO.File]::WriteAllText($path, $updated, $enc)
  Write-Host "FIXED touchProfile"
} else {
  Write-Host "PATTERN NOT FOUND"
}
