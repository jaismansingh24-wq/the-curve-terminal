/* The opening: the tape prints the curve.

   Faint stars come up on the ink. Then nine brighter ones light one at a
   time, in time order, like trades printing, while a timestamp beside them
   runs on New York's real clock and counts the prints in. Each new print is
   joined to the last. The prints settle onto the line they were scattered
   around, the joins become the curve, the rings close around it and the
   node lands. The name rises beneath.

   Underneath, the loading bar follows the app's real start-up steps (see
   main.js). It eases up so it can be read, but never shows more than has
   really finished. Once it is full, the mark flies to its place on the home
   screen, the name to the title bar, and the home screen arrives behind them.

   A click or any key skips ahead to the finished mark. With reduced motion,
   or with the opening switched off, the mark is shown still while the app
   loads. Drawn on a canvas; only CSSOM styles are touched, so the strict
   security policy holds. */

import { along, toScreen, emblem, star, dot, white, clamp, lerp, seg, eOut, eIO, ePop, rng } from '../shared/js/mark.js';
import { LOADING_LINES, shuffled } from '../shared/js/lines.js';

/* the timeline, in milliseconds from the start */
const T = {
  fieldIn: 700,
  print0: 450,
  gaps: [0, 150, 230, 470, 540, 600, 830, 900, 1120],
  settle: 1720,
  settled: 2420,
  ring: 2000,
  ringed: 2650,
  word: 2450,
  formed: 2750,
  min: 3500,
  cap: 2200,
  wait: 9000,
  fly: 1150,
};
/* where each print sits along the curve, as a share of its length */
const F = [0, 0.1, 0.2, 0.33, 0.45, 0.57, 0.7, 0.85, 1];
const TRAVEL = 'cubic-bezier(.65,0,.35,1)';

const ET = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
function stamp() {
  const d = new Date();
  return ET.format(d) + '.' + String(d.getMilliseconds()).padStart(3, '0') + ' ET';
}

export function runIntro({ animate, reduced, loader }) {
  return new Promise((resolve) => {
    const root = document.documentElement, body = document.body;
    const box = document.getElementById('intro');
    const cv = box && box.querySelector('.intro__c');
    if (!cv || !cv.getContext) { root.classList.remove('intro-armed'); body.classList.remove('intro-running'); body.classList.add('is-revealed', 'no-stagger'); resolve(); return; }

    const ctx = cv.getContext('2d');
    const tape = box.querySelector('.intro__tape');
    const timeEl = box.querySelector('.intro__time'), countEl = box.querySelector('.intro__count');
    const word = box.querySelector('.intro__word'), nameEl = box.querySelector('.intro__name');
    const load = box.querySelector('.intro__load'), fill = box.querySelector('.intro__fill');
    const pct = box.querySelector('.intro__pct'), stepEl = box.querySelector('.intro__step');
    const lineEl = box.querySelector('.intro__line'), skipEl = box.querySelector('.intro__skip');
    box.classList.add('is-live');

    /* the faint field, and how far each print strays from the line */
    const R = rng((Date.now() & 0xffffff) + 7);
    const field = Array.from({ length: 170 }, () => ({
      x: R(), y: R(), r: 0.35 + Math.pow(R(), 3) * 1.15, a: 0.1 + R() * 0.5, ph: R() * 6.283, sp: 0.4 + R() * 0.8,
    }));
    const jit = F.map((_, i) => (i === F.length - 1 ? 0.5 : 1) * (R() < 0.5 ? -1 : 1) * (0.9 + R() * 1.8));

    /* ---------------------------------------------------------- layout */
    let vw, vh, dpr, M, r1;
    function layout() {
      vw = window.innerWidth; vh = window.innerHeight;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
      const vmin = Math.min(vw, vh);
      r1 = clamp(vmin * 0.15, 54, 138);
      M = [vw / 2, vh / 2 - Math.min(44, vh * 0.05)];
      word.style.top = Math.round(M[1] + r1 + 30) + 'px';
      if (vw >= 720) {
        tape.style.left = Math.round(M[0] + r1 + 24) + 'px';
        tape.style.top = Math.round(M[1] + r1 * 0.12) + 'px';
      } else {
        tape.style.left = Math.round(M[0] - 70) + 'px';
        tape.style.top = Math.round(M[1] - r1 - 58) + 'px';
      }
    }
    layout();
    window.addEventListener('resize', layout);

    /* ------------------------------------------------- the loading bar */
    let shown = 0, lastPct = -1;
    function meter(t) {
      const real = loader.done / loader.total;
      const cap = animate && !reduced ? eOut(seg(t, 0, T.cap)) : 1;
      const aim = Math.min(real, cap);
      shown = animate && !reduced ? shown + (aim - shown) * 0.12 : aim;
      if (aim >= 1 && shown > 0.995) shown = 1;
      fill.style.transform = 'scaleX(' + shown.toFixed(4) + ')';
      const p = Math.round(shown * 100);
      if (p === lastPct) return;
      lastPct = p;
      pct.textContent = p + '%';
      const idx = Math.min(loader.total - 1, Math.floor(shown * loader.total));
      const text = shown >= 1 ? 'Ready' : loader.labels[idx] + ' · ' + (idx + 1) + ' / ' + loader.total;
      stepEl.textContent = text;
      load.setAttribute('aria-valuenow', String(p));
      load.setAttribute('aria-valuetext', shown >= 1 ? 'Ready' : 'Loading ' + loader.labels[idx].toLowerCase() + ', step ' + (idx + 1) + ' of ' + loader.total);
    }

    const lines = shuffled(LOADING_LINES);
    let li = 0;
    lineEl.textContent = lines[0];
    const rot = setInterval(() => {
      if (reduced) { li = (li + 1) % lines.length; lineEl.textContent = lines[li]; return; }
      lineEl.classList.add('is-swap');
      setTimeout(() => {
        li = (li + 1) % lines.length;
        lineEl.textContent = lines[li];
        lineEl.classList.remove('is-swap');
      }, 260);
    }, 1700);

    /* ---------------------------------------------------------- frames */
    const ti = (i) => T.print0 + T.gaps[i];
    let t0 = performance.now(), flyAt = 0, skipped = false, ended = false, revealed = false, chrome = false;
    let target = null, tapeOn = false, lastCount = -1;

    function heroTarget() {
      const el = document.querySelector('.hero__mark');
      const rc = el && el.getBoundingClientRect();
      if (!rc || rc.width < 8 || rc.bottom < 0 || rc.top > vh) return null;
      return { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2, r: rc.width * 30 / 64 };
    }

    function draw(t) {
      const still = !animate || reduced;
      const e = flyAt ? eIO(seg(t, flyAt, flyAt + T.fly)) : 0;
      const fieldA = (still ? 1 : eOut(seg(t, 0, T.fieldIn))) * (1 - e);
      const settleE = still ? 1 : eIO(seg(t, T.settle, T.settled));
      const curveA = still ? 1 : eIO(seg(t, T.settle + 250, T.settled));
      const ringP = still ? 1 : eIO(seg(t, T.ring, T.ringed));
      const nodeP = still ? 1 : ePop(seg(t, T.settled - 160, T.settled + 120));
      const breathe = still || flyAt ? 0 : 0.012 * Math.sin((t - T.formed) / 460) * seg(t, T.formed, T.formed + 500);

      let cx = M[0], cy = M[1], r = r1 * (1 + breathe);
      if (flyAt) {
        target = heroTarget() || target;
        if (target) { cx = lerp(cx, target.x, e); cy = lerp(cy, target.y, e); r = lerp(r1, target.r, e); }
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, vw, vh);

      /* the field: faint, still, the slowest of twinkles */
      if (fieldA > 0.01) {
        const keep = r1 * 1.3;
        for (const s of field) {
          const x = s.x * vw, y = s.y * vh;
          if (Math.hypot(x - M[0], y - M[1]) < keep) continue;
          const tw = still ? 1 : 0.84 + 0.16 * Math.sin(t / 1000 * s.sp + s.ph);
          dot(ctx, x, y, s.r, white(s.a * tw * fieldA));
        }
      }

      /* the prints and their joins, until the curve takes over */
      if (!still && curveA < 1) {
        const pts = F.map((f, i) => {
          const a = along(f), j = jit[i] * (1 - settleE);
          return toScreen(cx, cy, r, a.x + a.nx * j, a.y + a.ny * j);
        });
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineWidth = 1;
        for (let i = 1; i < pts.length; i++) {
          const lp = eOut(seg(t, ti(i), ti(i) + 200));
          if (!lp) continue;
          const A = pts[i - 1], B = pts[i];
          ctx.strokeStyle = white(0.5 * (1 - curveA));
          ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(lerp(A[0], B[0], lp), lerp(A[1], B[1], lp)); ctx.stroke();
        }
        ctx.restore();
        pts.forEach((p, i) => {
          const on = eOut(seg(t, ti(i), ti(i) + 140));
          if (!on) return;
          const last = i === pts.length - 1;
          let b = on * (1 - 0.3 * seg(t, ti(i) + 140, ti(i) + 600));
          b *= last ? 1 - seg(t, T.settled - 160, T.settled + 60) : 1 - eIO(seg(t, T.settle + 150, T.settled));
          star(ctx, p[0], p[1], b, last ? 1.05 : 0.72);
        });
      }

      /* the mark */
      emblem(ctx, cx, cy, r, {
        ring: ringP,
        detail: 1,
        curve: curveA,
        width: lerp(1, Math.max(1.6, 2.2 * r / 30), curveA),
        node: nodeP,
        alpha: 1,
      });

      /* the tape readout: New York's clock, and the prints counted in */
      if (!still) {
        const want = t >= T.print0 - 150 && t < T.settled - 80;
        if (want !== tapeOn) { tapeOn = want; tape.classList.toggle('is-on', want); }
        if (tapeOn) {
          timeEl.textContent = stamp();
          let n = 0;
          for (let i = 0; i < F.length; i++) if (t >= ti(i)) n++;
          if (n !== lastCount) { lastCount = n; countEl.textContent = 'Print ' + n + ' / ' + F.length; }
        }
      }

      if (flyAt) {
        if (!revealed && t >= flyAt + T.fly * 0.3) reveal(true);
        if (!chrome && t >= flyAt + T.fly * 0.62) { chrome = true; body.classList.remove('intro-running'); }
        if (t >= flyAt + T.fly) {
          body.classList.add('intro-landed');
          finish();
        }
      }
    }

    function frame(now) {
      if (ended) return;
      const t = now - t0;
      meter(t);
      if (!flyAt) {
        const still = !animate || reduced;
        if (still || t >= T.word) word.classList.add('is-on');
        if (t >= 250 || still) load.classList.add('is-on');
        if (!still && t >= 1200) skipEl.classList.add('is-on');
        const ready = loader.finished && shown >= 1;
        if (still && ready) { leaveStill(); return; }
        if ((t >= (skipped ? T.formed : T.min) && ready) || t >= T.wait) startFly(t);
      }
      draw(t);
      requestAnimationFrame(frame);
    }

    function startFly(t) {
      flyAt = t;
      target = heroTarget();
      load.classList.add('is-done');
      skipEl.classList.remove('is-on');
      box.classList.add('is-leaving');
      body.classList.add('intro-landing');
      flyName();
    }

    /* the name travels to the title bar and hands over to it there */
    function flyName() {
      const to = document.querySelector('.tb__name');
      word.classList.add('is-gone');
      if (!to) return;
      const a = nameEl.getBoundingClientRect(), b = to.getBoundingClientRect();
      if (!a.height || !b.height) return;
      const s = b.height / a.height;
      const dx = (b.left + b.width / 2) - (a.left + a.width / 2), dy = (b.top + b.height / 2) - (a.top + a.height / 2);
      nameEl.style.transition = 'transform ' + T.fly + 'ms ' + TRAVEL + ', letter-spacing ' + T.fly + 'ms ' + TRAVEL +
        ', opacity 320ms ease-out ' + Math.round(T.fly * 0.7) + 'ms';
      nameEl.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) scale(' + s.toFixed(3) + ')';
      nameEl.style.letterSpacing = '0.18em';
      nameEl.style.opacity = '0';
    }

    /* the home screen arrives behind the mark, in its usual order */
    function reveal(stagger) {
      if (revealed) return;
      revealed = true;
      document.querySelectorAll('.arrive').forEach((el, i) => el.style.setProperty('--i', String(i)));
      if (!stagger) body.classList.add('no-stagger');
      body.classList.add('is-revealed');
      root.classList.remove('intro-armed');
    }

    /* without the animation: the still mark goes, the home screen comes */
    function leaveStill() {
      if (reduced) { reveal(false); finish(); return; }
      box.classList.add('is-fading');
      reveal(true);
      setTimeout(finish, 320);
    }

    function skip(e) {
      if (flyAt || ended) return;
      if (e && e.type === 'keydown' && /^(Control|Shift|Alt|Meta)$/.test(e.key)) return;
      skipped = true;
      const t = performance.now() - t0;
      if (t < T.formed) t0 = performance.now() - T.formed;
    }
    const EVENTS = ['pointerdown', 'keydown'];
    EVENTS.forEach((ev) => window.addEventListener(ev, skip, { passive: true }));

    function finish() {
      if (ended) return;
      ended = true;
      clearInterval(rot);
      EVENTS.forEach((ev) => window.removeEventListener(ev, skip));
      window.removeEventListener('resize', layout);
      if (!revealed) reveal(false);
      body.classList.remove('intro-running');
      body.classList.add('intro-landed');
      box.classList.remove('is-live', 'is-leaving', 'is-fading');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      resolve();
    }

    /* never leave the app behind the overlay, whatever happens above
       (a minimised window, for one, gets no animation frames) */
    setTimeout(() => { if (!ended) { loader.promise.then(() => finish()); } }, T.wait + T.fly + 2500);

    requestAnimationFrame(frame);
  });
}
