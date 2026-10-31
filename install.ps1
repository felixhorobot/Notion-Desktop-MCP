# One-time setup WITHOUT the plugin system: installs the MCP server's dependencies, registers it with
# Claude Code and adds two desktop shortcuts ("Notion (Claude debug)" / "Notion (normal)").
# Installed as a plugin? Then only run this with -ShortcutsOnly.
# Run from the cloned folder:  powershell -ExecutionPolicy Bypass -File install.ps1
param([switch]$NoShortcuts, [switch]$ShortcutsOnly)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot -replace '\\', '/'

foreach ($cmd in $(if ($ShortcutsOnly) { @() } else { 'node', 'npm', 'claude' })) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Write-Error "'$cmd' not found on PATH. Install it first (see README)."; exit 1 }
}

if (-not $ShortcutsOnly) {
    Write-Output 'Installing MCP server dependencies...'
    npm install --prefix "$root" --omit=dev --no-audit --no-fund --silent
    if ($LASTEXITCODE) { exit $LASTEXITCODE }

    Write-Output 'Registering MCP server "notion-desktop-mcp" (user scope)...'
    # PowerShell 5.1 turns a native command's stderr into an error, which 'Stop' makes fatal:
    # removing a server that isn't there (first install) prints to stderr, so relax it here
    $ErrorActionPreference = 'Continue'
    claude mcp remove notion-desktop-mcp --scope user *> $null
    $ErrorActionPreference = 'Stop'
    claude mcp add notion-desktop-mcp --scope user -- node "$root/server/start.mjs"
    if ($LASTEXITCODE) { exit $LASTEXITCODE }

    # link the skill into ~/.claude/skills so Claude Code loads SKILL.md
    $skillDir = Join-Path $HOME '.claude\skills\notion-desktop-mcp'
    if (Test-Path $skillDir) { Write-Warning "$skillDir already exists - left as is." }
    else {
        New-Item -ItemType Directory -Force (Split-Path $skillDir) | Out-Null
        New-Item -ItemType Junction -Path $skillDir -Target (Join-Path $PSScriptRoot 'skills\notion-desktop-mcp') | Out-Null
        Write-Output "Linked skill -> $skillDir"
    }
}

if (-not $NoShortcuts) {
    $shell = New-Object -ComObject WScript.Shell
    $desktop = [Environment]::GetFolderPath('Desktop')
    foreach ($mode in 'debug', 'normal') {
        $name = if ($mode -eq 'debug') { 'Notion (Claude debug)' } else { 'Notion (normal)' }
        $lnk = $shell.CreateShortcut((Join-Path $desktop "$name.lnk"))
        $lnk.TargetPath = 'powershell.exe'
        $lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSScriptRoot\launcher\notion.ps1`" -Mode $mode"
        $lnk.IconLocation = "$PSScriptRoot\launcher\notion.ico"
        $lnk.Save()
    }
    Write-Output 'Desktop shortcuts created.'
}

Write-Output 'Done. Start Notion with "Notion (Claude debug)", then restart Claude Code.'
