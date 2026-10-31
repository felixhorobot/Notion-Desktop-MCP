// notion-desktop-mcp helpers; required by the MCP server (server/index.mjs) and attached to every Page (CommonJS, `exports.default`).
// Attaches `page.n` to EVERY Playwright Page (patched on the prototype), so inside
// notion_run_code you can write e.g.:
//   async (page) => { const n = page.n; const before = await n.outline(); await n.insertAfter('Planning', md); ... }
// All selectors here were verified live on Notion 7.40 (2026-10-30). See SKILL.md for the why.
const fs = require('fs');
const path = require('path');

const readFn = f => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/^\/\/.*$/gm, '').trim();
const OUTLINE = readFn('outline.js');
const ACCESS = readFn('access.js');
const MENUS = '[role="dialog"], .notion-overlay-container, [role="menu"], [role="listbox"]';

function make(page) {
  const wait = ms => page.waitForTimeout(ms);
  // Outermost database blocks INSIDE the page content. Notion also renders floating copies (sticky header,
  // 24px tall, outside .notion-page-content) and nested inner blocks with the same class; never pick those.
  const db = (i = 0) => page.locator('.notion-page-content .notion-collection_view-block:not(.notion-collection_view-block .notion-collection_view-block)').nth(i);
  const tabBar = () => page.context().pages().find(p => p.url().includes('/renderer/tabs/'));

  const n = {
    wait,

    /** Park the mouse mid-page: in a narrow window the sidebar becomes a hover flyout that covers menus. */
    async away() {
      const [w, h] = await page.evaluate(() => [innerWidth, innerHeight]);
      await page.mouse.move(Math.round(w * 0.6), Math.round(h * 0.6));
    },

    /** Close menus/popups and clear block selection. */
    async esc(times = 3) {
      for (let i = 0; i < times; i++) { await page.keyboard.press('Escape'); await wait(80); }
      // Some side panels (View settings → Conditional color, chart settings) ignore Escape; use their ✕.
      const close = page.locator('[role="dialog"] [aria-label="Close"], [role="dialog"] [aria-label="Close panel"]');
      for (let k = 0; k < 3 && await close.count(); k++) { await close.last().click({ timeout: 1500 }).catch(() => {}); await wait(250); }
    },

    /** Read-only page outline: { url, title, breadcrumb, count, blocks: [[depth, type, id, text]] }
     *  Only blocks Notion has rendered: long pages unmount off-screen blocks; use fullOutline() for diffs. */
    outline: () => page.evaluate(`(${OUTLINE})()`),

    /** Every block of a long page: scrolls top → bottom collecting the outline, then restores the scroll. */
    async fullOutline() {
      const first = await n.outline();
      const dims = await page.evaluate(() => { const s = document.querySelector('.notion-frame .notion-scroller'); return s ? [s.scrollTop, s.scrollHeight, s.clientHeight] : null; });
      if (!dims || dims[1] <= dims[2] + 5) return first;
      const seen = new Map(); const order = [];
      const add = o => { for (const b of o.blocks || []) if (!seen.has(b[2])) { seen.set(b[2], b); order.push(b[2]); } };
      for (let y = 0; ; y += Math.floor(dims[2] * 0.7)) {
        await page.evaluate(y => { document.querySelector('.notion-frame .notion-scroller').scrollTop = y; }, y); await wait(250);
        add(await n.outline());
        if (y + dims[2] >= dims[1]) break;
      }
      await page.evaluate(y => { document.querySelector('.notion-frame .notion-scroller').scrollTop = y; }, dims[0]); await wait(150);
      // Limit: union keeps first-seen order, fine for diffs; positions of blocks seen late may be approximate
      return { ...first, count: order.length, blocks: order.map(id => seen.get(id)) };
    },

    /** Read-only permission / refusal check (see SKILL.md §6). */
    access: () => page.evaluate(`(${ACCESS})()`),

    /** Visible text of whatever menu/popup is open ('' if none). */
    async menuText() {
      return page.evaluate(sel => [...document.querySelectorAll(sel)].filter(e => e.offsetParent || e.getClientRects().length)
        .map(e => e.innerText).join(' ').replace(/\s+/g, ' ').trim(), MENUS);
    },

    /** Click an item with this exact text inside the open menu/dialog (last match = innermost/latest). */
    async clickMenu(label, { exact = true } = {}) {
      const items = page.locator(MENUS).getByText(label, { exact });
      const c = await items.count();
      if (!c) throw new Error(`menu item "${label}" not found; open menu: ${(await n.menuText()).slice(0, 120)}`);
      // noWaitAfter: some items (e.g. compose "Page") open a tab and Playwright would wait for a navigation that never settles here
      await items.last().click({ noWaitAfter: true });
      await wait(300);
    },

    /** Locator for the block whose text contains `text` (innermost), or by data-block-id. */
    block: text => page.locator('.notion-page-content [data-block-id]', { hasText: text }).last(),
    blockById: id => page.locator(`[data-block-id="${id}"]`).first(),

    /** Put the caret at the end of a block (by text or id). */
    async caretAtEnd(anchor) {
      const b = /^[0-9a-f-]{36}$/.test(anchor) ? n.blockById(anchor) : n.block(anchor);
      await b.locator('[contenteditable="true"]').first().click();
      await page.keyboard.press('End');
    },

    /** Paste Markdown at the caret via a synthetic paste event: never touches the user's clipboard and
     *  works when the Notion window is unfocused (clipboard.writeText throws "Document is not focused"). */
    async paste(md) {
      await page.evaluate(t => {
        const dt = new DataTransfer(); dt.setData('text/plain', t);
        document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      }, md);
      await wait(900);
    },

    /**
     * Insert Markdown as new blocks right after `anchor` (block text or id). Never touches existing text.
     * Returns { added: [[depth,type,id,text]], removed: [...] } and THROWS if any pre-existing block vanished.
     */
    async insertAfter(anchor, md) {
      return n.guard(async () => {
        await n.esc();
        await n.caretAtEnd(anchor);
        await page.keyboard.press('Enter');
        await n.paste(md);
        await n.esc();
      });
    },

    /** Type a slash command and pick an option (exact text) or press Enter for the first. */
    async slash(cmd, option) {
      await page.keyboard.type('/' + cmd);
      await wait(600);
      if (option) {
        const items = page.locator(MENUS).locator('[role="option"], [role="menuitem"]').filter({ hasText: option });
        if (await items.count()) await items.first().click({ noWaitAfter: true });
        else await page.locator(MENUS).getByText(new RegExp('^' + option)).first().click({ noWaitAfter: true });
      } else await page.keyboard.press('Enter');
      await wait(400);
    },

    /**
     * Run fn, diff the FULL outline before/after (long pages unmount off-screen blocks, so a plain outline
     * diff reports false losses). If blocks that existed before are really gone, presses Ctrl+Z ONCE -
     * undoing just fn's last edit, never earlier work; and throws. Returns { added, removed }.
     */
    async guard(fn) {
      const before = await n.fullOutline();
      await fn();
      await wait(300);
      const after = await n.fullOutline();
      const ids = o => new Set((o.blocks || []).map(b => b[2]));
      const a = ids(after), b = ids(before);
      // an empty paragraph replaced by pasted content is not a loss
      const removed = (before.blocks || []).filter(x => !a.has(x[2]) && !(x[1] === 'text' && !x[3].trim()));
      const added = (after.blocks || []).filter(x => !b.has(x[2]));
      if (removed.length) {
        await page.keyboard.press('ControlOrMeta+Z'); await wait(400);
        throw new Error(`blocks disappeared, pressed Ctrl+Z once: ${JSON.stringify(removed.map(r => r[3]).slice(0, 5))}; re-check with fullOutline()`);
      }
      return { added, removed };
    },

    /**
     * Create a page (in Private of the current workspace) via Tab Bar "New" → compose menu "1".
     * It opens in a new tab; returns that tab's Page with the title set and caret in the first block.
     */
    async newPage(title) {
      await n.away();
      await n.esc();
      // Notion pre-loads a hidden /blank tab and navigates IT to the new page, so compare URLs, not Page objects.
      const before = new Map(page.context().pages().map(p => [p, p.url()]));
      await tabBar().locator('[aria-label="New"]').click({ timeout: 3000 });
      await wait(600);
      // The compose menu opens in the ACTIVE tab, which may not be `page`. Two variants exist:
      // centred "New page · Press 1 …" or a dropdown "Page · Chat · AI Meeting Notes · Database".
      let host = null, shown = '';
      for (const p of page.context().pages().filter(p => p.url().startsWith('https://app.notion.com/'))) {
        const t = await p.n.menuText();
        if (/New page|\bPage\b.*\bDatabase\b/.test(t)) { host = p; shown = t; break; }
        if (t) shown = t;
      }
      if (!host) throw new Error(`compose menu did not open; something else is showing: "${shown.slice(0, 120)}" (e.g. an update prompt; ask the user, don't dismiss/accept it yourself)`);
      if (/New page/.test(shown)) await host.keyboard.press('1');
      else await host.locator(MENUS).filter({ hasText: 'AI Meeting Notes' }).last().getByText('Page', { exact: true }).first().click({ noWaitAfter: true });
      let fresh;
      for (let t = 0; t < 20 && !fresh; t++) { await wait(250); fresh = page.context().pages().find(p => p.url().includes('app.notion.com/p/') && before.get(p) !== p.url()); }
      if (!fresh) throw new Error('new page tab did not appear');
      await fresh.locator('[placeholder="New page"]').click();
      await fresh.keyboard.type(title);
      await fresh.keyboard.press('Enter');
      await fresh.waitForTimeout(400);
      return fresh;
    },

    /**
     * Move THIS page to Trash; only if its title equals `expectTitle` (safety check).
     * The tab then shows another page; close it with tabs.closeActive() if it duplicates one.
     */
    async trashPage(expectTitle) {
      const title = (await page.locator('.notion-page-block [contenteditable], [placeholder="New page"]').first().innerText()).trim();
      if (title !== expectTitle) throw new Error(`refusing to trash: title is "${title}", expected "${expectTitle}"`);
      await n.actions('Move to Trash');
      await wait(1200);
    },

    /** Open the page "•••" Actions menu (top bar is covered by the drag header, so dispatch). */
    async actions(item) {
      await n.away(); await n.esc(); // the sidebar hover flyout can sit on top of the Actions menu
      await page.locator('.notion-topbar-more-button').first().dispatchEvent('click');
      await wait(600);
      if (item) await n.clickMenu(item);
    },

    /** Switch workspace by name (any logged-in account). */
    async workspace(name) {
      await n.esc();
      await page.locator('.notion-sidebar-switcher').click();
      await wait(600);
      await page.locator('.notion-overlay-container').getByRole('menuitem').filter({ hasText: name }).first().click();
      await wait(3500);
      return (await page.locator('.notion-sidebar-switcher').innerText()).replace(/\s+/g, ' ');
    },

    tabs: {
      /** [{ id, title, active }] */
      list: () => tabBar().evaluate(() => [...document.querySelectorAll('[aria-label^="Close Tab, "]')].map(b => {
        let f = b[Object.keys(b).find(k => k.startsWith('__reactFiber'))];
        while (f && !f.memoizedProps?.tabState) f = f.return;
        const t = f?.memoizedProps.tabState;
        return { id: t?.id, title: t?.title ?? b.getAttribute('aria-label').slice(11), active: !!t?.active };
      })),
      /** Ctrl+T equivalent: open page `title` in a new tab (search opens in this page). */
      async open(title) {
        await n.esc();
        await tabBar().evaluate(() => window.tabsApi.newTab());
        await wait(700);
        await page.keyboard.type(title); await wait(900);
        await page.keyboard.press('Enter'); await wait(1500);
      },
      /** Bring the tab whose title starts with `title` to the front. Block selection (Escape → halo) only works in the active tab. */
      async activate(title) {
        const t = (await n.tabs.list()).find(x => x.title.startsWith(title));
        if (!t) throw new Error(`no tab titled "${title}"`);
        if (!t.active) { await tabBar().evaluate(id => window.tabsApi.handleTabClicked(id), t.id); await wait(800); }
      },
      /** Ctrl+W equivalent. Refuses to close the last tab. */
      async closeActive() {
        const list = await n.tabs.list();
        const i = list.findIndex(t => t.active);
        if (i < 0) throw new Error('no active tab');
        if (list.length === 1) throw new Error('refusing to close the last tab');
        await tabBar().locator('[aria-label^="Close Tab, "]').nth(i).click({ timeout: 3000 });
        return list[i].title;
      },
      /** The Page object for a tab whose title contains `text` (for acting in another tab). */
      page: urlPart => page.context().pages().find(p => p.url().startsWith('https://app.notion.com/p/') && p.url().includes(urlPart)),
    },

    /** Simple tables (/table, pasted Markdown tables): read all cells from the DOM, no scrolling needed. */
    table: {
      read: (i = 0) => page.locator('.notion-page-content .notion-table-block').nth(i).evaluate(t =>
        [...t.querySelectorAll('tr')].map(tr => [...tr.querySelectorAll('td, th')].map(c => c.innerText.trim()))),
      scrollX: (to = 'start', i = 0) => page.locator('.notion-page-content .notion-table-block').nth(i).evaluate((t, to) => {
        let s = t; while (s && !(s.scrollWidth > s.clientWidth + 5)) s = s.querySelector('*') && [...s.querySelectorAll('*')].find(e => e.scrollWidth > e.clientWidth + 5 && /auto|scroll/.test(getComputedStyle(e).overflowX));
        if (!s) return null;
        s.scrollLeft = to === 'start' ? 0 : to === 'end' ? s.scrollWidth : to;
        return { left: Math.round(s.scrollLeft), max: s.scrollWidth - s.clientWidth };
      }, to),
      /** Click a cell (row, col are 0-based; Playwright scrolls it into view) and replace its text. */
      async setCell(row, col, value, i = 0) {
        await n.esc();
        const cell = page.locator('.notion-page-content .notion-table-block').nth(i).locator('tr').nth(row).locator('td, th').nth(col);
        await cell.scrollIntoViewIfNeeded(); await cell.click(); await wait(200);
        // Ctrl+A does NOT select a cell's text, and Shift+Home only selects the last WRAPPED line (both verified).
        // Select the whole editable's contents via the DOM, then type over it.
        const ok = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el.getAttribute('contenteditable') !== 'true') return false;
          const r = document.createRange(); r.selectNodeContents(el);
          const s = getSelection(); s.removeAllRanges(); s.addRange(r);
          return true;
        });
        if (!ok) throw new Error('cell did not enter edit mode');
        await page.keyboard.type(String(value)); await n.esc(2);
      },
    },

    db: {
      at: db,
      /** Wait for the view header to (re-)render: after adding/switching views the tabs vanish for a moment. */
      async ready(i = 0) {
        // page-wide: with one view the "Add view" button may render outside the collection block
        await page.locator('.notion-collection-view-tab, [aria-label="Add view"], .notion-collection-add-view').first().waitFor({ state: 'attached', timeout: 6000 });
        await wait(150);
      },
      async addRow(name, i = 0) {
        await n.esc();
        await db(i).getByRole('button', { name: 'New page', exact: true }).last().click();
        await wait(600); await page.keyboard.type(name); await n.esc(2);
      },
      cell: (row, col, i = 0) => db(i).locator('[data-block-id]').filter({ hasText: row }).last().locator('.notion-table-view-cell').nth(col),
      /** Set a Status/Select-like cell: picks an existing option or (for Select) creates it. */
      async setOption(row, col, value, i = 0) {
        await n.esc();
        await n.db.cell(row, col, i).click(); await wait(500);
        const opt = page.locator(MENUS).getByRole('option').filter({ hasText: new RegExp(`^${value}$`) });
        if (await opt.count()) await opt.first().click();
        else { await page.keyboard.type(value); await wait(300); await page.keyboard.press('Enter'); }
        await wait(300); await n.esc(2);
      },
      async setToday(row, col, i = 0) {
        await n.esc(); await n.db.cell(row, col, i).click(); await wait(500);
        await n.clickMenu('Today'); await n.esc(2);
      },
      async addProperty(type, i = 0) {
        await n.esc();
        const named = db(i).getByRole('button', { name: 'Add property' });
        if (await named.count()) await named.first().click();
        else await db(i).locator('.notion-table-view-header-row [role="button"]').filter({ hasText: /^$/ }).first().click();
        await wait(600);
        if (!(await n.menuText()).includes('Select type')) throw new Error('add-property menu did not open');
        await page.locator('.notion-overlay-container').getByText(type, { exact: true }).first().click();
        await wait(600); await n.esc(2);
      },
      async addView(type, i = 0) {
        // 1 view: labelled "Add view" button · several: hover a tab to reveal + · overflow: "N more…" → New view
        const open = async () => {
          await n.esc(); await n.away(); await n.db.ready(i);
          const more = db(i).getByText(/^\d+ more/);
          if (await more.count()) { await more.first().click(); await wait(500); await n.clickMenu('New view'); await wait(600); return; }
          await db(i).locator('.notion-collection-view-tab').first().hover().catch(() => {});
          await wait(300);
          // The "+ Add view" button can render OUTSIDE the collection block; pick the one vertically nearest this DB.
          const marked = await db(i).evaluate(dbEl => {
            const top = dbEl.getBoundingClientRect().top;
            const btns = [...document.querySelectorAll('[aria-label="Add view"], .notion-collection-add-view')];
            btns.sort((a, b) => Math.abs(a.getBoundingClientRect().top - top) - Math.abs(b.getBoundingClientRect().top - top));
            document.querySelectorAll('[data-claude-addview]').forEach(e => e.removeAttribute('data-claude-addview'));
            if (!btns[0]) return false;
            btns[0].setAttribute('data-claude-addview', '1');
            return true;
          });
          if (!marked) throw new Error('Add view button not found');
          await page.locator('[data-claude-addview]').click();
          await wait(600);
        };
        const before = await n.db.allViews(i);
        // The add-menu is a dialog whose text STARTS with "Add a new view". The lingering settings panel of the
        // previous view has the SAME gridcells and clicking those converts the current view (seen live) -
        // so only ever click inside that exact dialog.
        const addMenu = () => page.locator('[role="dialog"]').filter({ hasText: /^\s*Add a new view/ });
        try { await open(); if (!(await addMenu().count())) throw new Error('menu'); }
        catch { await n.esc(5); await wait(600); await open(); }
        if ((await addMenu().count()) !== 1) throw new Error('"Add a new view" dialog not open; refusing to click any layout cell');
        await addMenu().getByRole('gridcell', { name: type, exact: true }).click();
        await wait(1500);
        // Form view asks "Auto-create form questions…?" with a "Create N questions" button; accept it (test/own DBs).
        const formAsk = page.locator('[role="dialog"]').getByRole('button').filter({ hasText: /^Create \d+ questions?$/ });
        if (await formAsk.count()) { await formAsk.first().click(); await wait(1200); }
        await n.esc(5);
        const after = await n.db.allViews(i);
        const lost = before.filter(v => !after.includes(v));
        if (lost.length) { // an existing view was converted; undo exactly that
          await page.keyboard.press('ControlOrMeta+Z'); await wait(500);
          throw new Error(`addView changed existing views (before ${before.join(',')} → after ${after.join(',')}); pressed Ctrl+Z`);
        }
        // Same-name views are possible (a 2nd "Board"), so only demand growth when the name is new. Never undo here.
        // Names can differ from the type (Form → "Form builder"), so accept any new view name.
        if (!before.includes(type) && !after.includes(type) && !after.some(v => !before.includes(v))) throw new Error(`view "${type}" was not added (views: ${after.join(',')})`);
      },
      // Wide tables: Notion keeps ALL columns in the DOM (no column virtualisation) inside a horizontal
      // `.notion-scroller.horizontal`, so reading never needs scrolling; clicking auto-scrolls the cell into view.
      /** Column names of the table view, left → right. */
      columns: (i = 0) => db(i).locator('.notion-table-view-header-cell').allInnerTexts().then(a => a.map(s => s.trim())),
      /** Whole table as { columns, rows: [{col: value}] }; read straight from the DOM, no scrolling. */
      /**
       * Whole table as { columns, rows: [{col: value}] }. Header cells are all in the DOM, but ROW cells are
       * virtualised horizontally (off-screen cells may not exist; verified on 7.41.1), so this scrolls the
       * table in steps, merges cells by data-col-index, then restores the scroll position.
       */
      async read(i = 0) {
        const merged = new Map(); let cols = [];
        const grab = async () => {
          const t = await n.db._read(i); cols = t.columns;
          for (const r of t.rows) { const m = merged.get(r.id) || {}; Object.assign(m, r.cells); merged.set(r.id, m); }
          return t.rows.length;
        };
        for (let k = 0; k < 3 && !(await grab()) && cols.length; k++) await wait(500); // re-render after filter/sort
        const pos = await n.db.scrollX('start', i);
        if (pos && pos.max > 0) {
          const step = await db(i).evaluate(d => Math.max(200, Math.round(d.querySelector('.notion-scroller.horizontal').clientWidth * 0.8)));
          await wait(150); await grab();
          for (let x = step; x < pos.max + step; x += step) { await n.db.scrollX(Math.min(x, pos.max), i); await wait(200); await grab(); }
          await n.db.scrollX(pos.left, i);
        }
        const rows = [...merged.values()].map(cells => Object.fromEntries(cols.map((c, k) => [c, cells[k] ?? ''])));
        return { columns: cols, rows };
      },
      _read: (i = 0) => db(i).evaluate(d => {
        const cols = [...d.querySelectorAll('.notion-table-view-header-cell')].map(h => h.innerText.trim());
        // Group cells by their NEAREST row element; key each cell by data-col-index.
        const byRow = new Map();
        for (const c of d.querySelectorAll('.notion-table-view-cell')) {
          const r = c.closest('[data-block-id]');
          const k = Number(c.getAttribute('data-col-index'));
          if (!r || Number.isNaN(k)) continue;
          // row element's data-block-id = the row's page id: stable across horizontal re-renders, unique even if names repeat
          if (!byRow.has(r)) byRow.set(r, { id: r.getAttribute('data-block-id'), cells: {} });
          byRow.get(r).cells[k] = (c.innerText || '').trim();
        }
        return { columns: cols, rows: [...byRow.values()] };
      }),
      /** Scroll the table horizontally: 'start' | 'end' | pixel offset. Returns { left, max }. */
      scrollX: (to = 'start', i = 0) => db(i).evaluate((d, to) => {
        const s = d.querySelector('.notion-scroller.horizontal');
        if (!s) return null;
        s.scrollLeft = to === 'start' ? 0 : to === 'end' ? s.scrollWidth : to;
        return { left: Math.round(s.scrollLeft), max: s.scrollWidth - s.clientWidth };
      }, to),
      /** Cell by row name + column NAME (Playwright scrolls it into view on click). */
      cellByName: async (row, col, i = 0) => {
        const cols = await n.db.columns(i);
        const k = cols.indexOf(col);
        if (k < 0) throw new Error(`no column "${col}"; have: ${cols.join(', ')}`);
        return n.db.cell(row, k, i);
      },
      /** Write plain text into a Text/Number/URL cell by column name. */
      async setText(row, col, value, i = 0) {
        await n.esc();
        const c = await n.db.cellByName(row, col, i);
        await c.scrollIntoViewIfNeeded();
        await c.click(); await wait(300);
        await page.keyboard.type(String(value));
        await n.esc(2);
      },
      views: async (i = 0) => { await n.db.ready(i); return db(i).locator('.notion-collection-view-tab').allInnerTexts(); },
      /** All view names incl. those hidden behind "N more…" (opens and closes that list). */
      async allViews(i = 0) {
        await n.esc(); await n.db.ready(i);
        const more = db(i).getByText(/^\d+ more/);
        if (!(await more.count())) return n.db.views(i);
        await more.first().click(); await wait(400);
        const names = await page.locator('[role="dialog"], .notion-overlay-container').getByRole('option')
          .allInnerTexts().then(a => a.map(s => s.trim()).filter(s => s && s !== 'New view' && s !== 'New data source'));
        await n.esc();
        return [...new Set(names)];
      },
      /** Show a view by name (visible tab, or via the "N more…" overflow list). */
      async switchView(name, i = 0) {
        await n.esc(); await n.away(); await n.db.ready(i);
        const tab = db(i).locator('.notion-collection-view-tab').filter({ hasText: new RegExp(`^${name}$`) });
        if (await tab.count()) await tab.first().click();
        else {
          await db(i).getByText(/^\d+ more/).first().click(); await wait(400);
          await page.locator(MENUS).getByRole('option').filter({ hasText: new RegExp(`^${name}$`) }).first().click();
        }
        await wait(700); await n.esc();
        await n.db.ready(i);
        const sel = (await db(i).locator('.notion-collection-view-tab[aria-selected="true"]').allInnerTexts()).map(s => s.trim());
        if (sel.length && !sel.includes(name)) throw new Error(`switchView: wanted "${name}", selected is "${sel.join(',')}"`);
      },
      /** Name of the currently selected view. */
      current: async (i = 0) => { await n.db.ready(i); return (await db(i).locator('.notion-collection-view-tab[aria-selected="true"]').allInnerTexts())[0]?.trim(); },
      async filter(prop, value, i = 0) {
        await n.esc();
        await db(i).locator('[aria-label="Filter"]').click(); await wait(500);
        await page.getByPlaceholder('Filter by…').fill(prop); await wait(300); await page.keyboard.press('Enter'); await wait(600);
        // Status values are menuitems, Select values are options
        const items = page.locator('[role="menuitem"], [role="option"]').filter({ hasText: new RegExp(`^${value}$`) });
        await items.last().click(); await wait(800); await n.esc();
        await wait(1000); // the table re-renders after filtering; reading straight away can see zero rows
      },
      // ---- property values beyond text/select (verified on 7.41.1, 2026-10-31) ----
      /** Checkbox: click toggles; read state from the input. */
      async setCheckbox(row, col, on = true, i = 0) {
        await n.esc();
        const c = await n.db.cellByName(row, col, i); await c.scrollIntoViewIfNeeded();
        const state = () => c.evaluate(e => !!e.querySelector('input[type=checkbox]')?.checked);
        if ((await state()) !== on) { await c.click(); await wait(400); }
        return state();
      },
      /** Person: pick a person by visible name, e.g. 'Your Name (You)'. */
      async setPerson(row, col, name, i = 0) {
        await n.esc(); const c = await n.db.cellByName(row, col, i); await c.scrollIntoViewIfNeeded(); await c.click(); await wait(500);
        await page.locator(MENUS).getByText(name).first().click(); await wait(400); await n.esc(5);
      },
      /** Place: type a query and pick the suggestion containing `match` (first suggestion is "Current Location"). */
      async setPlace(row, col, query, match = query, i = 0) {
        await n.esc(); const c = await n.db.cellByName(row, col, i); await c.scrollIntoViewIfNeeded(); await c.click(); await wait(500);
        await page.keyboard.type(query); await wait(1500);
        await page.locator(MENUS).getByText(new RegExp(match)).last().click(); await wait(500); await n.esc(5);
      },
      /** Files & media by public URL (Link tab). */
      async setFileLink(row, col, url, i = 0) {
        await n.esc(); const c = await n.db.cellByName(row, col, i); await c.scrollIntoViewIfNeeded(); await c.click(); await wait(500);
        await page.locator(MENUS).getByRole('tab', { name: 'Link' }).click(); await wait(300);
        await page.keyboard.type(url); await page.keyboard.press('Enter'); await wait(1500); await n.esc(5);
      },
      /** Link a relation cell to another row by name. */
      async setRelation(row, col, targetRow, i = 0) {
        await n.esc(); const c = await n.db.cellByName(row, col, i); await c.scrollIntoViewIfNeeded(); await c.click(); await wait(700);
        await page.locator(MENUS).getByText(targetRow, { exact: true }).first().click(); await wait(600); await n.esc(5);
      },

      // ---- property setup ----
      /** Open a column header menu and click an item (Edit property, Freeze, Hide, Wrap/Unwrap content, …). */
      async headerMenu(col, item, i = 0) {
        await n.esc(5);
        const h = db(i).locator('.notion-table-view-header-cell').filter({ hasText: new RegExp(`^${col}$`) });
        await h.scrollIntoViewIfNeeded(); await h.click(); await wait(500);
        const items = await page.locator(MENUS).locator('[role="menuitem"]').allInnerTexts().then(a => a.map(s => s.trim().split('\n')[0]));
        if (!item) return items;
        await page.locator(MENUS).locator('[role="menuitem"]').filter({ hasText: new RegExp('^' + item) }).first().click(); await wait(600);
        return items;
      },
      /** Footer calculation for a column: None/Count/Percent directly, Sum/Average/Median/Min/Max/Range via More options. */
      async calculate(col, fn, i = 0) {
        await n.db.headerMenu(col, 'Calculate', i);
        const M = page.locator(MENUS);
        if (!(await M.last().getByText(fn, { exact: true }).count())) { await M.last().getByText('More options', { exact: true }).last().click(); await wait(500); }
        await M.last().getByText(fn, { exact: true }).last().click(); await wait(700); await n.esc(5);
      },
      /** Formula: header → Edit property → Edit formula → type → Ctrl+Enter. Returns nothing; read values with read(). */
      async setFormula(col, expr, i = 0) {
        await n.db.headerMenu(col, 'Edit property', i);
        await page.locator(MENUS).getByText('Edit formula', { exact: true }).first().click(); await wait(900);
        await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type(expr); await wait(600);
        await page.keyboard.press('ControlOrMeta+Enter'); await wait(900); await n.esc(5);
      },
      /** Add a Relation property to the database whose title matches `target` ('This database' = self). */
      async addRelation(target, i = 0) {
        await n.esc(); await n.db.ready(i);
        const named = db(i).getByRole('button', { name: 'Add property' });
        if (await named.count()) await named.first().click();
        else await db(i).locator('.notion-table-view-header-row [role="button"]').filter({ hasText: /^$/ }).first().click();
        await wait(600);
        await page.locator('.notion-overlay-container').getByText('Relation', { exact: true }).first().click(); await wait(800);
        await page.getByPlaceholder('Link to a data source…').fill(target); await wait(800);
        // the result row can render the icon letter glued into the name ("OTaskswners"); fall back to a loose match
        const exact = page.locator(MENUS).getByText(target, { exact: true });
        const loose = page.locator(MENUS).locator('[role="menuitem"], [role="option"]').filter({ hasText: target.slice(1) });
        await ((await exact.count()) ? exact : loose).first().click(); await wait(800);
        await page.locator(MENUS).getByRole('button', { name: 'Add relation' }).click(); await wait(1000); await n.esc(5);
      },
      /** Rollup: header → Edit property → Relation / Target property / Calculate rows. */
      async setRollup(col, relationCol, targetProp, i = 0) {
        await n.db.headerMenu(col, 'Edit property', i);
        const M = page.locator(MENUS);
        const pick = async (label, value) => {
          await M.locator('[role="button"], [role="menuitem"]').filter({ hasText: new RegExp('^' + label) }).last().click(); await wait(600);
          await M.getByText(value, { exact: true }).last().click(); await wait(600);
        };
        await pick('Relation', relationCol); await pick('Target property', targetProp); await n.esc(5);
      },

      // ---- view settings ----
      /** Open the view "Settings" panel and click an item (Group, Conditional color, More settings, …). */
      async settings(item, i = 0) {
        await n.esc(5); await n.db.ready(i);
        await db(i).locator('[aria-label="Settings"]').first().click(); await wait(600);
        if (item) { await page.locator('[role="dialog"]').last().locator('[role="button"], [role="menuitem"]').filter({ hasText: new RegExp('^' + item) }).first().click(); await wait(600); }
      },
      async groupBy(prop, i = 0) { await n.db.settings('Group', i); await page.locator('[role="dialog"]').last().getByText(prop, { exact: true }).first().click(); await wait(1000); await n.esc(5); },
      async subItems(i = 0) {
        await n.db.settings('More settings', i);
        await page.locator('[role="dialog"]').last().locator('[role="button"], [role="menuitem"]').filter({ hasText: /^Sub-items/ }).first().click(); await wait(600);
        const on = page.getByText('Turn on sub-items', { exact: true });
        if (await on.count()) { await on.first().click(); await wait(1200); }
        await n.esc(5);
      },
      /** Conditional color: new rule on `prop` (Notion defaults to "is not empty → page background green → entire row"). */
      async colorRule(prop, i = 0) {
        await n.db.settings('Conditional color', i);
        await page.locator('[role="dialog"]').last().getByText('New color setting', { exact: true }).first().click(); await wait(600);
        await page.locator('[role="dialog"]').last().getByText(prop, { exact: true }).first().click(); await wait(800);
        const t = await n.menuText(); await n.esc(5); return t.slice(-140);
      },
      /** Chart view: { x, y, agg, type }; type index 0 vertical bar · 1 horizontal bar · 2 line · 3 donut · 4 number. */
      async chart({ x, y, agg, type } = {}, i = 0) {
        const panel = () => page.locator('[role="dialog"]').filter({ hasText: 'Chart type' }).last();
        const ensure = async () => { if (!(await panel().count())) await n.db.settings(null, i); };
        const rowBtn = k => panel().locator('[role="button"], [role="menuitem"]').filter({ hasText: /^What to show/ }).nth(k);
        if (x) { await ensure(); await rowBtn(0).click(); await wait(500); await page.locator('[role="dialog"]').last().getByRole('menuitem').filter({ hasText: new RegExp(`^${x}$`) }).first().click(); await wait(700); }
        if (y) { await ensure(); await rowBtn(1).click(); await wait(500); await page.locator('[role="dialog"]').last().getByRole('menuitem').filter({ hasText: new RegExp(`^${y}$`) }).first().click(); await wait(600);
          if (agg) { await page.locator('[role="dialog"]').last().getByText(agg, { exact: true }).last().click(); await wait(600); } }
        if (type !== undefined) {
          await ensure();
          await panel().evaluate(d => { // the five type buttons sit between the "Chart type" and "X axis" headings
            const all = [...d.querySelectorAll('*')];
            const s = all.find(e => e.children.length === 0 && e.textContent.trim() === 'Chart type');
            const e = all.find(e2 => e2.children.length === 0 && e2.textContent.trim() === 'X axis');
            const btns = all.filter(b => (b.getAttribute('role') === 'button' || getComputedStyle(b).cursor === 'pointer') && s.compareDocumentPosition(b) & 4 && b.compareDocumentPosition(e) & 4 && b.querySelector('svg'));
            btns.filter(b => !btns.some(o => o !== b && o.contains(b))).forEach((b, k) => b.setAttribute('data-charttype', String(k)));
          });
          await page.locator(`[data-charttype="${type}"]`).click(); await wait(900);
        }
        await n.esc(5);
      },

      async sort(prop, i = 0) {
        await n.esc();
        await db(i).locator('[aria-label="Sort"]').click(); await wait(500);
        await page.locator('.notion-overlay-container').getByText(prop, { exact: true }).first().click();
        await wait(500); await n.esc();
      },
    },
  };
  return n;
}

exports.default = async ({ page }) => {
  page.setDefaultTimeout(4000);
  const proto = Object.getPrototypeOf(page);
  if (!Object.getOwnPropertyDescriptor(proto, 'n')) {
    const cache = new WeakMap();
    Object.defineProperty(proto, 'n', { get() { if (!cache.has(this)) { this.setDefaultTimeout(4000); cache.set(this, make(this)); } return cache.get(this); } });
  }
};
