# Downloads the CC0 Poly Haven assets the env slice uses, from the official
# Poly Haven API and file host only, into a folder outside git, and writes
# downloaded.csv (asset, file, bytes, sha256, url). Licence: CC0 1.0
# (https://polyhaven.com/license); see ../THIRD_PARTY_ASSETS.md.
param([string]$Dest = 'E:\WyndlewoodUnreal\ThirdParty\polyhaven')
$ErrorActionPreference = 'Stop'
$textures = 'leafy_grass', 'dirt_floor', 'coast_sand_01', 'rock_pitted_mossy', 'mossy_cobblestone'
$models = 'grass_medium_02', 'grass_bermuda_01', 'dandelion_01', 'flower_gazania', 'flower_ursinia', 'periwinkle_plant'
$ua = @{ 'User-Agent' = 'WyndlewoodEnvSlice/1.0' }
$jobs = @()
foreach ($a in $textures) {
  $f = Invoke-RestMethod -Uri "https://api.polyhaven.com/files/$a" -Headers $ua
  foreach ($m in 'Diffuse', 'nor_dx', 'arm', 'Displacement') {
    $jobs += [pscustomobject]@{ asset = $a; file = "$($a)_$($m)_2k.png"; url = $f.$m.'2k'.png.url }
  }
}
foreach ($a in $models) {
  $f = Invoke-RestMethod -Uri "https://api.polyhaven.com/files/$a" -Headers $ua
  $g = $f.gltf.'1k'.gltf
  $jobs += [pscustomobject]@{ asset = $a; file = "$($a)_1k.gltf"; url = $g.url }
  # the glTF ships JPG colour with no alpha: fetch the cut-out mask beside it
  $mask = if ($f.Alpha) { $f.Alpha } else { $f.opacity }
  if ($mask) { $jobs += [pscustomobject]@{ asset = $a; file = "cutout/$($a)_alpha_1k.png"; url = $mask.'1k'.png.url } }
  foreach ($p in $g.include.PSObject.Properties) {
    $jobs += [pscustomobject]@{ asset = $a; file = $p.Name; url = $p.Value.url }
  }
}
$log = @()
foreach ($r in $jobs) {
  if ($r.url -notmatch '^https://dl\.polyhaven\.org/') { throw "refusing non Poly Haven url $($r.url)" }
  $out = Join-Path (Join-Path $Dest $r.asset) $r.file
  New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
  if (-not (Test-Path $out)) { Invoke-WebRequest -Uri $r.url -OutFile $out -UseBasicParsing -Headers $ua }
  $log += [pscustomobject]@{
    asset = $r.asset; file = $r.file; bytes = (Get-Item $out).Length
    sha256 = (Get-FileHash $out -Algorithm SHA256).Hash; url = $r.url
  }
}
$log | Export-Csv (Join-Path $Dest 'downloaded.csv') -NoTypeInformation
"downloaded $($log.Count) files, $([math]::Round(($log | Measure-Object bytes -Sum).Sum / 1MB, 1)) MB"
