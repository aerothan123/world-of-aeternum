# Rebuilds the six Tidehold buildings (UV fix: gltf-transform prune used to drop TEXCOORD_0 once the textures were stripped).
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
$wt = 'C:\Users\cdero\Apps\woa-unreal-assets'
$ue = 'E:\WyndlewoodUnreal\EnvSlice\Content\Wyndlewood'
Set-Location $wt
node scripts/unreal/prep_tidehold.mjs E:\WyndlewoodUnreal\export\asset_manifest.json E:\WyndlewoodUnreal\export\assets_glb E:\WyndlewoodUnreal\export\tex *> E:\WyndlewoodUnreal\export\tide_prep2.log
Get-ChildItem "$ue\Assets\Buildings" -Directory -Filter 'SM_tidehold_*' | Remove-Item -Recurse -Force
Get-ChildItem "$ue\Materials\Assets\Instances" -Filter 'MI_SM_tidehold_*' | Remove-Item -Force
$env:WYND_REGISTRY = 'E:\WyndlewoodUnreal\export\registry_t6.json'
& "$wt\scripts\unreal\run_import.ps1" -Tiers '6' -Log E:\WyndlewoodUnreal\export\t6b_import.log
$env:WYND_ONLY = 'tidehold/'
& "$wt\scripts\unreal\run_py.ps1" -Script "$wt\scripts\unreal\ue\assign_materials.py" -Log E:\WyndlewoodUnreal\export\t6b_assign.log
$env:WYND_DIAG_ID = 'tidehold/bank'
& "$wt\scripts\unreal\run_py.ps1" -Script "$wt\scripts\unreal\ue\diag_materials.py" -Log E:\WyndlewoodUnreal\export\t6b_diag.log
python -I "$wt\scripts\unreal\merge_registry.py" "$ue\Assets\asset_registry.json" E:\WyndlewoodUnreal\export\registry_t6.json | Add-Content E:\WyndlewoodUnreal\export\run_all.log
'T6REDODONE' | Add-Content E:\WyndlewoodUnreal\export\run_all.log
