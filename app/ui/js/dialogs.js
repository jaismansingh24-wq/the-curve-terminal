/* The panels: native <dialog> elements, so focus is held inside while one is
   open, Esc closes it, and focus goes back to whatever opened it. One panel
   at a time. A click on the dimmed backdrop closes it too. */

const IDS = {
  confirm: 'dlg-confirm',
  keys: 'dlg-keys',
  whatsnew: 'dlg-whatsnew',
  privacy: 'dlg-privacy',
  terms: 'dlg-terms',
  sources: 'dlg-sources',
  disclaimer: 'dlg-disclaimer',
};

export function initDialogs({ onOpen } = {}) {
  const get = (name) => document.getElementById(IDS[name]);

  function open(name) {
    const dlg = get(name);
    if (!dlg) return;
    document.querySelectorAll('dialog[open]').forEach((d) => { if (d !== dlg) d.close(); });

    if (!dlg.open) dlg.showModal();
    const body = dlg.querySelector('.dlg__body');
    if (body) body.scrollTop = 0;

    if (onOpen) onOpen(name);
  }

  document.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-open]');
    if (opener) {
      open(opener.dataset.open);
      return;
    }
    const closer = e.target.closest('[data-close]');
    if (closer) {
      const d = closer.closest('dialog');
      if (d) d.close();
      return;
    }
    /* the backdrop: a click that lands on the dialog itself, outside its box */
    if (e.target.tagName === 'DIALOG' && e.target.open) e.target.close();
  });

  /* "Delete this entry?": runs `yes` only on the Delete button */
  function confirm(what, yes, title = 'Delete this entry?') {
    const dlg = get('confirm');
    dlg.querySelector('#confirm-h').textContent = title;
    dlg.querySelector('[data-confirm-what]').textContent = what;
    const btn = dlg.querySelector('[data-confirm-delete]');
    const fresh = btn.cloneNode(true);
    btn.replaceWith(fresh);
    fresh.addEventListener('click', async () => { fresh.disabled = true; dlg.close(); await yes(); });
    open('confirm');
    dlg.querySelector('[data-close]').focus();
  }

  return { open, confirm };
}
