param([string]$Tiers = '1', [int]$Limit = 0, [string]$Log = 'E:\WyndlewoodUnreal\export\import.log')
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
while (Test-Path 'E:\WyndlewoodUnreal\export\PAUSE') { Start-Sleep -Seconds 15 }  # pause flag, checked at every batch boundary
$env:WYND_TIERS = $Tiers
$env:WYND_LIMIT = "$Limit"
$script = Join-Path $PSScriptRoot 'ue\import_glbs.py'
& 'E:\UE_5.8\Engine\Binaries\Win64\UnrealEditor-Cmd.exe' 'E:\WyndlewoodUnreal\EnvSlice\EnvSlice.uproject' -run=pythonscript "-script=$script" -unattended -nosplash -nullrhi -stdout -FullStdOutLogOutput *> $Log
"EXIT $LASTEXITCODE" | Out-File $Log -Append


