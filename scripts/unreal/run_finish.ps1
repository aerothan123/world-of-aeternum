# Waits for the batch import driver, then merges registries, assigns materials to all meshes, and commits.
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
$wt = 'C:\Users\cdero\Apps\woa-unreal-assets'
$ue = 'E:\WyndlewoodUnreal\EnvSlice'
$flog = 'E:\WyndlewoodUnreal\export\finish.log'
while (-not ((Test-Path E:\WyndlewoodUnreal\export\run_all.log) -and ((Get-Content E:\WyndlewoodUnreal\export\run_all.log -Raw) -match '(?m)^DONE\s*$') -and ((Get-Content E:\WyndlewoodUnreal\export\run_all.log -Raw) -match 'MONDONE'))) { Start-Sleep 60 }
$n = python -I "$wt\scripts\unreal\merge_registry.py" "$ue\Content\Wyndlewood\Assets\asset_registry.json" E:\WyndlewoodUnreal\export\registry_t1.json
$n = python -I "$wt\scripts\unreal\merge_registry.py" "$ue\Content\Wyndlewood\Assets\asset_registry.json" E:\WyndlewoodUnreal\export\registry_t6.json
"registry entries: $n" | Add-Content $flog
Remove-Item Env:\WYND_ONLY -ErrorAction SilentlyContinue
Remove-Item Env:\WYND_REGISTRY -ErrorAction SilentlyContinue
& "$wt\scripts\unreal\run_py.ps1" -Script "$wt\scripts\unreal\ue\assign_materials.py" -Log E:\WyndlewoodUnreal\export\all_assign.log
Set-Location $ue
git add Content/Wyndlewood/Assets Content/Wyndlewood/Materials/Assets Content/Wyndlewood/Materials/Master
git -c user.name=aerothan123 -c user.email=cderose13@gmail.com commit -q -m "feat(assets): import props, furniture, weapons and creatures as Nanite static meshes" -m "Batch Interchange import of the remaining game GLBs with box collision, master-material instances and the asset id to Unreal path registry." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SUvW6kbA7x9tAFTjhNjJLN" *>> $flog
Set-Location $wt
git add scripts/unreal
git -c user.name=aerothan123 -c user.email=cderose13@gmail.com commit -q -m "fix(unreal): split Eastbrook vertex-colour semantics into material slots" -m "Town COLOR_0 values are classified with the same palette as the web surface atlas so plaster, stone, timber and roof get their own master instances; adds emissive, KTX2 fallback and material assignment scripts." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SUvW6kbA7x9tAFTjhNjJLN" *>> $flog
git push origin feature/unreal-asset-convert *>> $flog
'FINISHED' | Add-Content $flog



