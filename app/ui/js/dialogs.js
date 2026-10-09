/* The panels: native <dialog> elements, so focus is held inside while one is
   open, Esc closes it, and focus goes back to whatever opened it. One panel
   at a time. A click on the dimmed backdrop closes it too. */

const IDS = {
  soon: 'dlg-soon',
  settings: 'dlg-settings',
  keys: 'dlg-keys',
  whatsnew: 'dlg-whatsnew',
  privacy: 'dlg-privacy',
  terms: 'dlg-terms',
  disclaimer: 'dlg-disclaimer',
};

const SOON_KICKER = { entry: 'New entry', journal: 'Journal' };

export function initDialogs({ onOpen } = {}) {
  const get = (name) => document.getElementById(IDS[name]);

  function open(name, opts = {}) {
    const dlg = get(name);
    if (!dlg) return;
    document.querySelectorAll('dialog[open]').forEach((d) => { if (d !== dlg) d.close(); });

    if (name === 'soon') {
      const k = dlg.querySelector('[data-soon-kicker]');
      if (k) k.textContent = SOON_KICKER[opts.soon] || 'Journal';
    }
    if (!dlg.open) dlg.showModal();
    const body = dlg.querySelector('.dlg__body');
    if (body) body.scrollTop = 0;

    if (opts.focus === 'discord') {
      const g = document.getElementById('st-discord-group');
      if (g) {
        g.scrollIntoView({ block: 'center' });
        const sw = g.querySelector('.switch');
        if (sw) sw.focus();
      }
    }
    if (onOpen) onOpen(name);
  }

  document.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-open]');
    if (opener) {
      open(opener.dataset.open, { soon: opener.dataset.soon, focus: opener.dataset.focus });
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

  return { open };
}
