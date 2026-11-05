$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
$wt = 'C:\Users\cdero\Apps\woa-unreal-assets'
Set-Location $wt
Remove-Item E:\WyndlewoodUnreal\export\assets_glb\Buildings\SM_props_eastbrook_realm_builder_monument.glb -ErrorAction SilentlyContinue
node scripts/unreal/decompress_glbs.mjs E:\WyndlewoodUnreal\export\asset_manifest.json E:\WyndlewoodUnreal\export\assets_glb 1 *> E:\WyndlewoodUnreal\export\mon_decompress.log
$env:WYND_REGISTRY = 'E:\WyndlewoodUnreal\export\registry_t1.json'
& "$wt\scripts\unreal\run_import.ps1" -Tiers '1' -Log E:\WyndlewoodUnreal\export\mon_import.log
$env:WYND_ONLY = 'monument'
& "$wt\scripts\unreal\run_py.ps1" -Script "$wt\scripts\unreal\ue\assign_materials.py" -Log E:\WyndlewoodUnreal\export\mon_assign.log
'MONDONE' | Add-Content E:\WyndlewoodUnreal\export\run_all.log
