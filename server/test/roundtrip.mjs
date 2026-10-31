// Delete/restore round trip on a SCRATCH page you own: node server/test/roundtrip.mjs <page-url-or-id>
// Deletes scattered blocks (text, list items, code, divider) through the real MCP server, restores them,
// and checks the page reads back identical. Uses a temp deletion log, not ~/.notion-desktop-mcp.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const page = process.argv[2];
if (!page) { console.error('usage: node roundtrip.mjs <scratch page url or id>'); process.exit(2); }
const client = new Client({ name: 'notion-desktop-mcp-roundtrip', version: '0' });
await client.connect(new StdioClientTransport({
  command: process.execPath, args: [fileURLToPath(new URL('../index.mjs', import.meta.url))],
  env: { ...process.env, NOTION_DESKTOP_MCP_HOME: path.join(os.tmpdir(), `notion-desktop-mcp-test-${Date.now()}`) }, stderr: 'inherit',
}));
const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content[0].text;
  if (r.isError) throw new Error(text);
  try { return JSON.parse(text); } catch { return text; }
};

const SAMPLE = '## Round trip\n\nPlain with **bold**, *italic*, `code` and a [link](https://example.com).\n\n- bullet one\n  - nested child\n- bullet two\n\n- [x] done item\n- [ ] open item\n\n> a quote\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\n---\n\nlast line';
const outline = await call('notion_outline', { page });
if (!outline.blocks.some(b => b[3].startsWith('Round trip'))) await call('notion_insert', { page, markdown: SAMPLE, position: 'top' });

const blocks = (await call('notion_outline', { page })).blocks;
const start = blocks.findIndex(b => b[3].startsWith('Round trip'));
const mine = blocks.slice(start, start + 12);
const pick = mine.filter(b => /^(Plain with|bullet two|done item|last line)/.test(b[3]) || ['code', 'divider'].includes(b[1])).map(b => b[2]);
assert.equal(pick.length, 6, `expected 6 sample blocks, got ${pick.length}`);

const before = (await call('notion_read', { page })).markdown;
const del = await call('notion_delete_blocks', { page, block_ids: pick, confirm: true });
assert.equal(del.deleted, 6);
const mid = (await call('notion_read', { page })).markdown;
assert.ok(!mid.includes('Plain with') && !mid.includes('flowchart'), 'blocks still there after delete');
await call('notion_restore_blocks', { deletion_id: del.deletion_id });
const after = (await call('notion_read', { page })).markdown;
assert.equal(after, before, 'page differs after restore');
console.log('PASS: 6 scattered blocks deleted and restored, page identical');
await client.close();
