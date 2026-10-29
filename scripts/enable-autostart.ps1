$ErrorActionPreference='Stop'
$App=Split-Path $PSScriptRoot -Parent
$Action=New-ScheduledTaskAction -Execute "$env:WINDIR\System32\cmd.exe" -Argument ('/c "' + $App + '\start.cmd"') -WorkingDirectory $App
$Trigger=New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$Settings=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName 'Alien Local Agent' -Action $Action -Trigger $Trigger -Settings $Settings -Description 'Start Alien after this user logs in' -Force | Out-Null
Write-Host 'Alien will start when this Windows user logs in. This is not an unattended pre-login Windows service.'
