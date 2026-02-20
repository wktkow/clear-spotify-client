<#
.SYNOPSIS
    Uninstalls the Clear Spotify client mod and restores vanilla Spotify.
.DESCRIPTION
    - Kills Spotify and vis-capture daemon
    - Restores Spotify to vanilla state via spicetify restore
    - Removes Clear theme files
    - Resets spicetify configuration
    - Removes vis-capture binary and scheduled task
    - Launches clean Spotify
.NOTES
    Run in PowerShell. Does NOT uninstall spicetify itself — only the Clear mod.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$themeName = "Clear"

function Write-Step($msg) { Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "   $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "   $msg" -ForegroundColor Yellow }

# ── 1. Kill Spotify and vis-capture ──────────────────────────────────────────
Write-Step "Stopping running processes"

$spotifyProcs = Get-Process -Name "Spotify" -ErrorAction SilentlyContinue
if ($spotifyProcs) {
    $spotifyProcs | Stop-Process -Force
    Start-Sleep -Seconds 2
    Write-Ok "Spotify stopped"
} else {
    Write-Ok "Spotify was not running"
}

$visProcs = Get-Process -Name "vis-capture" -ErrorAction SilentlyContinue
if ($visProcs) {
    $visProcs | Stop-Process -Force
    Start-Sleep -Seconds 1
    Write-Ok "vis-capture stopped"
} else {
    Write-Ok "vis-capture was not running"
}

# ── 2. Restore Spotify to vanilla ───────────────────────────────────────────
Write-Step "Restoring Spotify to vanilla"

$spicetifyCmd = Get-Command spicetify -ErrorAction SilentlyContinue
if ($spicetifyCmd) {
    try {
        & spicetify restore
        Write-Ok "Spotify restored to vanilla state"
    } catch {
        Write-Warn "spicetify restore returned non-zero (may already be vanilla)"
    }
} else {
    Write-Warn "spicetify not found in PATH — skipping restore"
}

# ── 3. Remove Clear theme files ─────────────────────────────────────────────
Write-Step "Removing Clear theme files"

$spicetifyDir = $null
try {
    $pathOutput = & spicetify path -c 2>$null
    if ($pathOutput -and (Test-Path (Split-Path $pathOutput))) {
        $spicetifyDir = Split-Path $pathOutput
    }
} catch {}

if (-not $spicetifyDir) {
    $candidates = @(
        "$env:APPDATA\spicetify",
        "$env:USERPROFILE\.spicetify"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { $spicetifyDir = $c; break }
    }
}

if ($spicetifyDir) {
    $clearDir = Join-Path $spicetifyDir "Themes\$themeName"
    if (Test-Path $clearDir) {
        Remove-Item -Recurse -Force $clearDir
        Write-Ok "Removed $clearDir"
    } else {
        Write-Ok "Theme directory already gone"
    }

    # Reset spicetify config
    try { & spicetify config current_theme "" } catch {}
    try { & spicetify config inject_theme_js 0 } catch {}
    try { & spicetify config color_scheme "" } catch {}
    try { & spicetify config extensions "" } catch {}
    Write-Ok "Reset spicetify configuration"
} else {
    Write-Warn "Could not locate spicetify config directory"
}

# ── 4. Remove vis-capture daemon ─────────────────────────────────────────────
Write-Step "Removing audio visualizer daemon"

# Remove scheduled task
$taskName = "ClearVisCapture"
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Ok "Removed '$taskName' scheduled task"
} else {
    Write-Ok "No scheduled task found"
}

# Remove binary
$visDir = Join-Path $env:LOCALAPPDATA "ClearVis"
if (Test-Path $visDir) {
    Remove-Item -Recurse -Force $visDir
    Write-Ok "Removed $visDir"
} else {
    Write-Ok "vis-capture directory already gone"
}

# Remove legacy startup shortcut if present
$legacyShortcut = Join-Path ([System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup")) "ClearVis.lnk"
if (Test-Path $legacyShortcut) {
    Remove-Item $legacyShortcut -Force
    Write-Ok "Removed legacy startup shortcut"
}

# ── 5. Launch clean Spotify ──────────────────────────────────────────────────
Write-Step "Launching Spotify"

$spotifyExe = $null
$candidates = @(
    "$env:APPDATA\Spotify\Spotify.exe",
    "$env:LOCALAPPDATA\Microsoft\WindowsApps\Spotify.exe",
    "${env:ProgramFiles}\WindowsApps\SpotifyAB.SpotifyMusic_*\Spotify.exe",
    "${env:ProgramFiles(x86)}\Spotify\Spotify.exe"
)

foreach ($c in $candidates) {
    $resolved = Resolve-Path $c -ErrorAction SilentlyContinue
    if ($resolved) { $spotifyExe = $resolved.Path; break }
}

if ($spotifyExe) {
    Start-Process $spotifyExe
    Write-Ok "Spotify launched"
} else {
    try {
        Start-Process "spotify"
        Write-Ok "Spotify launched"
    } catch {
        Write-Warn "Could not auto-launch Spotify — please start it manually"
    }
}

Write-Host "`n   Clear has been completely removed." -ForegroundColor Green
Write-Host "   Spotify is back to its vanilla state." -ForegroundColor White
Write-Host ""
