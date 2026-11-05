# Re-runs the Eastbrook tier with semantic material slots, rebuilds masters (emissive) and assigns instances.
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
$wt = 'C:\Users\cdero\Apps\woa-unreal-assets'
$man = 'E:\WyndlewoodUnreal\export\asset_manifest.json'
$content = 'E:\WyndlewoodUnreal\EnvSlice\Content\Wyndlewood'
$t1reg = 'E:\WyndlewoodUnreal\export\registry_t1.json'
Set-Location $wt
Remove-Item E:\WyndlewoodUnreal\export\assets_glb\Buildings -Recurse -Force -ErrorAction SilentlyContinue
node scripts/unreal/decompress_glbs.mjs $man E:\WyndlewoodUnreal\export\assets_glb 1 *> E:\WyndlewoodUnreal\export\t1_decompress.log
Remove-Item "$content\Assets\Buildings" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $t1reg -ErrorAction SilentlyContinue
$env:WYND_REGISTRY = $t1reg
& "$wt\scripts\unreal\run_import.ps1" -Tiers '1' -Log E:\WyndlewoodUnreal\export\t1_import.log
& "$wt\scripts\unreal\run_py.ps1" -Script "$wt\scripts\unreal\ue\build_masters.py" -Log E:\WyndlewoodUnreal\export\t1_masters.log
$env:WYND_ONLY = 'eastbrook_'
& "$wt\scripts\unreal\run_py.ps1" -Script "$wt\scripts\unreal\ue\assign_materials.py" -Log E:\WyndlewoodUnreal\export\t1_assign.log
'T1DONE' | Add-Content E:\WyndlewoodUnreal\export\run_all.log
