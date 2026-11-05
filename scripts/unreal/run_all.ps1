# Full pipeline driver: manifest -> decompress/merge/KTX2 transcode -> batched Interchange import
# (idempotent, resumable). Honors the pause flag E:\WyndlewoodUnreal\export\PAUSE between batches
# (run_import.ps1 waits on it before it launches Unreal), so nothing is cut off mid-save.
# Usage: run_all.ps1 -Tiers 2,3,4,5 -Batch 150   (tier 6 = tidehold buildings is imported by run_tidehold.ps1)
param([string]$Tiers = '2,3,4,5', [int]$Batch = 150)
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
$wt = 'C:\Users\cdero\Apps\woa-unreal-assets'
$man = 'E:\WyndlewoodUnreal\export\asset_manifest.json'
$reg = 'E:\WyndlewoodUnreal\EnvSlice\Content\Wyndlewood\Assets\asset_registry.json'
$rlog = 'E:\WyndlewoodUnreal\export\run_all.log'
function Count-Reg { if (Test-Path $reg) { return @(Select-String -Path $reg -Pattern '"path"').Count } else { return 0 } }
Remove-Item Env:\WYND_REGISTRY, Env:\WYND_ONLY -ErrorAction SilentlyContinue  # never inherit the tidehold run's overrides
Set-Location $wt
if (-not (Test-Path $man)) { node scripts/unreal/build_manifest.mjs $man }
node scripts/unreal/decompress_glbs.mjs $man E:\WyndlewoodUnreal\export\assets_glb $Tiers *> E:\WyndlewoodUnreal\export\decompress.log
Get-Content E:\WyndlewoodUnreal\export\decompress.log -Tail 1 | Add-Content $rlog
$stalls = 0
for ($i = 0; $i -lt 60; $i++) {
  $blog = "E:\WyndlewoodUnreal\export\import_b$i.log"
  & "$wt\scripts\unreal\run_import.ps1" -Tiers $Tiers -Limit $Batch -Log $blog
  $m = Select-String -Path $blog -Pattern 'WYND done imported=(\d+) registry=(\d+)' | Select-Object -Last 1
  $n = if ($m) { [int]$m.Matches[0].Groups[1].Value } else { 0 }
  "batch $i imported $n" + $(if ($m) { " registry " + $m.Matches[0].Groups[2].Value } else { ' (no summary line)' }) | Add-Content $rlog
  if ($n -eq 0) { $stalls++ } else { $stalls = 0 }
  if ($stalls -ge 2) { break }
}
'DONE' | Add-Content $rlog

