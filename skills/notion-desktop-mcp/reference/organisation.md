# Notion organisation, permissions, databases & recovery

From notion.com/help, Oct 2026. **(unverified)** = not on an official page.

## Structure
Workspace → Teamspaces → pages → sub-pages. A database is a page; its rows are pages.

| Teamspace | Visibility | Join |
|---|---|---|
| Default | everyone | automatic |
| Open | visible | anyone |
| Closed | visible | invite only |
| Private (Business+) | members only | invite only |
Teamspaces are archived, never deleted. **Guests can't join teamspaces or groups.**

Sidebar: Favorites (after first star) · Teamspaces · Shared · Private · Trash (bottom). Inbox at top.
**Guest sidebar:** no Private section, no Teamspaces, only pages shared with them.

- Favourite: star icon in the page top bar; again to remove (or sidebar ••• → Remove from Favorites). Personal, harmless.
- Sub-page: `/page`. Sub-pages inherit parent permissions.
- Move page: ••• (top right) → Move to → search destination. Blocks: Ctrl+/ → Move to, or `/moveto`.
- **Sidebar dragging nests/reorders pages AND changes who can access them**, avoid; use Move to only when asked.
- Duplicate block Ctrl+D; page ••• → Duplicate (unverified for normal pages).
- Breadcrumb in top bar shows path; "Locked" label appears there when locked.

## Permission levels
| Level | Allows |
|---|---|
| Full access | edit everything + share |
| Can edit | edit content, no sharing |
| Can edit content (DB) | add/edit/delete rows & values; **no** property/view/source-filter changes, no lock; can make linked DBs and edit *their* views |
| Can create (DB, Business+) | add rows only |
| Can comment | comments only |
| Can view | read only |
Broadest grant wins.

### Guest can / can't
| Action | Guest |
|---|---|
| Sub-pages under shared pages | yes (with edit) |
| Top-level / private pages | **no** |
| Teamspaces, groups, settings, billing, members, connections | **no** |
| Share page | only with Full access (unverified for guests; workspace may block) |
| Export | only with Full access; owner may disable |
| Notion AI | **no** (AI excludes guests) |
| Database automations, Custom Agents | **no** |
| Import | unverified |
| Lock/unlock page | yes with Can edit |
| Page history | yes with ≥ Can edit |

## Locks (safety tools)
- **Lock page**: ••• → Lock page → read-only for everyone. Unlock: click "Locked" in breadcrumb → Unlock for me (temporary) / for everyone. Anyone with edit can unlock, don't toggle without being asked.
- **Lock database** (full-page DB ••• ): blocks property/option changes. **Lock views**: blocks property/view changes, data still editable.
- If a page is locked, edits silently fail: check breadcrumb for "Locked" first and ask before unlocking.

## Recovery ladder (fastest first)
1. **Ctrl+Z** immediately: undoes your last actions on the page.
   Can't restore synced-block copies lost when an original with >10 copies was deleted.
2. **Trash** (sidebar bottom): deleted pages kept 30 days; anyone with access can restore; deleting a parent trashes all sub-pages.
3. **Page history** (••• → Version history; needs ≥ Can edit): snapshots every 10 min while editing + 2 min after last edit. Retention Free 7d / Plus 30 / Business 90 / Enterprise ∞. Restore whole version or copy blocks out of an old version. Restoring a **database** version restores rows/properties but **not text inside row pages**.

## Danger ranking (never do unasked)
1. Trash a database **data source** (Sources → ••• → Move to Trash) or delete a full-page/inline database: data gone, not just a view.
2. Delete a synced-block original with >10 copies, or "Unsync all": all copies gone, Undo can't fix.
3. Drag a page into Private / a default teamspace / another parent: access changes.
4. Delete a parent page: all sub-pages go to Trash.
5. Backspace/Delete while blocks are selected.
6. Delete a database property: values gone from every row.
7. "Save for everyone" on filters/sorts; Lock page for everyone.
8. Restore an old database version (drops row body text).
9. Permanently delete from Trash.

Safe vs unsafe: deleting a **view** or a **linked** database block only removes that view/link, the source stays. Editing data inside a linked view **does** change the source.

## Databases
- Inline (inside a page) vs full-page (in sidebar, lockable). `⤡` opens inline as full page.
- Views: Table, Board, List, Gallery, Calendar, Timeline, Chart, Feed, Map (needs Place, ≤100 items), Form (source DB only), Dashboard (Business+, ≤12 widgets).
  Add view: `+` next to view tabs. Each view has its own filter/sort/group.
- Properties: Text, Number, Select, Multi-select, Status, Date, Formula, Relation, Rollup, Person, File, Checkbox, URL, Email, Phone, Place, Created/Last-edited time/by, Button, ID.
- Filters: simple or advanced AND/OR (3 levels). Sorts stack. Group + sub-group.
  **Filter/sort changes are personal until "Save for everyone"**, don't click that unasked.
- Visualising status/progress: Board grouped by Status; Timeline by Date; Chart view for counts.

## Collaboration
- Page comment: hover top → Add comment. Inline: select → Ctrl+Shift+M. Resolve ✔; reopen via 💬 sidebar → Resolved.
- `@name` notifies a person (only if they have access). `@page` link + backlink. `@date` / `@remind`.
- Per-page notifications: ••• → Notify me.
- Suggested edits: Ctrl+/ → Suggest edits (details unverified), a non-destructive way to propose changes on shared pages.

## Sources
notion.com/help: sharing-and-permissions · duplicate-delete-and-restore-content · navigate-with-the-sidebar ·
whos-who-in-a-workspace · guides/understanding-notions-sharing-settings · guides/who-should-be-a-workspace-member-who-should-be-a-guest ·
guides/notions-data-retention-settings · intro-to-teamspaces · intro-to-databases · database-properties ·
views-filters-and-sorts · data-sources-and-linked-databases · database-automations · synced-blocks ·
collaborate-within-a-workspace · comments-mentions-and-reminders · updates-and-notifications · export-your-content
