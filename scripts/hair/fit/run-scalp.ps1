<#
.SYNOPSIS
  Run the Avensky hair/scalp authoring tools on Windows without putting Blender in PATH.
.DESCRIPTION
  Inspect is non-destructive. cap-dry-run generates a JSON receipt only.
  cap-build ONLY writes to a new -OutputBlend path; original source is preserved.
.EXAMPLE
  .\run-scalp.ps1 -Mode inspect -CharacterGlb "C:\AvenskyPrivate\villager-female.garage.glb" -Report "C:\AvenskyPrivate\head.json"
.EXAMPLE
  .\run-scalp.ps1 -Mode cap-dry-run -SceneBlend "C:\AvenskyPrivate\vesper_head_guides.blend" -Armature "Armature" -HeadBone "head" -UpVector "0,0,1" -MetersPerUnit 1.0 -Report "C:\AvenskyPrivate\preflight.json"
#>
param(
  [Parameter(Mandatory=$true)]
  [ValidateSet('inspect','cap-dry-run','cap-build')]
  [string]$Mode,
  [string]$CharacterGlb,
  [string]$SceneBlend,
  [string]$Armature,
  [string]$HeadBone,
  [string]$UpVector,
  [Nullable[double]]$MetersPerUnit,
  [string]$Report,
  [string]$OutputBlend,
  [string]$BlenderExe
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Find-Blender {
  if ($BlenderExe) {
    if (-not (Test-Path -LiteralPath $BlenderExe -PathType Leaf)) { throw "Blender not found: $BlenderExe" }
    return (Resolve-Path -LiteralPath $BlenderExe).Path
  }
  $command = Get-Command 'blender.exe' -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $folders = @()
  if ($env:ProgramFiles) { $folders += (Join-Path $env:ProgramFiles 'Blender Foundation') }
  if ($env:LOCALAPPDATA) { $folders += (Join-Path $env:LOCALAPPDATA 'Programs\Blender Foundation') }
  foreach ($folder in $folders) {
    if (-not (Test-Path -LiteralPath $folder)) { continue }
    $matches = @(Get-ChildItem -LiteralPath $folder -Directory -ErrorAction SilentlyContinue |
      Sort-Object Name -Descending |
      ForEach-Object { Join-Path $_.FullName 'blender.exe' } |
      Where-Object { Test-Path -LiteralPath $_ -PathType Leaf })
    if ($matches.Count -gt 0) { return $matches[0] }
  }
  throw 'Blender is not installed in a standard location. Install Blender or pass -BlenderExe "C:\...\blender.exe".'
}

if ([string]::IsNullOrWhiteSpace($Report)) { throw '-Report is required for every mode' }
$base = $PSScriptRoot
$exe = Find-Blender
$reportPath = [System.IO.Path]::GetFullPath($Report)
if ($Mode -eq 'inspect') {
  if (-not $CharacterGlb -or -not (Test-Path -LiteralPath $CharacterGlb -PathType Leaf)) {
    throw '-CharacterGlb must reference the actual binary character GLB'
  }
  $arguments = @('-b','--python',(Join-Path $base 'inspect_character.py'),'--',
    '--character-glb',$CharacterGlb,'--report',$reportPath)
} else {
  if (-not $SceneBlend -or -not (Test-Path -LiteralPath $SceneBlend -PathType Leaf)) { throw '-SceneBlend must be an existing private .blend' }
  if (-not $Armature -or -not $HeadBone -or -not $UpVector -or $null -eq $MetersPerUnit) {
    throw 'Pass explicit -Armature, -HeadBone, -UpVector and -MetersPerUnit. These must match the inspected scene.'
  }
  $arguments = @('-b',$SceneBlend,'--python',(Join-Path $base 'build_scalp_cap.py'),'--',
    '--armature-object',$Armature,'--head-bone',$HeadBone,
    '--up-vector',$UpVector,
    '--meters-per-unit', $MetersPerUnit.Value.ToString([System.Globalization.CultureInfo]::InvariantCulture),
    '--report',$reportPath)
  if ($Mode -eq 'cap-build') {
    if (-not $OutputBlend) { throw '-OutputBlend is required for cap-build' }
    $out = [System.IO.Path]::GetFullPath($OutputBlend)
    if (Test-Path -LiteralPath $out) { throw "Refusing to overwrite: $out" }
    if ($out -eq [System.IO.Path]::GetFullPath($SceneBlend)) { throw 'Output must be separate from source' }
    $arguments += @('--write','--output-blend',$out)
  }
}
Write-Host "[Avensky Hair] Blender: $exe"
Write-Host "[Avensky Hair] Mode: $Mode"
& $exe @arguments
if ($LASTEXITCODE -ne 0) { throw "Blender authoring step failed (exit $LASTEXITCODE)" }
Write-Host "[Avensky Hair] Report: $reportPath"
