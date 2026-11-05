# Props crew runner (Windows): every step of one kit pass in one hidden job, so
# a pass needs one launch and one log read. Steps are named on the command
# line and run in order; the log lands in tmp/props_kit/<Name>.log.
#   powershell -File scripts/assets/wyndlewood_props/pc_step.ps1 -Name pass1 -Steps "builds=a+b,apply=a+b,tsc"
param([string]$Name, [string]$Steps, [string]$Ids = '', [string]$Msg = '', [string]$Body = '')
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
Set-Location C:\Users\cdero\Apps\woa-props
foreach ($line in Get-Content C:\Users\cdero\Apps\world-of-aeternum\.env) {
  if ($line -match '^\s*TRIPO_API_KEY\s*=\s*(.+)\s*$') { $env:TRIPO_API_KEY = $Matches[1].Trim().Trim('"') }
}
$Out = "tmp/props_kit/$Name.log"
"start $(Get-Date -Format o) $Steps" | Out-File $Out -Encoding utf8
function Log($t) { $t | Out-File $Out -Append -Encoding utf8 }
function Run($label, [scriptblock]$b) { Log "== $label"; & $b *>> $Out; Log "== $label exit $LASTEXITCODE" }
# A step may carry its own ids: name=id1+id2 (else the -Ids list).
foreach ($tok in ($Steps -split ',')) {
  $parts = $tok.Trim() -split '=', 2
  $s = $parts[0]
  $idList = if ($parts.Count -gt 1) { $parts[1] -split '\+' } else { $Ids -split ' ' | Where-Object { $_ -ne '' } }
  switch ($s) {
    'concepts' { Run concepts { node tmp/props_kit/concepts.mjs @idList } }
    'builds' { Run builds { node tmp/props_kit/build.mjs @idList } }
    'rugtex' { Run rugtex { node tmp/props_kit/rug_tex.mjs furn_braided_rug } }
    'rug' { New-Item -ItemType Directory -Force tmp/props_kit/procedural | Out-Null; Run rug { node tmp/props_kit/rug_disc.mjs tmp/props_kit/concepts/furn_braided_rug_tex0.png tmp/props_kit/procedural/wyn_furn_braided_rug.glb 2.6 1.8 0.05 } }
    'rugs' { foreach ($i in $idList) { Run "rug $i" { node scripts/assets/wyndlewood_props/rug.mjs $i } } }
    'probe' { foreach ($i in $idList) { $d = "tmp/props_kit/probe/$i"; Remove-Item -Recurse -Force $d -ErrorAction SilentlyContinue; Run "probe $i" { node tmp/props_kit/split.mjs $i "tmp/asset_pipeline/wyn_${i}_b0/raw.glb" $d } ; New-Item -ItemType Directory -Force tmp/props_kit/probe_all | Out-Null; Copy-Item "$d/wyn_*.glb" tmp/props_kit/probe_all/ -Force } }
    'probesheet' { Run probesheet { node tmp/props_kit/preview_dir.mjs tmp/props_kit/probe_all "tmp/props_kit/probe_$Name.jpg" hero,front } }
    'split' { foreach ($i in $idList) { $d = "tmp/props_kit/split/" + ($i -replace '^sheet_','' -replace '_smalls$',''); Remove-Item -Recurse -Force $d -ErrorAction SilentlyContinue; Run "split $i" { node tmp/props_kit/split.mjs $i "tmp/asset_pipeline/wyn_${i}_b0/raw.glb" $d } } }
    'lantern' { Run lantern { node tmp/props_kit/build.mjs furn_table_lantern } }
    'apply' { Run apply { node tmp/props_kit/apply.mjs @idList } }
    'review' { New-Item -ItemType Directory -Force "tmp/props_kit/review_$Name" | Out-Null; foreach ($i in $idList) { Copy-Item "public/models/props/wyn_$i.glb" "tmp/props_kit/review_$Name/" -Force }; Run review { node tmp/props_kit/preview_dir.mjs "tmp/props_kit/review_$Name" "tmp/props_kit/review_$Name.jpg" } }
    'conceptsheet' { Run conceptsheet { node tmp/props_kit/concept_sheet.mjs "tmp/props_kit/concepts_$Name.jpg" @idList } }
    'icons' { $env:ONLY = ($idList -join ','); Run icons { node scripts/render_furniture_icons.mjs }; Remove-Item Env:ONLY }
    'shots' {
      $vite = Start-Process npx -ArgumentList 'vite','--port','5272','--strictPort' -PassThru -WindowStyle Hidden
      $ok = $false; for ($i = 0; $i -lt 90; $i++) { Start-Sleep 2; try { Invoke-WebRequest -UseBasicParsing http://localhost:5272/ -TimeoutSec 5 | Out-Null; $ok = $true; break } catch {} }
      Log "vite up $ok"
      $env:GAME_URL = 'http://localhost:5272'; $env:SHOTS_DIR = "tmp/props_kit/shots_$Name"; $env:GPU = '1'
      if ($idList.Count -gt 0 -and $idList[0]) { $env:GROUPS = ($idList -join ',') } else { Remove-Item Env:GROUPS -ErrorAction SilentlyContinue }
      Run shots { node scripts/assets/wyndlewood_props/kit_shots.mjs }
      # Stop only the vite this step started (its process tree).
      if ($vite) { taskkill /PID $vite.Id /T /F *>> $Out }
    }
    'fill' { Run fill { node scripts/assets/wyndlewood_props/fill_rows.mjs } }
    'i18n' { Run i18n { npm run i18n:gen } }
    'wiki' { Run wiki { npm run wiki:content } }
    'manifest' { Run manifest { node scripts/build_media_manifest.mjs generate } }
    'shipped' { $env:UPDATE_SHIPPED_ITEMS = '1'; Run shipped { npx vitest run tests/shipped_item_ids.test.ts }; Remove-Item Env:UPDATE_SHIPPED_ITEMS }
    'tsc' { Run tsc { npx tsc --noEmit } }
    'biome' { $files = git diff --name-only HEAD -- '*.ts' '*.mjs' '*.json' | Where-Object { $_ -notmatch 'generated|i18n.resolved|golden' }; $files += git ls-files --others --exclude-standard -- '*.ts' '*.mjs' | Where-Object { $_ -notmatch '^tmp/' }; Run biome { npx @biomejs/biome check --write @files } }
    'tests' { foreach ($t in @('tests/wyndlewood_props_assets.test.ts','tests/housing_furniture.test.ts','tests/house_furniture.test.ts','tests/recipe_economy.test.ts','tests/item_icons.test.ts','tests/shipped_item_ids.test.ts','tests/i18n_completeness.test.ts','tests/item_art_consistency.test.ts','tests/housing_storage.test.ts','tests/architecture.test.ts','tests/monolith_budget.test.ts','tests/localization_fixes.test.ts','tests/guide.test.ts')) { if (Test-Path $t) { Run "test $t" { npx vitest run $t --reporter=dot } } } }
    'status' { Run status { git status --short } }
    'commit' { git add -A -- public scripts src tests assets_src CREDITS.md docs *>> $Out; $trailer = "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`nClaude-Session: https://claude.ai/code/session_01SUvW6kbA7x9tAFTjhNjJLN"; Run commit { git -c user.name=aerothan123 -c user.email=cderose13@gmail.com commit -m $Msg -m $Body -m $trailer } }
    'push' { Run push { git push origin feature/props-furniture } }
    default { Log "unknown step $s" }
  }
}
Log "done $(Get-Date -Format o)"
