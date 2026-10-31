// Regression self-test for helpers.js; run after every Notion update.
// notion_run_code with the body of this file as `code`.
// Creates "Claude selftest (safe to delete)" in Private of the CURRENT workspace (use your own, non-shared workspace),
// exercises every helper, trashes the page and closes its tab. Returns PASS/FAIL per step + timings.
async (page) => {
  const TITLE = 'Claude selftest (safe to delete)';
  const res = { version: await page.evaluate(() => navigator.userAgent.match(/Notion\/[\d.]+/)?.[0]), steps: {} };
  const t0 = Date.now();
  let p = null;
  const step = async (name, fn, check = () => true) => {
    const s = Date.now();
    try {
      const v = await fn();
      const ok = await check(v);
      res.steps[name] = `${ok ? 'PASS' : 'FAIL'} ${Date.now() - s}ms${ok ? '' : ' · got ' + JSON.stringify(v).slice(0, 120)}`;
      return v;
    } catch (e) { res.steps[name] = `FAIL ${Date.now() - s}ms · ${e.message.split('\n')[0].slice(0, 160)}`; return undefined; }
  };
  const home = page.context().pages().find(x => x.url().startsWith('https://app.notion.com/p/')) || page;
  await step('helpersLoaded', () => typeof home.n?.outline === 'function', v => v);
  await step('access', () => home.n.access(), v => typeof v.canEditBody === 'boolean');
  await step('tabsList', () => home.n.tabs.list(), v => v.length >= 1 && v.some(t => t.active));
  p = await step('newPage', () => home.n.newPage(TITLE), v => !!v);
  if (!p) { res.total = `${Date.now() - t0}ms`; return res; }
  const n = p.n;
  await step('paste', async () => { await n.paste('## Selftest\n- one\n- two\n\nAnchor line'); return (await n.outline()).blocks.map(b => b[1]); },
    v => v.includes('sub_header') && v.filter(t => t === 'bulleted_list').length === 2);
  await step('insertAfter', () => n.insertAfter('Anchor line', '" quoted\n\n| A | B | C | D | E | F | G | H | I | J | K | L |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n| a1 | b1 | c1 | d1 | e1 | f1 | g1 | h1 | i1 | j1 | k1 | l1 |'),
    v => v.removed.length === 0 && v.added.some(b => b[1] === 'table'));
  await step('tableRead', () => n.table.read(), v => v.length === 2 && v[1][11] === 'l1');
  await step('tableSetCellFarRight', async () => { await n.table.scrollX('start'); await n.table.setCell(1, 11, 'L-EDIT'); return (await n.table.read())[1][11]; }, v => v === 'L-EDIT');
  await step('insertDb', async () => { await n.caretAtEnd('Anchor line'); await p.keyboard.press('Enter'); await n.slash('table', 'Table view'); await n.clickMenu('New empty data source'); await p.waitForTimeout(1200); return p.locator('.notion-collection_view-block').count(); }, v => v >= 1); // nested wrappers share the class
  await step('addRows', async () => { await n.db.addRow('Task A'); await n.db.addRow('Task B'); return (await n.db.read()).rows.map(r => r.Name); }, v => v.includes('Task A') && v.includes('Task B'));
  await step('addProperties', async () => { for (const t of ['Status', 'Date', 'Select', 'Text', 'Text', 'Text', 'Text', 'Text', 'Text']) await n.db.addProperty(t); return n.db.columns(); }, v => v.length >= 10);
  await step('setStatus', async () => { await n.db.setOption('Task A', 1, 'In progress'); return (await n.db.read()).rows.find(r => r.Name === 'Task A')?.Status; }, v => v === 'In progress');
  await step('setDateToday', async () => { await n.db.setToday('Task A', 2); return (await n.db.read()).rows.find(r => r.Name === 'Task A')?.Date; }, v => !!v);
  await step('setSelectNew', async () => { await n.db.setOption('Task B', 3, 'Backend'); return (await n.db.read()).rows.find(r => r.Name === 'Task B')?.Select; }, v => v === 'Backend');
  await step('setTextFarRight', async () => { const cols = await n.db.columns(); const last = cols[cols.length - 1]; await n.db.scrollX('start'); await n.db.setText('Task B', last, 'far right'); return (await n.db.read()).rows.find(r => r.Name === 'Task B')?.[last]; }, v => v === 'far right');
  await step('addViews', async () => { for (const v of ['Board', 'Timeline', 'Chart']) await n.db.addView(v); return n.db.allViews(); }, v => ['Table', 'Board', 'Timeline', 'Chart'].every(x => v.includes(x)));
  await step('switchToTable', async () => { await n.db.switchView('Table'); return n.db.current(); }, v => v === 'Table');
  await step('filter', async () => {
    await n.db.filter('Status', 'In progress');
    const rows = (await n.db.read()).rows.map(r => r.Name);
    if (rows.length === 1 && rows[0] === 'Task A') return rows;
    return { rows, view: await n.db.current(), chips: (await n.db.at().innerText()).replace(/\s+/g, ' ').slice(0, 160) }; // diagnostics on failure
  }, v => Array.isArray(v) && v.length === 1 && v[0] === 'Task A');
  await step('sort', () => n.db.sort('Name'));
  await step('guardCatchesNothing', () => n.guard(async () => {}), v => v.removed.length === 0 && v.added.length === 0);
  if (Object.values(res.steps).some(s => s.startsWith('FAIL'))) { // keep the page for inspection; trash it manually after
    res.keptForInspection = p.url();
    res.total = `${Date.now() - t0}ms`;
    res.passed = Object.values(res.steps).filter(s => s.startsWith('PASS')).length + '/' + Object.keys(res.steps).length;
    return res;
  }
  const pageId = p.url().match(/[0-9a-f]{32}/)?.[0];
  // after Move to Trash the tab navigates away; the sidebar can lag, so check the tab instead
  await step('trashPage', async () => { await n.trashPage(TITLE); await p.waitForTimeout(800); return p.url().includes(pageId); }, v => v === false);
  await step('closeTab', () => n.tabs.closeActive(), v => typeof v === 'string');
  res.total = `${Date.now() - t0}ms`;
  res.passed = Object.values(res.steps).filter(s => s.startsWith('PASS')).length + '/' + Object.keys(res.steps).length;
  return res;
}
