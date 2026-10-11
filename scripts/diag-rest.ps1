$lines = [string[]](Get-Content 'C:/temp/e2e-env.txt')
$anon = $lines[1].Trim()
$t = (Get-Content 'C:/temp/e2e-token.txt').Trim()
$url = 'https://ovvxrhzvaytytaelotic.supabase.co'
$id = '1682db40-26d5-4027-bb13-7f9356281cea'
Write-Host '--- auth/v1/user (SERVICE role key + bearer token) ---'
try {
  $svck = $lines[2].Trim()
  $r = Invoke-WebRequest -Uri $url + '/auth/v1/user' -Headers @{apikey = $svck; Authorization = 'Bearer ' + $t} -UseBasicParsing -ErrorAction SilentlyContinue
  Write-Host $r.Content
} catch {
  Write-Host $_.Exception.Response.StatusCode.value__
  Write-Host $_.ErrorDetails.Text
}
Write-Host '--- rest/v1/profiles (SERVICE role key + bearer) ---'
try {
  $svck = $lines[2].Trim()
  $r = Invoke-WebRequest -Uri $url + '/rest/v1/profiles?id=eq.1682db40-26d5-4027-bb13-7f9356281cea%26select=is_admin,banned%26limit=1' -Headers @{apikey = $svck; Authorization = 'Bearer ' + $t} -UseBasicParsing -ErrorAction SilentlyContinue
  Write-Host $r.Content
} catch {
  Write-Host $_.Exception.Response.StatusCode.value__
  Write-Host $_.ErrorDetails.Text
}