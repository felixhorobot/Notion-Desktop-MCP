#!/usr/bin/env node
// Entry point (also the npx bin). Plugin installs ship without node_modules, so the first run installs
// the dependencies into the package root, then starts the server.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
try { createRequire(import.meta.url).resolve('@modelcontextprotocol/sdk/package.json'); } catch {
  console.error('[notion-desktop-mcp] first run: installing dependencies…');
  // stdout belongs to MCP stdio, so npm's output goes to stderr
  const r = spawnSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: root, stdio: ['ignore', 2, 2], shell: process.platform === 'win32' });
  if (r.status !== 0) { console.error('[notion-desktop-mcp] npm install failed; run it yourself in', root); process.exit(1); }
}
await import('./index.mjs');
