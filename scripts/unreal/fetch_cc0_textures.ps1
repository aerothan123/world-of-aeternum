# Downloads CC0 detail textures (normal GL + roughness, 1k PNG) from Poly Haven (CC0) and logs each one.
param([string]$Out = 'E:\WyndlewoodUnreal\export\cc0')
$map = [ordered]@{
  Stone = 'castle_wall_slates'; Plaster = 'clay_plaster'; Wood = 'brown_planks_03'; Roof = 'thatch_roof_angled';
  Metal = 'rusty_metal_02'; Cloth = 'fabric_pattern_05'; Foliage = 'leaves_forest_ground'; Moss = 'mossy_stone_wall'
}
New-Item -ItemType Directory -Force $Out | Out-Null
$log = Join-Path $Out 'download_log.md'
foreach ($k in $map.Keys) {
  $id = $map[$k]
  $files = Invoke-RestMethod "https://api.polyhaven.com/files/$id"
  foreach ($kind in @(@('nor_gl','N'), @('rough','R'))) {
    $u = $files.($kind[0]).'1k'.png.url
    $dst = Join-Path $Out ("T_{0}_{1}.png" -f $k, $kind[1])
    if (-not (Test-Path $dst)) { Invoke-WebRequest $u -OutFile $dst }
    "{0} | {1} | Poly Haven | CC0 1.0 | https://polyhaven.com/a/{2} | {3} | {4}" -f (Get-Date -Format s), $k, $id, $kind[0], $u | Add-Content $log
  }
}
Get-ChildItem $Out -Filter *.png | Select Name, Length
