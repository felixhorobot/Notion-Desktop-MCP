# Capability coverage (live-tested on Notion 7.40 → 7.41.1 desktop, 2026-10-30/31)

Regression: `scripts/selftest.js`, 22/22 PASS on 7.41.1 (2026-10-31).

✅ verified live · 🟡 should work (same mechanism as verified items), not yet run · ⛔ blocked by Notion (permission/plan) · ❌ not possible via this route

| Area | Capability | Status |
|---|---|---|
| Connect | Playwright MCP via relay (blank-target fix, keeps dark theme) | ✅ |
| Read | Page outline (blocks, types, ids) in ~50 ms | ✅ |
| Write | Markdown paste → headings, lists, to-dos, quote, code, table, divider, mermaid | ✅ |
| Write | HTML paste | 🟡 |
| Blocks | Slash menu (/callout), turn-into Ctrl+Shift+digit, block colour Ctrl+/ | ✅ |
| Blocks | Columns (drag), synced block, toggle headings, TOC, button | 🟡 |
| Inline | @date mention | ✅ |
| Inline | @page mention / backlinks, @person mention, Ctrl+K links | 🟡 |
| Media | Image by URL, image upload from file | ✅ |
| Media | Video/file/PDF upload, embeds, bookmarks | 🟡 (same chooser flow) |
| Pages | Create page (Ctrl+N → new tab), title, trash own page (Actions → Move to Trash) | ✅ |
| Pages | Page Actions menu (dispatchEvent on top bar) | ✅ |
| Pages | Icon / cover / font / full width / small text | 🟡 |
| Pages | Move to (Ctrl+Shift+P), duplicate, lock | 🟡 own workspace · ⛔ guest workspace (Move/Trash disabled) |
| Tabs | List, new tab (tabsApi.newTab = Ctrl+T), close active (= Ctrl+W), close by title | ✅ |
| Workspaces | Switch workspace, switch account (3 accounts) | ✅ |
| Settings | Open Settings, read all Preferences/Notifications/Sidebar/Offline/Notion MCP | ✅ |
| Settings | Change a preference (toggle/dropdown) | 🟡 needs user approval per change |
| Settings | Security, login, billing, members, MCP clients | ❌ by policy: user does these |
| Permissions | Detect editable / locked / guest / disabled actions / alerts (access.js) | ✅ |
| Databases | Insert inline DB, rename, add rows, Status/Date/Select values, add properties, Board/Timeline/Chart views, filter, sort | ✅ (SKILL.md §7) |
| Databases | Calendar, Gallery views; wide DB read (scrolling, row-cell virtualisation handled) + write off-screen cells | ✅ |
| Views | Table, Board, Timeline, Calendar, Gallery, List, Feed, Map, Form (auto questions), Dashboard, Chart | ✅ all 11 |
| Chart | 5 types (vbar, hbar, line, donut, number), X axis, Y axis + aggregation, rendered & screenshotted | ✅ |
| Chart | Group by, range, reference line, colour, "Save chart as…" export | 🟡 seen in panel, not changed |
| Properties | Add all 19 types: Text, Number, Select, Multi-select, Status, Date, Person, Files & media, Checkbox, URL, Email, Phone, Formula, Relation, Rollup, Button, ID, Place, Created/Last edited time/by | ✅ |
| Properties | Set values: Number, Multi-select, Status, Select, Date, Checkbox, URL, Email, Phone, Person, Place, Files (link), Relation; auto: ID, created/edited | ✅ |
| Properties | Formula `prop("Number") * 2` = 84; Relation (self, two-way); Rollup through relation = 10 | ✅ |
| Properties | Button actions, Files upload in DB cell, Rollup "Sum" calculation, Show as Bar/Ring | 🟡 seen, not run |
| Table | Calculate (SUM 52), Freeze, Wrap/Unwrap, Group by (with per-group sums), Sub-items on, Conditional color rule (green rows), New template editor | ✅ |
| Table | Dependencies, Connections, Customize page layout, Automations (guests: never), Lock database, template content + "Duplicate every…" | 🟡 seen, not run |
| Tables | Wide simple table (15 cols): read, scroll, replace any cell incl. wrapped text | ✅ |
| Tooling | Launcher (debug/normal shortcuts), MCP server tools + `page.n` helpers | ✅ |
| Databases | Relation, rollup, formula, templates, group-by, gallery/form views, CSV import | 🟡 same menus, not run |
| Databases | Very long tables (row virtualisation when scrolling down) | 🟡 not tested |
| Collab | Comments, resolve, notifications/inbox | 🟡 |
| Sidebar | Favourite (top-bar star via dispatchEvent) | 🟡 |
| History | Version history, Trash restore | 🟡 |
| Export / Import | Export page, import files | 🟡 export may hit native save dialog · ⛔ guest without Full access |
| AI | Notion AI | ⛔ guests; workspaces without the AI add-on show "Get Notion AI" |
| Keys | Real OS shortcuts Ctrl+T/Ctrl+W | ❌ via CDP: use `n.tabs` equivalents |
