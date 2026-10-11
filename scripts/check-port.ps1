$c=Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if($c.Count -gt 0){Write-Host STILL_UP $c.OwningProcess} else {Write-Host PORT_FREE}
