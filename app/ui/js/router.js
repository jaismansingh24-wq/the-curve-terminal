/* Pages, by the address after the #:
     #/home  #/new  #/edit/<id>  #/overview  #/entry/<id>  #/stats  #/calendar  #/accounts
     and Atlas's: #/connects  #/rates  #/auctions  #/positioning  #/energy  #/currencies  #/releases  #/wire
   One page shows at a time. The menu marks the current one, the page's
   heading takes focus (so screen readers announce where you are), and the
   page scrolls back to the top. */

const VIEWS = ['home', 'new', 'overview', 'entry', 'stats', 'calendar', 'accounts', 'connects', 'rates', 'auctions', 'positioning', 'energy', 'currencies', 'releases', 'wire'];
const handlers = {};
let current = null;

export function on(view, fn) { handlers[view] = fn; }

export function parse(hash = location.hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const name = parts[0] || 'home';
  if (name === 'edit') return { view: 'new', id: parts[1] || null, route: 'new' };
  if (name === 'entry') return { view: 'entry', id: parts[1] || null, route: 'overview' };
  return VIEWS.includes(name) ? { view: name, id: null, route: name } : { view: 'home', id: null, route: 'home' };
}

export function go(path) {
  if (location.hash === '#' + path) render(true);
  else location.hash = path;
}

function render(focus) {
  const r = parse();
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.dataset.view !== r.view; });
  document.querySelectorAll('[data-route]').forEach((a) => {
    if (a.dataset.route === r.route) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const changed = !current || current.view !== r.view || current.id !== r.id;
  current = r;
  if (handlers[r.view]) handlers[r.view](r);
  if (changed) {
    const page = document.getElementById('page');
    if (page) page.scrollTop = 0;
    if (focus) {
      const h = document.querySelector('.view[data-view="' + r.view + '"] h1');
      if (h) { if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    }
  }
}

export function start() {
  window.addEventListener('hashchange', () => render(true));
  render(false);
}

export const now = () => current;
