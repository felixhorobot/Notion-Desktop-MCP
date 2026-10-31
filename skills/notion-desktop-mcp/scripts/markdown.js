// Read-only: blocks → Markdown that Notion's paste turns back into the same blocks.
// Arg: array of block ids (each with its children), or null for every top-level block of the page.
// Returns { md, blocks: [{ id, type, title, lossy }] }. lossy = content Markdown can't carry
// (pages, databases, media, synced blocks…); pages/databases go to Notion's Trash when deleted instead.
(ids) => {
  const root = document.querySelector('.notion-page-content');
  if (!root) return { error: 'no .notion-page-content (page still loading, or not a page view)' };
  const typeOf = el => ([...el.classList].find(c => c.startsWith('notion-') && c.endsWith('-block')) || 'notion-?-block').slice(7, -6);
  const bid = el => el.getAttribute('data-block-id');
  // nearest ancestor block with a DIFFERENT id (Notion nests inner wrappers that reuse the block id)
  const parentBlock = el => { for (let p = el.parentElement; p && p !== root; p = p.parentElement) if (p.hasAttribute('data-block-id') && bid(p) !== bid(el)) return p; return null; };
  const childrenOf = el => { const seen = new Set(); return [...el.querySelectorAll('[data-block-id]')].filter(c => bid(c) !== bid(el) && parentBlock(c) && bid(parentBlock(c)) === bid(el) && !seen.has(bid(c)) && seen.add(bid(c))); };
  const ownLeaf = el => [...el.querySelectorAll('[contenteditable="true"]')].find(c => bid(c.closest('[data-block-id]')) === bid(el));

  const inline = node => {
    if (node.nodeType === 3) return node.textContent;
    if (node.nodeType !== 1) return '';
    let s = [...node.childNodes].map(inline).join('');
    if (!s.trim()) return s;
    if (node.tagName === 'A' && node.getAttribute('href')) return `[${s}](${new URL(node.getAttribute('href'), location.href).href})`;
    const cs = getComputedStyle(node);
    if (/monospace|Mono|Consolas|Courier/i.test(cs.fontFamily) && node.tagName === 'SPAN') s = '`' + s + '`';
    if (+cs.fontWeight >= 600 && node.tagName === 'SPAN') s = `**${s}**`;
    if (cs.fontStyle === 'italic' && node.tagName === 'SPAN') s = `*${s}*`;
    if (/line-through/.test(cs.textDecorationLine) && node.tagName === 'SPAN') s = `~~${s}~~`;
    return s;
  };
  const text = el => { const leaf = ownLeaf(el); return leaf ? inline(leaf).replace(/\n/g, ' ').trim() : ''; };

  const out = [], meta = [];
  const walk = (el, indent) => {
    const type = typeOf(el), id = el.getAttribute('data-block-id'), pad = '  '.repeat(indent);
    let lossy = false, line;
    switch (type) {
      case 'text': line = text(el); break;
      case 'header': line = '# ' + text(el); break;
      case 'sub_header': line = '## ' + text(el); break;
      case 'sub_sub_header': line = '### ' + text(el); break;
      case 'bulleted_list': line = '- ' + text(el); break;
      case 'numbered_list': line = '1. ' + text(el); break;
      case 'toggle': line = '- ' + text(el); break; // toggle state not carried
      case 'to_do': {
        const cb = el.querySelector('input[type="checkbox"]'), aria = el.querySelector('[role="checkbox"]');
        const done = cb ? cb.checked : aria?.getAttribute('aria-checked') === 'true';
        line = `- [${done ? 'x' : ' '}] ` + text(el); break;
      }
      case 'quote': case 'callout': line = '> ' + text(el); break;
      case 'divider': line = '---'; break;
      case 'code': {
        const leaf = el.querySelector('[contenteditable="true"]');
        // the language label only renders on hover; a rendered diagram means mermaid. Limit: other languages restore as plain text
        const lang = el.querySelector('svg[id^="mermaid-"]') ? 'mermaid' : '';
        // textContent, not innerText: in "preview only" mode the code is hidden and innerText is ''
        const code = leaf ? leaf.textContent.replace(/\n$/, '') : '';
        if (!leaf && lang) { lossy = true; meta.push({ id, type, title: 'mermaid source hidden (block is in "preview only" mode)', lossy }); out.push(`${pad}\`\`\`mermaid\n\n${pad}\`\`\``); return; }
        out.push(`${pad}\`\`\`${lang}\n${code}\n${pad}\`\`\``);
        meta.push({ id, type, title: code.split('\n')[0].slice(0, 60), lossy });
        return; // code blocks have no children
      }
      case 'table': {
        const rows = [...el.querySelectorAll('tr')].map(tr => [...tr.querySelectorAll('td, th')].map(td => td.innerText.trim().replace(/\|/g, '\\|').replace(/\n/g, ' ')));
        if (rows.length) out.push([rows[0], rows[0].map(() => '---'), ...rows.slice(1)].map(r => pad + '| ' + r.join(' | ') + ' |').join('\n'));
        meta.push({ id, type, title: rows[0]?.join(' ').slice(0, 60) || '', lossy });
        return;
      }
      default: lossy = true; line = null;
    }
    const title = (el.innerText || '').split('\n')[0].slice(0, 60);
    meta.push({ id, type, title, lossy });
    if (line !== null) out.push(pad + line);
    if (['page', 'collection_view', 'collection_view_page', 'alias', 'transclusion_container', 'transclusion_reference'].includes(type)) return; // their content lives elsewhere
    for (const ch of childrenOf(el)) walk(ch, indent + 1);
  };

  const targets = ids ? ids.map(id => root.querySelector(`[data-block-id="${id}"]`)) : (() => { const seen = new Set(); return [...root.querySelectorAll('[data-block-id]')].filter(e => !parentBlock(e) && !seen.has(bid(e)) && seen.add(bid(e))); })();
  const missing = ids ? ids.filter((id, i) => !targets[i]) : [];
  for (const el of targets.filter(Boolean)) walk(el, 0);
  // consecutive list items stay one list (single newline); everything else is separated by a blank line
  const isItem = s => /^\s*(- |1\. )/.test(s);
  const md = out.reduce((acc, s, i) => acc + (i === 0 ? '' : isItem(s) && isItem(out[i - 1]) ? '\n' : '\n\n') + s, '');
  return { md, blocks: meta, missing };
}
