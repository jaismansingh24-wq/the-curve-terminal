// A design preview: serves one interface folder over http://localhost with
// the same security policy the app ships with, so a page that would break
// under it breaks here too. No native features (Discord, startup, window
// buttons) in the preview; the interface says so where it matters.
//
//   node scripts/serve.mjs app        -> http://localhost:5181
//   node scripts/serve.mjs installer  -> http://localhost:5182

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const which = process.argv[2] === 'installer' ? 'installer' : 'app';
const dir = join(root, which, 'ui');
const port = which === 'installer' ? 5182 : 5181;

const conf = JSON.parse(await readFile(join(root, which, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const csp = Object.entries(conf.app.security.csp).map(([k, v]) => k + ' ' + v).join('; ');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.json': 'application/json', '.mp4': 'video/mp4', '.webm': 'video/webm',
};

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = normalize(join(dir, p));
    if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
    await stat(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Content-Security-Policy': csp,
      'Cache-Control': 'no-store',
    });
    res.end(await readFile(file));
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(which + ' preview on http://localhost:' + port));
