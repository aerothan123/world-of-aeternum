# PC runner for scripts/music/eleven_music.mjs: loads ELEVENLABS_API_KEY from the
# main clone's .env into this process only (never printed or logged), runs one mode
# and logs to tmp/music/run_<mode>.log. Usage:
#   powershell -File scripts/music/run_music.ps1 -Mode usage
#   powershell -File scripts/music/run_music.ps1 -Mode generate -Extra "--tier 1"
param([string]$Mode = 'usage', [string]$Extra = '', [string]$EnvFile = 'C:\Users\cdero\Apps\world-of-aeternum\.env')
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root
New-Item -ItemType Directory -Force (Join-Path $root 'tmp\music') | Out-Null
$log = Join-Path $root "tmp\music\run_$Mode.log"
if (Test-Path $EnvFile) {
  foreach ($line in Get-Content $EnvFile) {
    if ($line -match '^\s*ELEVENLABS_API_KEY\s*=\s*(.+?)\s*$') { $env:ELEVENLABS_API_KEY = $Matches[1].Trim('"').Trim("'") }
  }
}
$needsKey = @('usage', 'generate') -contains $Mode
if ($needsKey -and -not $env:ELEVENLABS_API_KEY) { 'ELEVENLABS_API_KEY absent' | Out-File $log; exit 1 }
$nodeArgs = @('scripts/music/eleven_music.mjs', $Mode)
if ($Extra) { $nodeArgs += $Extra.Split(' ') }
& node @nodeArgs *> $log
"exit $LASTEXITCODE" | Out-File $log -Append
