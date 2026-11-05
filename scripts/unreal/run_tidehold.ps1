# Imports the six painted Tidehold buildings (tier 6) and binds their baked PNGs to the Wyndlewood masters.
# Run only when no one else needs EnvSlice. Uses a separate registry (registry_t6.json), merged later.
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
$wt = 'C:\Users\cdero\Apps\woa-unreal-assets'
Set-Location $wt
$env:WYND_REGISTRY = 'E:\WyndlewoodUnreal\export\registry_t6.json'
& "$wt\scripts\unreal\run_import.ps1" -Tiers '6' -Log E:\WyndlewoodUnreal\export\t6_import.log
& "$wt\scripts\unreal\run_py.ps1" -Script "$wt\scripts\unreal\ue\build_masters.py" -Log E:\WyndlewoodUnreal\export\t6_masters.log
$env:WYND_ONLY = 'tidehold/'
& "$wt\scripts\unreal\run_py.ps1" -Script "$wt\scripts\unreal\ue\assign_materials.py" -Log E:\WyndlewoodUnreal\export\t6_assign.log
'T6DONE' | Add-Content E:\WyndlewoodUnreal\export\run_all.log
