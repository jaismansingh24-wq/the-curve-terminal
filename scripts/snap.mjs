// Starts the real app, takes screenshots of its window, reports any errors
// from inside it, then closes it the normal way (so Discord status clears).
// For testing the app from somewhere else: run this, then look at the PNGs.
//
//   node scripts/snap.mjs                         home screen after the opening
//   node scripts/snap.mjs --at 1.5,3,7            screenshots at these seconds
//   node scripts/snap.mjs --open settings         open a panel first
//   node scripts/snap.mjs --eval "document.title" print what an expression returns
//   node scripts/snap.mjs --exe "C:\...\The Curve Terminal.exe"   test an installed copy
//   node scripts/snap.mjs --discord               let Discord status show (off by default)
//
// Uses the release build by default (npm run release makes it). Screenshots
// go to dist/snaps/. The window is driven through WebView2's local
// debugging port, which only this computer can reach and only while the
// test runs.

import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};

const PORT = 9340;
const at = opt('at', '7').split(',').map(Number).filter((n) => n >= 0).sort((a, b) => a - b);
const panel = opt('open', '');
const expr = opt('eval', '');
let exe = opt('exe', '');
if (!exe) {
  const meta = JSON.parse(execSync('cargo metadata --format-version 1 --no-deps', { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  exe = join(meta.target_directory, 'release', 'the-curve-terminal.exe');
}
if (!existsSync(exe)) { console.error('No app at ' + exe + '. Build it first: npm run release'); process.exit(1); }

const outDir = join(root, 'dist', 'snaps');
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* --test keeps Discord status off for this run; --discord lets it show */
const child = spawn(exe, args.includes('--discord') ? [] : ['--test'], {
  env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=' + PORT },
  stdio: 'ignore',
});
const started = Date.now();

/* wait for the window's page to appear on the debugging port */
let page = null;
for (let i = 0; i < 100 && !page; i++) {
  try {
    const list = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json();
    page = list.find((t) => t.type === 'page');
  } catch (e) { /* not up yet */ }
  if (!page) await sleep(200);
}
if (!page) { console.error('The app window did not appear within 20 seconds.'); child.kill(); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const problems = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === 'Runtime.exceptionThrown') problems.push('error: ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) problems.push(msg.params.type + ': ' + msg.params.args.map((a) => a.value ?? a.description).join(' '));
  if (msg.method === 'Log.entryAdded' && ['error', 'warning'].includes(msg.params.entry.level)) problems.push(msg.params.entry.level + ': ' + msg.params.entry.text);
};
const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
await new Promise((r) => (ws.onopen = r));
await send('Runtime.enable');
await send('Log.enable');

const saved = [];
for (const [i, sec] of at.entries()) {
  const wait = sec * 1000 - (Date.now() - started);
  if (wait > 0) await sleep(wait);
  /* open a panel just before the last screenshot, once the opening is over */
  if (panel && i === at.length - 1) {
    await evaluate(`(() => { const b = document.querySelector('[data-open="${panel.replace(/"/g, '')}"]'); if (b) b.click(); return !!b; })()`);
    await sleep(700);
  }
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const file = join(outDir, stamp + '-' + String(sec).replace('.', '_') + 's' + (panel && i === at.length - 1 ? '-' + panel : '') + '.png');
  writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
  saved.push(file);
}

if (expr) console.log('eval: ' + JSON.stringify(await evaluate(expr)));
const status = await evaluate(`[document.querySelector('[data-presence-status]')?.textContent, document.querySelector('[data-version]')?.textContent, innerWidth + 'x' + innerHeight].join(' | ')`);
console.log('app: ' + status);

/* close the window the normal way, so the app tidies up after itself */
await evaluate(`setTimeout(() => window.__TAURI__.window.getCurrentWindow().close(), 100), true`);
ws.close();
const gone = await Promise.race([new Promise((r) => child.on('exit', () => r(true))), sleep(5000).then(() => false)]);
if (!gone) child.kill();

saved.forEach((f) => console.log('saved ' + f));
console.log(problems.length ? problems.join('\n') : 'no errors or warnings from inside the app');
