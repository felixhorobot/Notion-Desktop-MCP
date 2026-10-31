// Read-only: what can I do on this page, and why might Notion refuse? Used by `n.access()`.
// Returns workspace, editable state, lock, banners, open menu items that are disabled, and live
// alerts/toasts (where Notion explains a refusal: permission, plan limit, offline, locked...).
() => {
  const txt = e => (e?.innerText || '').trim().replace(/\s+/g, ' ');
  const content = document.querySelector('.notion-page-content');
  const editables = content ? content.querySelectorAll('[contenteditable="true"]').length : 0;
  const titleEditable = !!document.querySelector('.notion-page-block [contenteditable="true"], [placeholder="New page"][contenteditable="true"]');
  const topbar = txt(document.querySelector('.notion-topbar'));
  const frameText = txt(document.querySelector('.notion-frame')).slice(0, 4000);
  const bannerHints = ['Request membership', 'view access', 'can comment', 'can view', 'Locked', 'This page is locked',
    'Upgrade', 'limit', 'offline', "don't have access", 'do not have access', 'Request access', 'read-only', 'Read only']
    .filter(h => (topbar + ' ' + frameText).toLowerCase().includes(h.toLowerCase()));
  const overlay = document.querySelector('.notion-overlay-container');
  const disabledMenuItems = overlay ? [...overlay.querySelectorAll('[role="menuitem"][aria-disabled="true"], [role="option"][aria-disabled="true"], [role="button"][aria-disabled="true"]')].map(txt) : [];
  const alerts = [...document.querySelectorAll('[role="alert"], [role="status"], [aria-live="assertive"], [aria-live="polite"]')].map(txt)
    .filter(t => t && !/Use up and down to navigate|Type to filter/.test(t)); // drop screen-reader instructions
  return {
    workspace: txt(document.querySelector('.notion-sidebar-switcher')),
    page: document.title,
    canEditBody: editables > 0,
    canEditTitle: titleEditable,
    locked: /Locked/.test(topbar),
    hints: bannerHints,
    disabledMenuItems,
    alerts,
  };
}
