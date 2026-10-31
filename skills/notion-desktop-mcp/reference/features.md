# Notion editing & formatting reference (Windows desktop)

Checked against notion.com/help, Oct 2026. **(unverified)** = not on an official help page: test before relying on it.
Official pages write `cmd/ctrl` → **Ctrl** on Windows, `option` → **Alt**.

## Keyboard shortcuts

### Navigation
| Action | Keys |
|---|---|
| Search / recent pages | Ctrl+P (Ctrl+K too, but with text selected Ctrl+K = link) |
| Find in page | Ctrl+F |
| Back / forward | Ctrl+[ / Ctrl+] |
| Parent page | Ctrl+Shift+U |
| Copy page URL | Ctrl+L |
| New page / window / tab | Ctrl+N / Ctrl+Shift+N / Ctrl+T |
| Open link in new tab | Ctrl+click |
| Database peek prev / next | Ctrl+K / Ctrl+J |

### Blocks
| Action | Keys |
|---|---|
| New block / soft line break | Enter / Shift+Enter |
| Select current block / clear selection | Esc |
| Select block containing caret | Ctrl+A once (**repeat = more and more of the page: never chain with Delete**) |
| Move / extend block selection | Arrows / Shift+Up/Down |
| Edit selected block | Enter |
| **Delete selected blocks** | Backspace / Delete |
| Duplicate | Ctrl+D |
| Move block | Ctrl+Shift+Arrow |
| Block menu (turn into, colour, move, copy link…) | Ctrl+/ |
| Indent / outdent | Tab / Shift+Tab |
| Expand/collapse all toggles | Ctrl+Alt+T |
| Open page / tick to-do / open toggle | Ctrl+Enter |
| Table fill right / down | Ctrl+R / Ctrl+D |
| Turn into: 0 text · 1–3 H1–H3 · 4 to-do · 5 bullet · 6 numbered · 7 toggle · 8 code · 9 page | **Ctrl+Shift+digit** (Ctrl+Shift+1 verified on Windows; fallback Ctrl+/ then type the target) |

### Text styling (text selected)
| Style | Keys |
|---|---|
| Bold / italic / underline | Ctrl+B / Ctrl+I / Ctrl+U |
| Strikethrough | Ctrl+Shift+S |
| Inline code | Ctrl+E |
| Link | Ctrl+K, or paste a URL over the selection |
| Inline equation | Ctrl+Shift+E |
| Last colour again | Ctrl+Shift+H |
| Comment | Ctrl+Shift+M |
| Undo / redo | Ctrl+Z / Ctrl+Shift+Z (Ctrl+Y unverified) |
| Emoji | `:name` |

Unverified: Alt+Shift+L copy-link-to-block, Ctrl+Shift+P move-to. Use Ctrl+/ → "Copy link to block" / "Move to".

## Markdown while typing (start of line + space)
| Type | Result |
|---|---|
| `#` `##` `###` | H1 / H2 / H3 (no H4 in the editor, unverified) |
| `-` `*` `+` | Bullet |
| `1.` `a.` `i.` | Numbered |
| `[]` | To-do |
| `>` | **Toggle** (not quote!) |
| `"` | Quote |
| `---` | Divider |
| ```` ``` ```` | Code (unverified) |
Inline: `**bold**`, `*italic*`, `` `code` ``, `~strike~`, `$$tex$$`.

**Pasting Markdown: VERIFIED live 2026-10-30**, headings, inline styles, links, nested bullets, numbered,
to-dos (checked kept), quote (`>` pasted = quote), fenced code + language, pipe tables → table, divider,
mermaid fence → rendered diagram. HTML paste untested (import docs: H4+ → H3, complex tables flatten).
Pasting a bare URL opens a menu incl. "Paste as mention" (bookmark/embed options unverified).

## Block types & slash commands
| Block | How |
|---|---|
| Text | `/text` |
| Sub-page | `/page` |
| H1 / H2 / H3 | `/h1` `/h2` `/h3` |
| Toggle heading 1–3 | Ctrl+/ → Turn into → Toggle heading N |
| To-do / bullet / numbered | `/todo` `/bullet` `/num` |
| Toggle list | `/toggle` |
| Quote | `/quote` |
| Callout | `/callout`; `/turncallout` converts current block |
| Divider | `/div` |
| Code | `/code`, language label top-left |
| Mermaid | `/mermaid`, or code language Mermaid; dropdown Code / Preview / Split |
| Block equation | `/math` (Ctrl+Enter to finish) |
| Inline equation | `/equation`, `$$…$$`, Ctrl+Shift+E |
| Simple table | `/table` |
| Inline database | `/table view`, `/board`, `/gallery`, `/list`, `/calendar` (type and pick the database option) |
| Columns | **drag only**: drag a block by ⋮⋮ to the side of another until a vertical blue guide shows; resize via grey edge |
| Synced block | select blocks → Ctrl+/ → Turn into → Synced block → copy → paste elsewhere |
| Table of contents | `/toc` |
| Breadcrumb | `/bread` |
| Button | `/button` |
| Link to page (block) | `/link` |
| Page mention | `@page`, `[[page`, `+page` |
| New sub-page inline | `[[name` / `+name` → "+ Add new sub-page" |
| Person / date / reminder | `@name`, `@today`, `@next Wednesday`, `@remind <date>` |
| Emoji | `:name`, `/emoji` |
| Media | `/image` `/video` `/audio` `/file` `/pdf` `/book`(bookmark) |
| Embed | `/embed` (Drive, Figma, Loom, Maps…) |
| Actions | `/duplicate` `/moveto` `/delete` `/turn…` |

## Styling
- Colours (text or background): Default, Gray, Brown, Orange, Yellow, Green, Blue, Purple, Pink, Red (list unverified; `/red`, `/default` official).
- Whole block colour: Ctrl+/ → type colour (e.g. `blue background`) → Enter.
- Inline colour: select → "A" menu; Ctrl+Shift+H repeats.
- Page font / Small text / Full width: ••• top-right → Font Default/Serif/Mono, toggles.
- Page icon: hover top of page → Add icon (emoji / icon / upload / URL). Cover: hover → Add cover (gallery / upload / link / Unsplash, ≥1500 px wide).
- Callout: click its icon to change; colour via Ctrl+/.

## Linking
- `@`-mention a page → inline link + backlink on the target ("N backlinks" under its title).
- `[[` lists link options first; `+` lists create-page options first.
- `/link` "Link to page" block: the linked page also shows under this page in the sidebar.
- Every block has an anchor: Ctrl+/ → Copy link to block.
- Move a page: `/moveto` or Ctrl+/ → Move to. Turn a block into a page: Ctrl+Shift+9.

## Images & media
- `/image` → Upload / Embed link (URL) / Unsplash; drag-and-drop also works. Pasting an image URL → image block is unverified.
- Caption: hover → caption icon. Resize: drag left/right edge. Align: hover → alignment icon.
- Limits: Free 5 MB/file; paid larger (images still 5 MB per help note). Formats: PNG, JPG, GIF, SVG, WEBP, HEIC, TIFF, ICO, PDF, MP4, MP3, WAV, OGG, MD.
- Upload over CDP **works** (verified): menu button `Upload file` raises a normal file chooser → `chooser.setFiles` (in `notion_run_code`). Link tab also verified.

## Sources
notion.com/help: keyboard-shortcuts · writing-and-editing-basics · columns-headings-and-dividers · code-blocks ·
math-equations · create-links-and-backlinks · images-files-and-media · import-data-into-notion ·
customize-and-style-your-content · synced-blocks · comments-mentions-and-reminders ·
guides/transforming-content-blocks-in-notion · releases/2021-12-23 · releases/2022-08-11
