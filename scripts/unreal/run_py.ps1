param([Parameter(Mandatory)][string]$Script, [string]$Log = 'E:\WyndlewoodUnreal\export\py.log')
# Generic headless python runner (commandlet, no rendering). Does not open an interactive editor.
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
& 'E:\UE_5.8\Engine\Binaries\Win64\UnrealEditor-Cmd.exe' 'E:\WyndlewoodUnreal\EnvSlice\EnvSlice.uproject' -run=pythonscript "-script=$Script" -unattended -nosplash -nullrhi -stdout -FullStdOutLogOutput *> $Log
"EXIT $LASTEXITCODE" | Out-File $Log -Append
