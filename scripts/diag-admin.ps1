$t=(Get-Content 'C:/temp/e2e-token.txt').Trim()
$enc=[Uri]::EscapeDataString('{"access_token":"'+$t+'"}')
$c='sb-ovvxrhzvaytytaelotic-auth-token='+ $enc
curl.exe -s -m 25 -D C:/temp/h.txt -o C:/temp/b.html -H 'Cookie: $c' 'http://localhost:3000/admin'
Write-Host '===WITH_COOKIE==='
Get-Content 'C:/temp/h.txt' -Raw
Write-Host ===BODY===
Get-Content 'C:/temp/b.html' -Raw | Select-Object -First 600

curl.exe -s -m 25 -D C:/temp/h2.txt -o C:/temp/b2.html 'http://localhost:3000/admin'
Write-Host '===NO_COOKIE==='
Get-Content 'C:/temp/h2.txt' -Raw
Write-Host '===BODY2==='
Get-Content 'C:/temp/b2.html' -Raw | Select-Object -First 300
