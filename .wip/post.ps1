param([string]$Tag='r')
$N='C:\Users\cdero\Apps\woa-story-notes'
Set-Location C:\Users\cdero\Apps\woa-story
& "$N\snap.ps1" -Ref 'wip/wyndlewood-story-final'
Get-Content "$N\logs\snap.log" | Out-String
$log = Get-ChildItem "$N\logs" -Filter 'r*.log' | Where-Object { $_.Name -notmatch 'tsc|biome' } | Sort-Object LastWriteTime | Select-Object -Last 1
$txt = Get-Content $log.FullName | Where-Object { $_ -match '^(PASS|FAIL) |FAILED FILES|AssertionError|Expected|Received|^\+ |^- |test\.ts:\d+|NEW:|total current|apply|put ' }
$out = "$N\logs\summary.txt"
$txt | Out-File $out -Encoding utf8
& "$N\tscdiff.ps1" -Name "$($log.BaseName).tsc" | Out-File $out -Append -Encoding utf8
$b = git hash-object -w $out
$tree = ("100644 blob $b`tsummary.txt" | git mktree)
$c = git -c user.name=aerothan123 -c user.email=cderose13@gmail.com commit-tree $tree -m "wip: test log (not for merge)"
git push -f origin "$($c):refs/heads/wip/wyndlewood-story-logs" 2>&1 | Out-String
