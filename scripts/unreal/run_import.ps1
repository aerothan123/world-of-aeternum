param([string]$Tiers = '1', [int]$Limit = 0, [string]$Log = 'E:\WyndlewoodUnreal\export\import.log')
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
$env:WYND_TIERS = $Tiers
$env:WYND_LIMIT = "$Limit"
$running = @(Get-Process UnrealEditor -ErrorAction SilentlyContinue).Count
if ($running -ge 2) { "two editors running, abort" | Out-File $Log; exit 2 }
$script = Join-Path $PSScriptRoot 'ue\import_glbs.py'
& 'E:\UE_5.8\Engine\Binaries\Win64\UnrealEditor-Cmd.exe' 'E:\WyndlewoodUnreal\EnvSlice\EnvSlice.uproject' -run=pythonscript "-script=$script" -unattended -nosplash -nullrhi -stdout -FullStdOutLogOutput *> $Log
"EXIT $LASTEXITCODE" | Out-File $Log -Append
