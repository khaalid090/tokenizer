Get-CimInstance Win32_Process | Where-Object {
  $cmd = $_.CommandLine
  $cmd -and ($cmd -match 'tokentrim|pnpm|next dev' -or $_.Name -eq 'node.exe')
} | ForEach-Object {
  Stop-Process $_.ProcessId -Force -ErrorAction SilentlyContinue
  Write-Host Killed $_.ProcessId
}
