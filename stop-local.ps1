$ErrorActionPreference = 'Stop'
$runtimePython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
$listener = Get-NetTCPConnection -LocalPort 58801 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $listener) { Write-Host '실행 중인 웹서버가 없습니다.'; exit 0 }
$serverProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
$parentProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($serverProcess.ParentProcessId)"
$belongsToCopy = ($serverProcess.ExecutablePath -ieq $runtimePython) -or ($parentProcess.ExecutablePath -ieq $runtimePython)
if (-not $belongsToCopy -or $serverProcess.CommandLine -notmatch ' -m server(?:\s|$)') {
    throw '이 복사본에서 실행한 서버인지 확인되지 않아 다른 프로그램은 종료하지 않았습니다.'
}
Stop-Process -Id $listener.OwningProcess
Write-Host '이 복사본의 웹서버를 중지했습니다. 저장된 기록과 MySQL 데이터는 유지됩니다.'
