// Read-only page outline: one call instead of a full accessibility snapshot.
// Returns title, breadcrumb, and every block as [depth, type, id, text<=80].
() => {
  const root = document.querySelector('.notion-page-content');
  if (!root) return { error: 'no .notion-page-content (page still loading, or not a page view)' };
  const typeOf = el => ([...el.classList].find(c => c.startsWith('notion-') && c.endsWith('-block')) || 'notion-?-block').slice(7, -6);
  const seen = new Set();
  const blocks = [];
  for (const el of root.querySelectorAll('[data-block-id]')) {
    const id = el.getAttribute('data-block-id');
    if (seen.has(id)) continue; // Notion nests inner wrappers that reuse the block id
    seen.add(id);
    const ancestors = new Set();
    for (let p = el.parentElement; p && p !== root; p = p.parentElement) if (p.hasAttribute('data-block-id')) ancestors.add(p.getAttribute('data-block-id'));
    blocks.push([ancestors.size, typeOf(el), id, (el.innerText || '').split('\n')[0].slice(0, 80)]);
  }
  return {
    url: location.href,
    title: document.querySelector('.notion-page-block h1, .notion-frame h1')?.textContent ?? document.title,
    breadcrumb: [...document.querySelectorAll('.notion-topbar [role="button"]')].map(e => e.textContent.trim()).filter(Boolean).slice(0, 6),
    count: blocks.length,
    blocks,
  };
}
