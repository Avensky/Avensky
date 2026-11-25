# Watches an approved private asset folder and uploads exact-manifest matches only.
# Use -InstallAtLogon once to register a per-user Task Scheduler job. No AWS keys in the task.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string[]]$Manifest,
    [switch]$InstallAtLogon
)
$ErrorActionPreference = "Stop"
$python = (Get-Command py.exe -ErrorAction Stop).Source
$publisher = Join-Path $PSScriptRoot "staging_upload.py"
$sourcePath = (Resolve-Path -LiteralPath $Source -ErrorAction Stop).Path
$arguments = @("-3", $publisher, "--source", $sourcePath, "--profile", "avensky-lightsail", "--upload", "--watch")
foreach ($path in $Manifest) {
    $resolved = (Resolve-Path -LiteralPath $path -ErrorAction Stop).Path
    $arguments += @("--manifest", $resolved)
}
if ($InstallAtLogon) {
    # Windows file and directory paths cannot contain a double quote.
    $quotedArguments = ($arguments | ForEach-Object { '"' + $_ + '"' }) -join " "
    $taskName = "Avensky Private Staging Asset Watcher"
    $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $action = New-ScheduledTaskAction -Execute $python -Argument $quotedArguments -WorkingDirectory $PSScriptRoot
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
    $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
    Start-ScheduledTask -TaskName $taskName
    Write-Host "Started and registered $taskName for $user"
    Write-Host "Stop with: Stop-ScheduledTask -TaskName '$taskName'"
    Write-Host 'Remove with: Unregister-ScheduledTask -TaskName "Avensky Private Staging Asset Watcher" -Confirm:$false'
} else {
    & $python @arguments
    exit $LASTEXITCODE
}
