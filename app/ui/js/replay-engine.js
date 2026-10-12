/* Replay's orders, fills and position: practice only, never a real trade.

   A one-minute bar says where price opened, the highest and lowest it went
   and where it closed, but not in what order. Fills are worked out from an
   assumed path through each bar, and the page says so:
     - a bar that closed at or above its open went open, low, high, close;
       one that closed below went open, high, low, close;
     - an order the bar opens beyond fills at the open;
     - a limit fills at its price once price trades through it by a tick
       (or, if the reader chooses, as soon as price touches it): touching a
       limit says nothing about where the order stood in the queue;
     - a stop fills at its price, or the open if the bar gapped past it,
       plus the slippage the reader chooses, in ticks;
     - a market order fills at the last price, plus that slippage.
   Brackets: an entry can carry a limit exit and a stop exit a set number of
   ticks away; they are placed when the entry fills, one cancels the other,
   and they only ever reduce the position. Costs are the round-turn cost per
   contract from Settings, taken when a position closes.

   With a file of trades the replay moves trade by trade and there is no
   path to assume: an order fills at the first trade that reaches it (a
   limit at its price once a trade prints through it, or on a touch; a stop
   at the trade that set it off, plus slippage).

   Prices are in ticks throughout; times are UTC seconds. */

export function createEngine({ data, tickValue, commission = 0, rules = {}, onEvent = () => {} }) {
  const tickMode = data.kind === 'trades';
  const { o, h, l, c, t } = data;
  /* bars count minutes, trades seconds; everything here is in seconds */
  const unit = tickMode ? 1 : 60;
  let cursor = 0, seq = 0, grp = 0;
  let orders = [];
  let pos = { qty: 0, avg: 0, at: null };
  let trades = [];
  let fills = [];
  let rule = { fill: rules.fill || 'through', slip: rules.slip || 0 };

  const now = () => (tickMode ? data.p[cursor] : c[cursor]);
  const nowT = () => t[cursor] * unit;
  const sgn = (side) => (side === 'buy' ? 1 : -1);

  /* ------------------------------------------------------------ the position */

  function apply(side, qty, price, at) {
    const s = sgn(side);
    let left = qty;
    if (pos.qty && Math.sign(pos.qty) !== s) {
      const closing = Math.min(left, Math.abs(pos.qty));
      const dir = Math.sign(pos.qty);
      const ticks = (price - pos.avg) * dir;
      trades.push({
        id: ++seq, side: dir > 0 ? 'long' : 'short', qty: closing, entry: pos.avg, exit: price,
        entryAt: pos.at, exitAt: at, ticks, money: ticks * tickValue * closing - commission * closing, costs: commission * closing,
      });
      pos.qty += s * closing;
      left -= closing;
      if (!pos.qty) { pos.avg = 0; pos.at = null; }
    }
    if (left > 0) {
      const q = Math.abs(pos.qty);
      pos.avg = q ? (pos.avg * q + price * left) / (q + left) : price;
      if (!q) pos.at = at;
      pos.qty += s * left;
    }
  }

  function remove(od) { orders = orders.filter((x) => x !== od); }

  function fill(od, price, at) {
    let qty = od.qty;
    if (od.reduceOnly) {
      const can = (od.side === 'buy' && pos.qty < 0) || (od.side === 'sell' && pos.qty > 0) ? Math.abs(pos.qty) : 0;
      if (!can) { remove(od); return; }
      qty = Math.min(qty, can);
    }
    remove(od);
    apply(od.side, qty, price, at);
    fills.push({ t: at, side: od.side, qty, price, type: od.type, role: od.role });
    if (od.group) orders = orders.filter((x) => x.group !== od.group);
    const s = sgn(od.side);
    const opened = Math.sign(pos.qty) === s ? Math.min(qty, Math.abs(pos.qty)) : 0;
    if (od.bracket && opened > 0) attach(s, opened, price, od.bracket, at);
    if (!pos.qty) orders = orders.filter((x) => !x.reduceOnly);
    onEvent({ kind: 'fill', order: od, qty, price, at });
  }

  function attach(s, qty, price, br, at) {
    const g = ++grp;
    const side = s > 0 ? 'sell' : 'buy';
    if (br.limit > 0) orders.push({ id: ++seq, side, type: 'limit', price: price + s * br.limit, qty, role: 'exit', group: g, reduceOnly: true, placedAt: at, leg: 'limit' });
    if (br.stop > 0) orders.push({ id: ++seq, side, type: 'stop', price: price - s * br.stop, qty, role: 'exit', group: g, reduceOnly: true, placedAt: at, leg: 'stop' });
  }

  /* ------------------------------------------------------------ fills inside a bar */

  function trigger(od, a, b, atOpen) {
    const stopAt = (side) => (tickMode ? b : od.price) + sgn(side) * rule.slip;
    const through = rule.fill === 'touch' ? 0 : 1;
    if (atOpen) {
      if (od.type === 'limit' && od.side === 'buy' && a <= od.price - through) return { price: Math.min(a, od.price), dist: 0 };
      if (od.type === 'limit' && od.side === 'sell' && a >= od.price + through) return { price: Math.max(a, od.price), dist: 0 };
      if (od.type === 'stop' && od.side === 'buy' && a >= od.price) return { price: a + rule.slip, dist: 0 };
      if (od.type === 'stop' && od.side === 'sell' && a <= od.price) return { price: a - rule.slip, dist: 0 };
      return null;
    }
    if (od.type === 'limit' && od.side === 'buy') { const lvl = od.price - through; if (b < a && b <= lvl && a > lvl) return { price: od.price, dist: a - lvl }; }
    if (od.type === 'limit' && od.side === 'sell') { const lvl = od.price + through; if (b > a && b >= lvl && a < lvl) return { price: od.price, dist: lvl - a }; }
    if (od.type === 'stop' && od.side === 'buy' && b > a && b >= od.price && a < od.price) return { price: stopAt('buy'), dist: od.price - a };
    if (od.type === 'stop' && od.side === 'sell' && b < a && b <= od.price && a > od.price) return { price: stopAt('sell'), dist: a - od.price };
    return null;
  }
  function sweep(a, b, at, atOpen) {
    const hits = [];
    for (const od of orders.slice()) { const r = trigger(od, a, b, atOpen); if (r) hits.push({ od, ...r }); }
    hits.sort((x, y) => x.dist - y.dist);
    for (const hit of hits) if (orders.includes(hit.od)) fill(hit.od, hit.price, at);
  }
  function run(i) {
    if (!orders.length) return;
    if (tickMode) { if (i > 0) sweep(data.p[i - 1], data.p[i], t[i], false); return; }
    const O = o[i], H = h[i], L = l[i], C = c[i], at = t[i] * unit;
    sweep(O, O, at, true);
    const path = C >= O ? [O, L, H, C] : [O, H, L, C];
    for (let k = 0; k < 3 && orders.length; k++) sweep(path[k], path[k + 1], at, false);
  }

  /* an order already beyond the last price fills now, at that price */
  function marketable(od) {
    const p = now();
    if (od.type === 'limit' && ((od.side === 'buy' && od.price >= p) || (od.side === 'sell' && od.price <= p))) return p;
    if (od.type === 'stop' && ((od.side === 'buy' && od.price <= p) || (od.side === 'sell' && od.price >= p))) return p + sgn(od.side) * rule.slip;
    return null;
  }

  /* ------------------------------------------------------------ what the page calls */

  function place({ side, type, price, qty, bracket = null }) {
    qty = Math.max(1, Math.floor(qty || 1));
    const od = { id: ++seq, side, type, price: type === 'market' ? null : Math.round(price), qty, role: 'entry', group: null, reduceOnly: false, bracket, placedAt: nowT() };
    orders.push(od);
    if (type === 'market') fill(od, now() + sgn(side) * rule.slip, nowT());
    else { const p = marketable(od); if (p !== null) fill(od, p, nowT()); }
    onEvent({ kind: 'change' });
    return od;
  }
  function cancel(id) { orders = orders.filter((x) => x.id !== id); onEvent({ kind: 'change' }); }
  function cancelAll() { orders = []; onEvent({ kind: 'change' }); }
  function modify(id, price) {
    const od = orders.find((x) => x.id === id);
    if (!od) return;
    od.price = Math.round(price);
    const p = marketable(od);
    if (p !== null) fill(od, p, nowT());
    onEvent({ kind: 'change' });
  }
  function flatten() {
    orders = [];
    if (pos.qty) {
      const side = pos.qty > 0 ? 'sell' : 'buy';
      const od = { id: ++seq, side, type: 'market', price: null, qty: Math.abs(pos.qty), role: 'exit', group: null, reduceOnly: true, placedAt: nowT() };
      orders.push(od);
      fill(od, now() + sgn(side) * rule.slip, nowT());
    }
    onEvent({ kind: 'change' });
  }
  /* move the present forward one bar (or to a later bar), filling on the way */
  function step() {
    if (cursor >= data.n - 1) return false;
    cursor++;
    run(cursor);
    return true;
  }
  function advanceTo(i) {
    const target = Math.min(i, data.n - 1);
    while (cursor < target) { cursor++; run(cursor); }
  }
  /* start again from a bar: no orders, no position, a fresh list of trades */
  function reset(i) {
    cursor = Math.max(0, Math.min(i, data.n - 1));
    orders = []; pos = { qty: 0, avg: 0, at: null }; trades = []; fills = [];
    onEvent({ kind: 'change' });
  }
  function setRules(r) { rule = { ...rule, ...r }; }
  function setCommission(v) { commission = v; }

  function state() {
    const p = now();
    const open = pos.qty ? (p - pos.avg) * Math.sign(pos.qty) : 0;
    const realisedMoney = trades.reduce((s, x) => s + x.money, 0);
    return {
      cursor, price: p, time: nowT(), atEnd: cursor >= data.n - 1,
      orders: orders.slice(), position: { ...pos },
      open: { ticks: open, money: open * tickValue * Math.abs(pos.qty) },
      trades: trades.slice(), fills: fills.slice(),
      realised: { money: realisedMoney, ticks: trades.reduce((s, x) => s + x.ticks * x.qty, 0), costs: trades.reduce((s, x) => s + x.costs, 0) },
      rules: { ...rule },
    };
  }

  return { place, cancel, cancelAll, modify, flatten, step, advanceTo, reset, setRules, setCommission, state };
}
