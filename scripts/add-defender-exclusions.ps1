# add-defender-exclusions.ps1
# Adds Windows Defender exclusions for the dsh runtime to cut cold-start cost.
#
# Why (measured, desktop.log 2026-09-04):
#   - Cold boot (machine just started): dsh spawn -> HTTP ready took 44.6s
#     (shell startup-to-ready 60.3s), warm restart ~8.6s. The delta is dominated
#     by Defender real-time scanning of node.exe + 8000+ JS files in the npx
#     seed tree on first read after boot.
#   - Excluding these paths removes the per-file scan on cold start.
#
# Trade-off note: %USERPROFILE%\.dsh holds dsh data/storages/credentials.
# Excluding it speeds up dsh boot file IO but means files there are NOT
# scanned by Defender. Review before keeping; remove anytime via
#   Remove-MpPreference -ExclusionPath <path>
#
# Requires admin (self-elevates). Idempotent. No reboot needed.

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $PSCommandPath) -Verb RunAs
  exit
}

try {
  $pref = Get-MpPreference
} catch {
  Write-Host "Get-MpPreference failed - Defender may be disabled or a third-party AV is active. Nothing to do."
  exit 1
}

$paths = @(
  (Join-Path $env:LOCALAPPDATA "npm-cache\_npx"),
  (Join-Path $env:USERPROFILE ".dsh"),
  "D:\deepseek harness\deepseek-harness\apps\cli\lib"
)
$processes = @("node.exe")

Write-Host "== Current path exclusions =="
$pref.ExclusionPath
Write-Host "== Current process exclusions =="
$pref.ExclusionProcess
Write-Host ""

foreach ($p in $paths) {
  if (-not (Test-Path $p)) { Write-Host "[!] Skip (not found): $p"; continue }
  if (@($pref.ExclusionPath) -contains $p) { Write-Host "[=] Already excluded: $p"; continue }
  Add-MpPreference -ExclusionPath $p
  Write-Host "[+] Path excluded: $p"
}

foreach ($proc in $processes) {
  if (@($pref.ExclusionProcess) -contains $proc) { Write-Host "[=] Already excluded: $proc"; continue }
  Add-MpPreference -ExclusionProcess $proc
  Write-Host "[+] Process excluded: $proc"
}

Write-Host ""
Write-Host "Done. Takes effect on the next dsh start (no reboot needed)."
