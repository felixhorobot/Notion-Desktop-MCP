# Start Notion desktop in Claude-debug mode (CDP port 9222) or normal mode.
#   notion.ps1 -Mode debug    -> Notion with --remote-debugging-port=9222 (notion-desktop-mcp MCP can connect)
#   notion.ps1 -Mode normal   -> Notion without the port (nothing local can drive it)
# Debug mode also disables occlusion backgrounding: a covered window otherwise reports "hidden", rAF stops and
# every Playwright locator.click times out on the "stable" check.
# Restarts Notion only when the current mode differs; Notion saves continuously, so a restart loses nothing.
param([ValidateSet('debug', 'normal')][string]$Mode = 'debug')

$port = 9222
# Microsoft Store install first, then the notion.so installer's per-user location
$pkg = Get-AppxPackage com.notion.app.desktop.notion
$exe = if ($pkg) { Join-Path $pkg.InstallLocation 'Notion\Notion.exe' } else { Join-Path $env:LOCALAPPDATA 'Programs\Notion\Notion.exe' }
if (-not (Test-Path $exe)) { Write-Error "Notion desktop not found (checked Microsoft Store and $exe)."; exit 1 }

function Test-DebugPort {
    try { Invoke-WebRequest -UseBasicParsing "http://localhost:$port/json/version" -TimeoutSec 2 | Out-Null; $true } catch { $false }
}

$running = [bool](Get-Process Notion -ErrorAction SilentlyContinue)
$inDebug = $running -and (Test-DebugPort)

if ($Mode -eq 'debug' -and $inDebug) { Write-Output 'Notion is already in debug mode.'; exit 0 }
if ($Mode -eq 'normal' -and $running -and -not $inDebug) { Write-Output 'Notion is already in normal mode.'; exit 0 }

if ($running) {
    Get-Process Notion -ErrorAction SilentlyContinue | Stop-Process -Force
    for ($i = 0; $i -lt 20 -and (Get-Process Notion -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 250 }
}

if ($Mode -eq 'debug') {
    # -WindowStyle Normal: the shortcut runs this script hidden, and Notion would inherit the hidden state
    Start-Process -FilePath $exe -ArgumentList "--remote-debugging-port=$port", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding" -WindowStyle Normal
    for ($i = 0; $i -lt 60; $i++) { if (Test-DebugPort) { Write-Output "Notion started in debug mode (port $port)."; exit 0 }; Start-Sleep -Milliseconds 500 }
    Write-Error "Notion started but port $port did not open within 30 s."; exit 1
} else {
    Start-Process -FilePath $exe -WindowStyle Normal
    Write-Output 'Notion started in normal mode.'
}
