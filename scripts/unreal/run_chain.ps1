# Order requested by the coordinator: tidehold buildings first, then tiers 2-5, then the finish step.
$wt = 'C:\Users\cdero\Apps\woa-unreal-assets'
& "$wt\scripts\unreal\run_tidehold.ps1"
& "$wt\scripts\unreal\run_all.ps1" -Tiers '2,3,4,5' -Batch 150
& "$wt\scripts\unreal\run_finish.ps1"
