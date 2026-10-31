// notion-desktop-mcp MCP server: Notion-specific tools over the user's running Notion desktop app (CDP :9222).
// Safety lives here, not in the prompt: deletes need confirm:true, guest workspaces need allow_shared:true,
// every deleted block is saved as Markdown first so notion_restore_blocks can put it back.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { chromium } from 'playwright-core';
import { startRelay, UP } from './relay.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.join(here, '..', 'skills', 'notion-desktop-mcp', 'scripts');
const helpers = createRequire(import.meta.url)(path.join(SCRIPTS, 'helpers.js'));
const MARKDOWN = fs.readFileSync(path.join(SCRIPTS, 'markdown.js'), 'utf8').replace(/^\/\/.*$/gm, '').trim();
const LOG = path.join(process.env.NOTION_DESKTOP_MCP_HOME || path.join(os.homedir(), '.notion-desktop-mcp'), 'deletions.jsonl');
const VERSION = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8')).version;

// ---------- connection ----------
let browser, relayPort;
async function connect() {
  if (browser?.isConnected()) return browser;
  try { await fetch(`http://${UP}/json/version`); } catch {
    throw new Error('Notion is not running in debug mode (nothing on localhost:9222). Ask the user, then call notion_launch (it restarts Notion in debug mode).');
  }
  relayPort ??= await startRelay();
  browser = await chromium.connectOverCDP(`http://localhost:${relayPort}`, { timeout: 15000 });
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) await helpers.default({ page: p });
    ctx.on('page', p => helpers.default({ page: p }));
  }
  return browser;
}
const notionPages = b => b.contexts().flatMap(c => c.pages()).filter(p => p.url().startsWith('https://app.notion.com/'));

/** The page to act on: `url` (any part of it, e.g. the page id) or the active Notion tab. */
async function target(url) {
  const pages = notionPages(await connect()).filter(p => !p.url().includes('/blank'));
  if (url) {
    const id = (url.match(/[0-9a-f]{32}/i) || [url])[0].replace(/-/g, '');
    const p = pages.find(p => p.url().replace(/-/g, '').includes(id));
    if (p) { await p.n.tabs.activate((await p.title()).slice(0, 40)).catch(() => {}); return p; }
    const host = pages[0];
    if (!host) throw new Error('no Notion tab open');
    await host.goto(url.startsWith('http') ? url : `https://app.notion.com/p/${id}`);
    await host.waitForSelector('.notion-frame', { timeout: 20000 });
    return host;
  }
  let active;
  try { active = (await pages[0]?.n.tabs.list())?.find(t => t.active)?.title; } catch {}
  for (const p of pages) if (active && (await p.title()).startsWith(active)) return p;
  if (!pages.length) throw new Error('no Notion page tab open');
  return pages[0];
}
const ready = p => p.waitForSelector('.notion-page-content', { timeout: 15000 });
// The switcher text can be missing (collapsed sidebar, tab still loading); try every Notion tab.
async function workspace(p) {
  for (const q of [p, ...notionPages(await connect()).filter(x => x !== p)]) {
    const ws = await q.evaluate(() => (document.querySelector('.notion-sidebar-switcher')?.innerText || '').replace(/\s+/g, ' ').trim()).catch(() => '');
    if (ws) return ws;
  }
  return '';
}
// Fail closed: an unknown workspace counts as shared.
const isGuest = ws => !ws || /\bGuest\b/i.test(ws);
const pageTitle = p => p.evaluate(() => (document.querySelector('.notion-page-block h1, .notion-frame h1')?.textContent || document.title).trim());

// ---------- deletion log ----------
const readLog = () => { try { return fs.readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse); } catch { return []; } };
const writeLog = entries => { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.writeFileSync(LOG, entries.map(e => JSON.stringify(e)).join('\n') + '\n'); };
const appendLog = e => { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.appendFileSync(LOG, JSON.stringify(e) + '\n'); };

// ---------- block operations ----------
/** Mermaid blocks in "preview only" mode have no code in the DOM. Switch these to "code and preview" so a
 *  backup can read the source (used before deleting; the view change goes away with the block). */
async function revealHiddenCode(p, ids) {
  const hidden = await p.evaluate(ids => ids.flatMap(id => {
    const el = document.querySelector(`[data-block-id="${id}"]`);
    return el ? [...el.querySelectorAll('.notion-code-block'), ...(el.matches('.notion-code-block') ? [el] : [])]
      .filter(c => c.querySelector('svg[id^="mermaid-"]') && !c.querySelector('[contenteditable="true"]'))
      .map(c => c.getAttribute('data-block-id')) : [];
  }), ids);
  for (const id of hidden) {
    const blk = p.locator(`[data-block-id="${id}"]`).first();
    await blk.scrollIntoViewIfNeeded(); const bb = await blk.boundingBox();
    await p.mouse.move(bb.x + bb.width / 2, bb.y + 20); await p.waitForTimeout(400);
    const btn = p.locator('[aria-label^="Open language preview format"]').filter({ visible: true }).first();
    const b2 = await btn.boundingBox(); if (!b2) throw new Error(`cannot reveal mermaid code of ${id}; refusing to delete without a backup`);
    await p.mouse.click(b2.x + b2.width / 2, b2.y + b2.height / 2); await p.waitForTimeout(400);
    const b3 = await p.locator('[aria-label="Show code and preview"]').first().boundingBox();
    await p.mouse.click(b3.x + b3.width / 2, b3.y + b3.height / 2); await p.waitForTimeout(800);
    await p.n.esc();
  }
  return hidden.length;
}
/** Put the caret in a fresh empty block at the top of the page body. */
async function caretAtTop(p) {
  await p.n.esc();
  const title = p.locator('.notion-page-block h1[contenteditable="true"], .notion-frame h1[contenteditable="true"]').first();
  await title.scrollIntoViewIfNeeded().catch(() => {});
  const box = await title.boundingBox();
  if (!box) throw new Error('page title not found; cannot insert at top');
  await p.mouse.click(box.x + box.width - 3, box.y + box.height / 2);
  await p.keyboard.press('End'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
}
/** Put the caret in a fresh empty block after `anchor` (block id or text). Non-text anchors: select the block, then Enter. */
async function caretAfter(p, anchor) {
  await p.n.esc();
  const b = /^[0-9a-f-]{36}$/.test(anchor) ? p.n.blockById(anchor) : p.n.block(anchor);
  if (!(await b.count())) throw new Error(`anchor block not found: ${anchor}`);
  // hover → the gutter "+" (Click to add below) works for every block type; Enter inside code/divider/DB doesn't
  await b.scrollIntoViewIfNeeded().catch(() => {});
  const box = await b.boundingBox();
  const anchorId = await b.getAttribute('data-block-id');
  const before = new Set((await p.n.outline()).blocks.map(x => x[2]));
  // the "+" must belong to THIS block: a stale gutter of another hovered block can still be visible
  let pb = null;
  for (const fx of [0.4, 0.15, 0.7]) {
    await p.mouse.move(5, 5); await p.mouse.move(box.x + box.width * fx, box.y + Math.min(12, box.height / 2), { steps: 4 }); await p.waitForTimeout(450);
    // the gutter sits on the block's first line (headings have top padding): accept one within the top 48px, nearest first
    const cands = [];
    for (const c of await p.locator('[aria-label^="Click to add below"]').filter({ visible: true }).all()) {
      const cb = await c.boundingBox(); if (!cb) continue;
      const cy = cb.y + cb.height / 2;
      if (cy >= box.y - 4 && cy <= box.y + Math.min(box.height, 48)) cands.push({ cb, d: Math.abs(cy - box.y) });
    }
    pb = cands.sort((a, b) => a.d - b.d)[0]?.cb || null;
    if (pb) break;
  }
  if (!pb) throw new Error(`no "add below" button for ${anchor}`);
  await p.mouse.click(pb.x + pb.width / 2, pb.y + pb.height / 2); await p.waitForTimeout(500);
  if (await p.n.menuText()) await p.keyboard.press('Backspace'); // "+" opens the block menu (a hidden "/"): Backspace closes it, keeps the block
  await p.waitForTimeout(200);
  // verify: the new empty block sits right after the anchor (same parent)
  const after = (await p.n.outline()).blocks;
  const i = after.findIndex(x => x[2] === anchorId);
  const next = after.slice(i + 1).find(x => x[0] <= after[i][0] && !before.has(x[2])) || after.slice(i + 1).find(x => !before.has(x[2]));
  if (!next || next[3]) { await p.n.esc(); throw new Error(`new block did not appear right after ${anchor}; nothing pasted`); }
}
/** Select exactly one block (blue halo): the hover drag handle opens the block menu and selects the block for
 *  every type (Escape keeps the selection). Click-in + Escape doesn't select code blocks or dividers. */
async function selectBlock(p, b) {
  await p.n.esc();
  await b.scrollIntoViewIfNeeded().catch(() => {});
  const box = await b.boundingBox();
  await p.mouse.move(box.x + 30, box.y + Math.min(12, box.height / 2)); await p.waitForTimeout(400);
  const hb = await p.locator('[aria-label^="Drag to move"]').filter({ visible: true }).first().boundingBox();
  if (hb) { await p.mouse.click(hb.x + hb.width / 2, hb.y + hb.height / 2); await p.waitForTimeout(400); await p.keyboard.press('Escape'); }
  await p.waitForTimeout(250);
  const sel = await p.evaluate(() => [...document.querySelectorAll('.notion-selectable-halo')].map(h => h.closest('[data-block-id]')?.getAttribute('data-block-id')));
  return sel;
}
const PAD = 'notion-desktop-mcp-pad'; // throwaway line, see insertMarkdown
async function insertMarkdown(p, markdown, { after, position }) {
  const r = await p.n.guard(async () => {
    if (after) await caretAfter(p, after);
    else if (position === 'top') await caretAtTop(p);
    else {
      const last = (await p.n.fullOutline()).blocks.filter(b => b[0] === 0).pop()?.[2];
      if (!last) await caretAtTop(p); else await caretAfter(p, last);
    }
    // Notion only parses Markdown when the paste has 2+ non-empty lines; a lone "### Title" stays literal text.
    // So a single line gets a throwaway pad line, whose block is deleted right after (selected by id, not Backspace:
    // the caret isn't reliably in it after a paste).
    const single = markdown.trim().split('\n').filter(l => l.trim()).length === 1;
    await p.n.paste(single ? `${markdown.trim()}\n\n${PAD}` : markdown);
    await p.n.esc();
  });
  const pad = r.added.find(b => b[3] === PAD);
  if (pad) {
    const sel = await selectBlock(p, p.n.blockById(pad[2]));
    if (sel.length === 1 && sel[0] === pad[2]) { await p.keyboard.press('Delete'); await p.waitForTimeout(400); }
    await p.n.esc();
    r.added = r.added.filter(b => b !== pad);
  }
  return r;
}

// ---------- server ----------
// Sent to every MCP client at connect time, so agents without the Claude Code skill still get the essentials.
const INSTRUCTIONS = `notion-desktop-mcp controls the user's Notion Desktop app through its debug mode (localhost:9222).
- Start with notion_status. If Notion is not in debug mode, ask the user, then call notion_launch (it restarts Notion; nothing is lost).
- Read before writing: notion_outline gives block ids, notion_read gives Markdown.
- Write in big pieces: one notion_insert per section, notion_create_database for tables of data.
- Edits are live and visible to everyone who shares the page. Say which workspace you are in before editing.
- Deleting: call notion_delete_blocks / notion_trash_page without confirm to get a preview, show it to the user, and only pass confirm:true after they agree. In guest/shared workspaces also pass allow_shared:true, only with the user's explicit yes. Never delete through notion_run_code (it skips the backup).
- Undo: notion_restore_blocks puts deleted blocks back; notion_restore_page restores pages and databases from Notion Trash.
- Never change Notion settings, sharing, or permissions unless the user asked for exactly that.
Full guide: skills/notion-desktop-mcp/SKILL.md in the package.`;
const server = new McpServer({ name: 'notion-desktop-mcp', version: VERSION }, { instructions: INSTRUCTIONS });
const ok = data => ({ content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 1) }] });
const tool = (name, description, shape, fn) => server.registerTool(name, { description, inputSchema: shape }, async args => {
  try { return await fn(args); } catch (e) { return { isError: true, content: [{ type: 'text', text: `${name} failed: ${e.message}` }] }; }
});
const PAGE = { page: z.string().optional().describe('Page URL or id. Default: the active Notion tab.') };

tool('notion_launch', 'Start (or restart) Notion in debug mode so the other tools can connect, or back to normal mode. It RESTARTS Notion (nothing is lost, Notion saves continuously); ask the user first. Windows tested; macOS untested.',
  { mode: z.enum(['debug', 'normal']).default('debug') },
  async ({ mode }) => {
    const launcher = path.join(here, '..', 'launcher', process.platform === 'win32' ? 'notion.ps1' : 'notion.sh');
    if (!['win32', 'darwin'].includes(process.platform)) throw new Error(`no launcher for ${process.platform}; start Notion with --remote-debugging-port=9222 yourself`);
    const [cmd, args] = process.platform === 'win32'
      ? ['powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', launcher, '-Mode', mode]]
      : ['sh', [launcher, mode]];
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 60000 });
    if (r.status !== 0) throw new Error((r.stderr || r.stdout || `launcher exited ${r.status}`).trim());
    browser = null; // reconnect on next call
    return ok((r.stdout || '').trim());
  });

tool('notion_status','Check the connection: debug port, workspace, open tabs, active page and access level. Call first.', {}, async () => {
  const p = await target();
  const tabs = await p.n.tabs.list().catch(() => null);
  return ok({ connected: true, active: { title: await p.title(), url: p.url() }, access: await p.n.access().catch(e => e.message), tabs });
});

tool('notion_open', 'Open a Notion page by URL or id in the active tab.', { url: z.string() }, async ({ url }) => {
  const p = await target(url); await ready(p).catch(() => {});
  return ok({ title: await p.title(), url: p.url() });
});

tool('notion_outline', 'List the page blocks as [depth, type, id, first 80 chars]. Use the ids for insert/delete.', PAGE, async ({ page }) => {
  const p = await target(page); await ready(p); return ok(await p.n.fullOutline());
});

tool('notion_read', 'Read the page (or some blocks) as Markdown.', { ...PAGE, block_ids: z.array(z.string()).optional() }, async ({ page, block_ids }) => {
  const p = await target(page); await ready(p);
  const r = await p.evaluate(`(${MARKDOWN})(${JSON.stringify(block_ids || null)})`);
  return ok({ title: await pageTitle(p), url: p.url(), markdown: r.md, lossy: r.blocks.filter(b => b.lossy).map(b => `${b.type}: ${b.title}`), missing: r.missing });
});

tool('notion_insert', 'Insert Markdown as new blocks (headings, lists, to-dos, quotes, code incl. ```mermaid, tables, links). Never edits existing blocks; rolls back if any existing block disappears.',
  { ...PAGE, markdown: z.string(), after: z.string().optional().describe('Block id (or unique text) to insert after'), position: z.enum(['top', 'end']).optional().describe('Used when `after` is not given. Default end.') },
  async ({ page, markdown, after, position }) => {
    const p = await target(page); await ready(p);
    const r = await insertMarkdown(p, markdown, { after, position });
    return ok({ added: r.added.map(b => b.slice(1)) });
  });

tool('notion_create_database', 'Create a full database in ONE step from a Markdown table (header row = property names, other rows = entries). Much faster than adding rows/cells one by one: pastes the table, turns it into a database and names it. Columns start as text; change types afterwards with notion_run_code (n.db.headerMenu) if needed.',
  { ...PAGE, title: z.string(), table: z.string().describe('Markdown table, e.g. "| Name | Owner |\\n| --- | --- |\\n| Task | Sam |"'), after: z.string().optional(), position: z.enum(['top', 'end']).optional() },
  async ({ page, title, table, after, position }) => {
    const p = await target(page); await ready(p);
    const r = await insertMarkdown(p, table.trim(), { after, position });
    const tbl = r.added.find(b => b[1] === 'table');
    if (!tbl) throw new Error('the Markdown did not produce a table; check the header separator row (| --- |)');
    await p.n.esc();
    const tb = p.locator(`[data-block-id="${tbl[2]}"]`).first(); await tb.scrollIntoViewIfNeeded();
    // the block before the table locates the new database after conversion (it may get a new id)
    const vis = (await p.n.outline()).blocks.filter(x => x[0] === tbl[0]);
    const prevId = vis[vis.findIndex(x => x[2] === tbl[2]) - 1]?.[2];
    await tb.locator('td').first().click(); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    await p.keyboard.press('ControlOrMeta+/'); await p.waitForTimeout(700);
    await p.getByRole('option', { name: /Turn into database/ }).first().click(); await p.waitForTimeout(2500);
    const now = (await p.n.outline()).blocks.filter(x => x[0] === tbl[0]);
    const db = now.find(x => x[2] === tbl[2] && x[1] === 'collection_view') || now[now.findIndex(x => x[2] === prevId) + 1];
    if (!db || db[1] !== 'collection_view') throw new Error('table was not turned into a database');
    // name it; scoped to THIS database (every DB title keeps placeholder="New database" even when filled).
    // No Ctrl+A: in an empty title it selects the whole page, and typing would replace it.
    const ph = p.locator(`[data-block-id="${db[2]}"] [placeholder="New database"]`).first(); const b = await ph.boundingBox();
    if (b) {
      await p.mouse.click(b.x + 5, b.y + b.height / 2); await p.waitForTimeout(250);
      const inTitle = await p.evaluate(() => document.activeElement?.getAttribute('placeholder') === 'New database' && !document.activeElement.textContent);
      if (inTitle) { await p.keyboard.type(title); await p.keyboard.press('Escape'); await p.waitForTimeout(600); }
    }
    await p.n.esc();
    return ok({ database: title, block_id: db[2] });
  });

tool('notion_delete_blocks','Delete blocks by id. Without confirm:true it only previews. Text blocks are saved as Markdown to the local deletion log (restore with notion_restore_blocks); child pages and databases go to Notion Trash (restore with notion_restore_page). Guest/shared workspaces also need allow_shared:true; only after the user said yes.',
  { ...PAGE, block_ids: z.array(z.string()).min(1), confirm: z.boolean().optional(), allow_shared: z.boolean().optional() },
  async ({ page, block_ids, confirm, allow_shared }) => {
    const p = await target(page); await ready(p);
    const ws = await workspace(p);
    const snap = await p.evaluate(`(${MARKDOWN})(${JSON.stringify(block_ids)})`);
    if (snap.missing.length) throw new Error(`blocks not on this page: ${snap.missing.join(', ')}`);
    const top = snap.blocks.filter(b => block_ids.includes(b.id));
    const preview = { page: await pageTitle(p), workspace: ws, will_delete: top.map(b => `${b.type}: ${b.title}`), including_children: snap.blocks.length - top.length, markdown_backup: snap.md };
    if (isGuest(ws) && !allow_shared) return ok({ ...preview, refused: 'Guest/shared workspace: other people see this page. Ask the user, then call again with allow_shared:true and confirm:true.' });
    if (!confirm) return ok({ ...preview, note: 'Preview only. Call again with confirm:true to delete.' });
    if (await revealHiddenCode(p, block_ids)) { // re-snapshot now that mermaid source is visible
      Object.assign(snap, await p.evaluate(`(${MARKDOWN})(${JSON.stringify(block_ids)})`));
    }

    // where to put them back: previous sibling, else parent; in document order
    // blocks sit in id-less wrapper divs, so siblings come from the block tree, not the DOM siblings
    const anchors = await p.evaluate(ids => {
      const root = document.querySelector('.notion-page-content');
      const parentOf = el => { for (let q = el.parentElement; q && q !== root; q = q.parentElement) if (q.hasAttribute('data-block-id') && q.getAttribute('data-block-id') !== el.getAttribute('data-block-id')) return q.getAttribute('data-block-id'); return null; };
      const seen = new Set(), all = [];
      for (const el of root.querySelectorAll('[data-block-id]')) { const id = el.getAttribute('data-block-id'); if (!seen.has(id)) { seen.add(id); all.push({ id, parent: parentOf(el) }); } }
      return all.filter(b => ids.includes(b.id)).map(b => {
        const sibs = all.filter(s => s.parent === b.parent);
        return { id: b.id, prev: sibs[sibs.findIndex(s => s.id === b.id) - 1]?.id || null, parent: b.parent };
      });
    }, block_ids);
    // adjacent deleted blocks form one group, restored together after the group's surviving neighbour
    const groups = [];
    for (const a of anchors) {
      const md = (await p.evaluate(`(${MARKDOWN})(${JSON.stringify([a.id])})`)).md;
      const g = groups.at(-1);
      if (g && a.prev === g.ids.at(-1)) { g.ids.push(a.id); g.markdown += '\n\n' + md; }
      else groups.push({ ids: [a.id], prev: a.prev, parent: a.parent, markdown: md });
    }
    const entry = { id: `del_${Date.now().toString(36)}`, at: new Date().toISOString(), page_url: p.url(), page_title: preview.page, workspace: ws, anchors, groups, markdown: snap.md, blocks: snap.blocks, restored: false };
    appendLog(entry); // log BEFORE deleting, so nothing is lost if the delete half-fails

    const removed = [];
    for (const id of block_ids) {
      const b = p.n.blockById(id);
      const sel = await selectBlock(p, b);
      if (sel.length !== 1 || sel[0] !== id) {
        await p.n.esc();
        if (!removed.length) { writeLog(readLog().filter(x => x.id !== entry.id)); throw new Error(`could not select only block ${id} (selected: ${JSON.stringify(sel)}); nothing was deleted.`); }
        throw new Error(`could not select only block ${id} (selected: ${JSON.stringify(sel)}); deleted so far: ${removed.length}. Log ${entry.id} keeps the backup.`); }
      await p.keyboard.press('Delete'); await p.waitForTimeout(500);
      if (await p.locator(`.notion-page-content [data-block-id="${id}"]`).count()) throw new Error(`block ${id} still present after Delete`);
      removed.push(id);
    }
    await p.n.esc();
    const trashed = snap.blocks.filter(b => ['page', 'collection_view', 'collection_view_page'].includes(b.type) && block_ids.includes(b.id)).map(b => b.title);
    return ok({ deleted: removed.length, deletion_id: entry.id, restore: `notion_restore_blocks {"deletion_id":"${entry.id}"}`, in_notion_trash: trashed });
  });

tool('notion_list_deletions', 'List blocks deleted through this server (newest first) with their Markdown backups.', { limit: z.number().optional() }, async ({ limit = 10 }) =>
  ok(readLog().reverse().slice(0, limit).map(e => ({ deletion_id: e.id, at: e.at, page: e.page_title, url: e.page_url, restored: e.restored, blocks: e.blocks.filter(b => e.anchors.some(a => a.id === b.id)).map(b => `${b.type}: ${b.title}`) }))));

tool('notion_restore_blocks', 'Put deleted blocks back where they were (as new blocks, from the Markdown backup). Default: the latest unrestored deletion. Child pages/databases are not in the backup; use notion_restore_page for those.',
  { deletion_id: z.string().optional() },
  async ({ deletion_id }) => {
    const log = readLog();
    const e = deletion_id ? log.find(x => x.id === deletion_id) : [...log].reverse().find(x => !x.restored);
    if (!e) throw new Error(deletion_id ? `no deletion ${deletion_id}` : 'nothing to restore');
    if (e.restored && deletion_id) throw new Error(`${e.id} was already restored at ${e.restored}`);
    if (!e.markdown.trim()) throw new Error(`${e.id} has no text content to restore (pages/databases are in Notion Trash: use notion_restore_page)`);
    const p = await target(e.page_url); await ready(p);
    const groups = e.groups || [{ prev: e.anchors[0]?.prev, parent: e.anchors[0]?.parent, markdown: e.markdown }];
    const placed = [], added = [];
    for (const g of groups.filter(g => g.markdown.trim())) {
      const present = new Set((await p.n.fullOutline()).blocks.map(b => b[2]));
      let where;
      if (g.prev && present.has(g.prev)) where = { after: g.prev };
      else if (g.parent && present.has(g.parent)) where = { after: g.parent };
      else where = { position: g.prev ? 'end' : 'top' };
      const r = await insertMarkdown(p, g.markdown, where);
      placed.push(where); added.push(...r.added.map(b => b.slice(1)));
    }
    e.restored = new Date().toISOString();
    writeLog(log);
    return ok({ restored: e.id, placed, added, note: 'Restored as new blocks (new ids). Colours, toggle state, code language (except mermaid) and formatting beyond bold/italic/code/links/strike are not carried.' });
  });

tool('notion_trash_page', 'Move the current page to Notion Trash (30 days, restorable). The title must match exactly. Without confirm:true it only previews. Guest workspaces usually disallow this.',
  { ...PAGE, title: z.string(), confirm: z.boolean().optional(), allow_shared: z.boolean().optional() },
  async ({ page, title, confirm, allow_shared }) => {
    const p = await target(page); await ready(p);
    const actual = await pageTitle(p), ws = await workspace(p), url = p.url();
    if (actual !== title) throw new Error(`title is "${actual}", not "${title}"; refusing`);
    if (isGuest(ws) && !allow_shared) return ok({ refused: 'Guest/shared workspace. Ask the user, then call again with allow_shared:true and confirm:true.', page: actual });
    if (!confirm) return ok({ will_trash: actual, url, workspace: ws, note: 'Preview only. Call again with confirm:true.' });
    await p.n.trashPage(title);
    appendLog({ id: `trash_${Date.now().toString(36)}`, at: new Date().toISOString(), page_url: url, page_title: actual, workspace: ws, anchors: [], markdown: '', blocks: [{ type: 'page', title: actual }], restored: false });
    return ok({ trashed: actual, url, restore: `notion_restore_page {"url":"${url}"}` });
  });

tool('notion_restore_page', 'Restore a page or database from Notion Trash, by URL (opens it and clicks "Restore page") or by exact title (searches the sidebar Trash of the current workspace).',
  { url: z.string().optional(), title: z.string().optional() },
  async ({ url, title }) => {
    if (!url && !title) throw new Error('give url or title');
    if (url) {
      const p = await target(url); await p.waitForTimeout(2000);
      const btn = p.getByRole('button', { name: 'Restore page', exact: true });
      if (!(await btn.count())) return ok({ note: 'No "Restore page" banner; the page is not in Trash (or you lack access).', url: p.url() });
      await btn.first().click(); await p.waitForTimeout(1500);
      const still = await p.evaluate(() => /moved this page to Trash/.test(document.body.innerText));
      if (still) throw new Error('clicked Restore page but the Trash banner is still there');
      markRestored(e => e.page_url === url);
      return ok({ restored: await pageTitle(p), url: p.url() });
    }
    const p = await target();
    await p.n.esc(); await p.n.away();
    const more = p.locator('[aria-label="Library, Trash, more…"]').first();
    let opener = (await more.count()) ? more : p.locator('.notion-sidebar').getByText('Trash', { exact: true }).first();
    const ob = await opener.boundingBox(); if (!ob) throw new Error('sidebar Trash not found (guest workspaces have no Trash)');
    await p.mouse.click(ob.x + ob.width / 2, ob.y + ob.height / 2); await p.waitForTimeout(700);
    if (opener === more) { const it = p.locator('[role="menu"], .notion-overlay-container').getByText('Trash', { exact: true }).last(); const ib = await it.boundingBox(); await p.mouse.click(ib.x + ib.width / 2, ib.y + ib.height / 2); await p.waitForTimeout(1000); }
    const input = p.locator('input[placeholder="Search pages in Trash"]');
    await input.focus(); await p.keyboard.type(title); await p.waitForTimeout(1800);
    const esc = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const row = p.getByRole('menuitem').filter({ hasText: new RegExp(`^${esc}$`) });
    const n = await row.count();
    if (n !== 1) { await p.n.esc(); throw new Error(n ? `${n} pages in Trash are titled "${title}"; restore by URL instead` : `"${title}" not found in Trash`); }
    const rb = await row.boundingBox(); await p.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2); await p.waitForTimeout(250);
    const btn = row.locator('[aria-label="Restore page"]').first(); const bb = await btn.boundingBox();
    await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.waitForTimeout(1500);
    const left = await p.getByRole('menuitem').filter({ hasText: new RegExp(`^${esc}$`) }).count();
    await p.n.esc();
    if (left) throw new Error('clicked Restore but the page is still listed in Trash');
    markRestored(e => e.page_title === title && !e.markdown);
    return ok({ restored: title });
  });
function markRestored(match) { const log = readLog(); const e = [...log].reverse().find(x => !x.restored && match(x)); if (e) { e.restored = new Date().toISOString(); writeLog(log); } }

tool('notion_switch_workspace', 'Switch the Notion window to another workspace/account by name. Tell the user, and switch back when done.', { name: z.string() }, async ({ name }) => {
  const p = await target(); return ok({ now: await p.n.workspace(name) });
});

tool('notion_screenshot', 'Screenshot of the active Notion page (to check layout/diagrams).', PAGE, async ({ page }) => {
  const p = await target(page);
  const buf = await p.screenshot({ type: 'jpeg', quality: 70 });
  return { content: [{ type: 'image', data: buf.toString('base64'), mimeType: 'image/jpeg' }] };
});

tool('notion_run_code', 'Escape hatch: run `async (page) => {...}` against the target page (Playwright Page with page.n helpers: n.db.*, n.table.*, n.tabs.*, n.slash, n.guard… see SKILL.md). Prefer the dedicated tools; never delete with this; use notion_delete_blocks so a backup exists.',
  { ...PAGE, code: z.string() },
  async ({ page, code }) => {
    const p = await target(page);
    const fn = eval(`(${code})`); // the caller is the user's own agent, same trust as a shell
    const r = await fn(p);
    return ok(r === undefined ? 'done' : r);
  });

await server.connect(new StdioServerTransport());
console.error(`[notion-desktop-mcp] MCP server ${VERSION} ready`);
