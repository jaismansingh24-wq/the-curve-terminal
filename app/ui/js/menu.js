/* The menu: a panel opened from the button at the top left of the title
   bar, or with M. It closes when a page is chosen, on Esc, or on a click
   or a Tab outside it, and Esc gives focus back to the button. The arrow
   keys, Home and End move through its items; the page you are on is
   marked, and takes focus when the menu opens. */

export function initMenu() {
  const btn = document.querySelector('[data-menu-toggle]');
  const menu = document.getElementById('menu');
  if (!btn || !menu) return { toggle() {}, close() {}, isOpen: () => false };
  const items = () => [...menu.querySelectorAll('.menu__item')];
  let open = false;

  function show() {
    if (open) return;
    open = true;
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => menu.classList.add('is-open'));
    const here = menu.querySelector('[aria-current="page"]') || items()[0];
    if (here) here.focus({ preventScroll: true });
  }
  function hide(giveFocusBack = true) {
    if (!open) return;
    open = false;
    menu.classList.remove('is-open');
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (giveFocusBack) btn.focus({ preventScroll: true });
  }

  btn.addEventListener('click', () => (open ? hide() : show()));
  menu.addEventListener('click', (e) => { if (e.target.closest('.menu__item')) hide(false); });
  document.addEventListener('mousedown', (e) => {
    if (open && !menu.contains(e.target) && !btn.contains(e.target)) hide(false);
  });
  menu.addEventListener('focusout', (e) => {
    const to = e.relatedTarget;
    if (open && to && !menu.contains(to) && to !== btn) hide(false);
  });
  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hide(); return; }
    const list = items(), i = list.indexOf(document.activeElement);
    let n = -1;
    if (e.key === 'ArrowDown') n = (i + 1) % list.length;
    else if (e.key === 'ArrowUp') n = (i - 1 + list.length) % list.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = list.length - 1;
    if (n < 0) return;
    e.preventDefault();
    list[n].focus();
  });
  window.addEventListener('hashchange', () => hide(false));

  return { toggle: () => (open ? hide() : show()), close: hide, isOpen: () => open };
}
