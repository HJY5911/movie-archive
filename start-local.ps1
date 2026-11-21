$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$env:PYTHONIOENCODING = 'utf-8'
$runtimePython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
$listener = Get-NetTCPConnection -LocalPort 58801 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
    $serverProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
    $parentProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($serverProcess.ParentProcessId)"
    if (($serverProcess.ExecutablePath -ieq $runtimePython -or $parentProcess.ExecutablePath -ieq $runtimePython) -and $serverProcess.CommandLine -match ' -m server(?:\s|$)') {
        Write-Host '이미 실행 중입니다: http://127.0.0.1:58801/login.html'
        exit 0
    }
    throw '58801 포트를 다른 프로그램이 사용하고 있습니다. 해당 프로그램은 종료하지 않았습니다.'
}
if (-not (Test-Path -LiteralPath $runtimePython)) {
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Python 가상 환경 생성 실패' }
}
$dependencyFile = if (Test-Path -LiteralPath 'requirements-lock.txt') { 'requirements-lock.txt' } else { 'requirements.txt' }
& $runtimePython -m pip install -r $dependencyFile --disable-pip-version-check
if ($LASTEXITCODE -ne 0) { throw '서버 실행에 필요한 패키지 설치 실패' }
& $runtimePython scripts/local_setup.py
if ($LASTEXITCODE -ne 0) { throw '별도 개발 DB 준비 실패' }
& $runtimePython -m server init-db
if ($LASTEXITCODE -ne 0) { throw '프로젝트 테이블 준비 실패' }
Write-Host '접속 주소: http://127.0.0.1:58801/login.html'
Write-Host '서버를 중지하려면 Ctrl+C를 누르세요.'
& $runtimePython -m server
