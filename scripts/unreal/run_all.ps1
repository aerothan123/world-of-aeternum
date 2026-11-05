# Full pipeline driver: manifest -> decompress/merge -> batched Interchange import (idempotent, resumable).
param([string]$Tiers = '1,2,3,4,5', [int]$Batch = 200)
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
$wt = 'C:\Users\cdero\Apps\woa-unreal-assets'
$man = 'E:\WyndlewoodUnreal\export\asset_manifest.json'
Set-Location $wt
if (-not (Test-Path $man)) { node scripts/unreal/build_manifest.mjs $man }
node scripts/unreal/decompress_glbs.mjs $man E:\WyndlewoodUnreal\export\assets_glb $Tiers *> E:\WyndlewoodUnreal\export\decompress.log
for ($i = 0; $i -lt 40; $i++) {
  $before = (Get-Content E:\WyndlewoodUnreal\EnvSlice\Content\Wyndlewood\Assets\asset_registry.json -Raw | ConvertFrom-Json).PSObject.Properties.Count
  & "$wt\scripts\unreal\run_import.ps1" -Tiers $Tiers -Limit $Batch -Log "E:\WyndlewoodUnreal\export\import_$i.log"
  $after = (Get-Content E:\WyndlewoodUnreal\EnvSlice\Content\Wyndlewood\Assets\asset_registry.json -Raw | ConvertFrom-Json).PSObject.Properties.Count
  "batch $i registry $before -> $after" | Add-Content E:\WyndlewoodUnreal\export\run_all.log
  if ($after -le $before) { break }
}
'DONE' | Add-Content E:\WyndlewoodUnreal\export\run_all.log
