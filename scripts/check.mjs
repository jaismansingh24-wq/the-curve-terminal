// The rules, checked by machine. Run before every release: npm run check
// (release.mjs runs it too and stops if anything fails).
//
// Mirrors the website's scripts/check.sh, plus the Terminal's own:
//   1. No gradients, anywhere a reader could see one
//   2. No strategy or advice language
//   3. No em dashes in anything a reader reads
//   4. No mention of AI
//   5. Strict security policy: no inline scripts, styles or handlers, no eval
//   6. Data colours (bid green, ask red) only as tokens, never in chrome
//   7. The disclaimer is on the home screen, in setup and in the readme
//   8. Every stored key is described on the Privacy panel
//   9. Fonts and scripts are the app's own files: nothing from a CDN
//  10. The version agrees everywhere, and What's new covers it
//  11. Every address the app fetches from is listed on Sources and Privacy

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rel = (p) => relative(root, p).replace(/\\/g, '/');

function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, exts, out);
    else if (exts.includes(extname(name))) out.push(p);
  }
  return out;
}

// What a reader can see: both interfaces (with the shared files), the
// readme, the Discord lines, the setup strings, and the app metadata.
const UI = [
  ...walk(join(root, 'shared'), ['.html', '.css', '.js', '.svg']),
  ...walk(join(root, 'app/ui'), ['.html', '.css', '.js', '.svg']).filter((p) => !rel(p).startsWith('app/ui/shared/')),
  ...walk(join(root, 'installer/ui'), ['.html', '.css', '.js', '.svg']).filter((p) => !rel(p).startsWith('installer/ui/shared/')),
];
const RUST = [
  ...walk(join(root, 'app/src-tauri/src'), ['.rs']),
  ...walk(join(root, 'installer/src-tauri/src'), ['.rs']),
];
const TEXT = [join(root, 'assets/README.txt'), join(root, 'CHANGELOG.md')].filter(existsSync);
const META = [
  join(root, 'app/src-tauri/tauri.conf.json'),
  join(root, 'installer/src-tauri/tauri.conf.json'),
  join(root, 'app/src-tauri/Cargo.toml'),
  join(root, 'installer/src-tauri/Cargo.toml'),
  join(root, 'package.json'),
  join(root, 'assets/icon.svg'),
];
const READ = [...UI, ...RUST, ...TEXT, ...META];

const read = (p) => readFileSync(p, 'utf8');
const results = [];
function check(name, fails) {
  results.push({ name, fails });
  console.log((fails.length ? 'FAIL ' : 'pass ') + name);
  for (const f of fails) console.log('       ' + f);
}

/* only the strings in Rust: comments there are for developers */
function rustStrings(src) {
  return [...src.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join('\n');
}
/* what a reader reads in HTML: text and attribute values, not tags or comments */
function htmlText(src) {
  return src.replace(/<!--[\s\S]*?-->/g, ' ');
}
function grepAll(files, re, pick = (p, s) => s) {
  const fails = [];
  for (const p of files) {
    const src = pick(p, read(p));
    src.split('\n').forEach((line, i) => {
      if (re.test(line)) fails.push(rel(p) + ':' + (i + 1) + '  ' + line.trim().slice(0, 110));
    });
  }
  return fails;
}
const visible = (p, s) => (p.endsWith('.rs') ? rustStrings(s) : p.endsWith('.html') ? htmlText(s) : s);

// 1. gradients: the word itself fails, as on the website
check('1. No gradients', grepAll([...UI, join(root, 'assets/icon.svg')], /gradient/i));

// 2. strategy language: the website's list, as a floor, plus a few more.
//    "Win rate" itself is a measurement the stats report (with its range);
//    what the brief rules out is a win rate offered as a promise, which the
//    words "guaranteed" and "proven" catch.
const STRATEGY = new RegExp([
  'buy when', 'sell when', 'entry signal', 'take profit', 'stop loss placement', 'target of',
  'go long when', 'go short when', 'this means price will',
  'bullish', 'bearish', 'buy signal', 'sell signal', 'price target', 'guaranteed', 'proven win',
].join('|'), 'i');
check('2. No strategy or advice language', grepAll(READ, STRATEGY, visible));

// 3. em dashes, and the HTML entity for one
check('3. No em dashes', grepAll(READ, /\u2014|&mdash;|\\u2014/, visible));

// 4. no mention of AI, in anything shipped or described
const AI = /\bAI\b|artificial intelligence|machine learning|\bLLM\b|\bGPT\b|chatbot|Claude|Anthropic|OpenAI/;
check('4. No mention of AI', grepAll(READ, AI, visible));

// 5. strict security policy
{
  const fails = [];
  for (const p of UI.filter((f) => f.endsWith('.html'))) {
    const s = read(p);
    if (/<[a-z][^>]*\sstyle\s*=/i.test(s)) fails.push(rel(p) + ': inline style attribute');
    if (/<script(?![^>]*\ssrc=)[^>]*>/i.test(s)) fails.push(rel(p) + ': inline script');
    if (/<style[\s>]/i.test(s)) fails.push(rel(p) + ': inline <style> block');
    if (/\son[a-z]+\s*=/i.test(s)) fails.push(rel(p) + ': inline event handler');
  }
  for (const p of UI.filter((f) => f.endsWith('.js'))) {
    const s = read(p);
    if (/\beval\s*\(|new Function\s*\(/.test(s)) fails.push(rel(p) + ': eval');
    if (/style=\\?["']/.test(s) && /innerHTML|insertAdjacentHTML/.test(s)) fails.push(rel(p) + ': inline style in generated markup');
    if (/setAttribute\(\s*['"]style['"]/.test(s)) fails.push(rel(p) + ': style set as an attribute (use the CSSOM)');
  }
  for (const conf of ['app/src-tauri/tauri.conf.json', 'installer/src-tauri/tauri.conf.json']) {
    const csp = JSON.parse(read(join(root, conf))).app.security.csp || {};
    if (csp['script-src'] !== "'self'") fails.push(conf + ": script-src must be exactly 'self'");
    if (csp['style-src'] !== "'self'") fails.push(conf + ": style-src must be exactly 'self'");
    if (JSON.stringify(csp).includes('unsafe')) fails.push(conf + ': an unsafe- source in the policy');
  }
  check('5. Strict security policy', fails);
}

// 6. data colours: defined once as tokens, used only in the data stylesheet
//    (results and chart marks); anywhere else they would be chrome
{
  const DATA = /#2fa37a|#c4453c|47 163 122|196 69 60|var\(--(bid|ask)/i;
  const fails = grepAll(UI, DATA)
    .filter((f) => !/shared\/css\/base\.css:\d+\s+--(bid|ask)/.test(f))
    .filter((f) => !/^shared\/css\/data\.css:/.test(f));
  check('6. Bid and ask colours only for data', fails);
}

// 7. the disclaimer
{
  const fails = [];
  const want = [
    ['app/ui/index.html', /not investment advice/i],
    ['app/ui/index.html', /Securities and Exchange Board of India/],
    ['installer/ui/index.html', /not investment advice/i],
    ['assets/README.txt', /not investment,\s+financial, legal or tax advice/i],
  ];
  for (const [f, re] of want) if (!re.test(read(join(root, f)))) fails.push(f + ': disclaimer missing');
  check('7. Disclaimer present', fails);
}

// 8. every stored key is on the Privacy panel
{
  const keys = new Set();
  for (const p of UI.filter((f) => f.endsWith('.js'))) {
    const s = read(p);
    for (const m of s.matchAll(/\b(?:get|set|del|getJSON|setJSON|sget|sset)\(\s*'([a-z][a-z0-9_.-]*)'/g)) {
      if (/store\.js|from '\.\.\/shared\/js\/store\.js'|from '\.\/store\.js'/.test(s) || p.endsWith('store.js')) keys.add('thecurve.terminal.' + m[1]);
    }
    for (const m of s.matchAll(/'(thecurve\.terminal\.[a-z0-9_.-]+)'/g)) keys.add(m[1]);
  }
  const privacy = read(join(root, 'app/ui/index.html'));
  const fails = [...keys].filter((k) => !privacy.includes('<code>' + k + '</code>')).map((k) => k + ' is stored but not described on the Privacy panel');
  check('8. Every stored key described (' + [...keys].join(', ') + ')', fails);
}

// 9. no outside files: fonts, scripts and styles are the app's own
check('9. Nothing loaded from outside', grepAll(UI.filter((f) => /\.(html|css)$/.test(f)), /(src|href)\s*=\s*["']https?:|url\(\s*["']?https?:|@import/i));

// 10. versions
{
  const fails = [];
  const v = JSON.parse(read(join(root, 'package.json'))).version;
  const confs = ['app/src-tauri/tauri.conf.json', 'installer/src-tauri/tauri.conf.json'];
  for (const c of confs) { const cv = JSON.parse(read(join(root, c))).version; if (cv !== v) fails.push(c + ' says ' + cv + ', package.json says ' + v); }
  const cargo = read(join(root, 'Cargo.toml')).match(/^version\s*=\s*"([^"]+)"/m);
  if (!cargo || cargo[1] !== v) fails.push('Cargo.toml workspace version is not ' + v);
  if (!read(join(root, 'app/ui/index.html')).includes('<h3 class="title">' + v + '</h3>')) fails.push("What's new has no entry for " + v);
  if (!read(join(root, 'CHANGELOG.md')).includes('## ' + v)) fails.push('CHANGELOG.md has no entry for ' + v);
  if (!read(join(root, 'assets/README.txt')).includes('Version ' + v)) fails.push('README.txt does not say Version ' + v);
  check('10. Version ' + v + ' agrees everywhere', fails);
}

// 11. The Backdrop's addresses: each one the native side fetches from must be
//     on the Sources panel (host and fixed path) and named on the Privacy panel
{
  const fails = [];
  const html = read(join(root, 'app/ui/index.html'));
  const sources = (/<dialog[^>]*id="dlg-sources"[\s\S]*?<\/dialog>/.exec(html) || [''])[0];
  const privacy = (/<dialog[^>]*id="dlg-privacy"[\s\S]*?<\/dialog>/.exec(html) || [''])[0];
  if (!sources) fails.push('app/ui/index.html: no Sources panel');
  const rs = rustStrings(read(join(root, 'app/src-tauri/src/backdrop.rs')));
  for (const m of rs.matchAll(/https:\/\/([a-z0-9.-]+)(\/[^\s"{?&]*)?/gi)) {
    if (m[1] === 'thecurve.in') continue;
    const fixed = m[1] + (m[2] || '');
    if (!sources.includes(fixed)) fails.push(fixed + ' is fetched but not on the Sources panel');
    if (!privacy.includes(m[1])) fails.push(m[1] + ' is fetched but not named on the Privacy panel');
  }
  check('11. Every address fetched is on Sources and Privacy', [...new Set(fails)]);
}

const failed = results.filter((r) => r.fails.length);
console.log('');
console.log(failed.length ? 'CHECKS FAILED (' + failed.length + ')' : 'ALL CHECKS PASSED');
process.exit(failed.length ? 1 : 0);
