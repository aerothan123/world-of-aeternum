param([string]$From='',[string]$To='',[string]$Gen='',[string]$List='',[string]$Tag='go',[string]$Post='')
$env:Path=[Environment]::GetEnvironmentVariable('Path','Machine')+';'+[Environment]::GetEnvironmentVariable('Path','User')
$N='C:\Users\cdero\Apps\woa-story-notes'
$W='C:\Users\cdero\Apps\woa-story'
$log="$N\logs\$Tag.log"
Set-Location $W
"BEGIN $(Get-Date -Format o) from=$From to=$To gen=$Gen list=$List" | Out-File $log -Encoding utf8
if ($From -and $To) {
  foreach ($row in (git diff --name-status $From $To)) {
    $parts = $row -split "`t"
    $st = $parts[0]; $p = $parts[-1]
    if ($p.StartsWith('.wip/')) { continue }
    if ($st -eq 'D') { Remove-Item $p -ErrorAction SilentlyContinue; "del $p" | Out-File $log -Append -Encoding utf8; continue }
    $dir = Split-Path $p -Parent
    if ($dir) { New-Item -ItemType Directory -Force $dir | Out-Null }
    $q = [char]34
    cmd /c "git show $($To):$p > $q$p$q"
    "put $st $p $LASTEXITCODE" | Out-File $log -Append -Encoding utf8
  }
}
foreach ($g in $Gen.Split(',')) {
  switch ($g) {
    'touchup' { node "$N\rebase_touchup.mjs" 2>&1 | Out-File $log -Append -Encoding utf8 }
    'tscbase' { Copy-Item "$N\logs\r7.tsc.log" "$N\logs\tsc_base.log" -Force }
    'qlg' { cmd /c npx tsx scripts/quest_leveling_gear_gen.ts 2>&1 | Out-File $log -Append -Encoding utf8 }
    'icons' { node "$N\import_c1_icons.mjs" 2>&1 | Out-File $log -Append -Encoding utf8 }
    'media' { node scripts/build_media_manifest.mjs generate 2>&1 | Out-File $log -Append -Encoding utf8 }
    'i18n' { cmd /c npm run i18n:gen 2>&1 | Out-File $log -Append -Encoding utf8 }
    'wiki' { cmd /c npm run wiki:content 2>&1 | Out-File $log -Append -Encoding utf8 }
    'tsc' {
      node_modules\.bin\tsc --noEmit -p tsconfig.json *> "$N\logs\$Tag.tsc.log"
      & "$N\tscdiff.ps1" -Name "$Tag.tsc" 2>&1 | Out-File $log -Append -Encoding utf8
    }
    'biome' {
      $files = (git status --porcelain | ForEach-Object { $_.Substring(3).Trim('"') } | Where-Object { $_ -match '\.(ts|mjs)$' -and $_ -notmatch 'generated|i18n.locales' })
      node_modules\.bin\biome check $files *> "$N\logs\$Tag.biome.log"
      Get-Content "$N\logs\$Tag.biome.log" | Select-String -Pattern 'Found|lint/|format' | Select-Object -First 40 | Out-File $log -Append -Encoding utf8
    }
    'status' { git status --short | Out-File $log -Append -Encoding utf8 }
  }
  if ($g) { "== gen $g done exit $LASTEXITCODE" | Out-File $log -Append -Encoding utf8 }
}
if ($List) { $env:VT_CWD=$W; node "$N\vt2.mjs" "$N\tx\$List" 2>&1 | Out-File $log -Append -Encoding utf8 }
if ($Post) { & "$N\tx\$Post" 2>&1 | Out-File $log -Append -Encoding utf8 }
"END $(Get-Date -Format o)" | Out-File $log -Append -Encoding utf8
