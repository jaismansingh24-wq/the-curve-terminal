// Builds the file a reader downloads: dist/TheCurveTerminal-Setup-<version>.exe
//
//   1. copy shared/ into both interfaces
//   2. run the rules check (stops here if anything fails)
//   3. build the app, optimised
//   4. stage it inside setup (installer/src-tauri/payload/)
//   5. build setup, which embeds it
//   6. copy setup to dist/ and print its size and SHA-256
//
// Nothing is uploaded or published. Putting the file on thecurve.in is a
// separate, deliberate step.

import { execSync } from 'node:child_process';
import { readFileSync, mkdirSync, copyFileSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const run = (cmd, cwd = root) => { console.log('\n> ' + cmd); execSync(cmd, { cwd, stdio: 'inherit' }); };

function targetDir() {
  const meta = JSON.parse(execSync('cargo metadata --format-version 1 --no-deps', { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  return meta.target_directory;
}

run('node scripts/sync-shared.mjs');
run('node scripts/check.mjs');

run('npx tauri build --no-bundle', join(root, 'app'));
const target = targetDir();
const appExe = join(target, 'release', 'the-curve-terminal.exe');
if (!existsSync(appExe)) throw new Error('The app build did not produce ' + appExe);

const payload = join(root, 'installer', 'src-tauri', 'payload');
mkdirSync(payload, { recursive: true });
copyFileSync(appExe, join(payload, 'the-curve-terminal.exe'));
console.log('\nstaged the app inside setup (' + (statSync(appExe).size / 1048576).toFixed(1) + ' MB)');

run('npx tauri build --no-bundle', join(root, 'installer'));
const setupExe = join(target, 'release', 'the-curve-terminal-setup.exe');
if (!existsSync(setupExe)) throw new Error('The setup build did not produce ' + setupExe);

mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist', 'TheCurveTerminal-Setup-' + version + '.exe');
copyFileSync(setupExe, out);
const bytes = readFileSync(out);
const sha = createHash('sha256').update(bytes).digest('hex');
console.log('\n' + out);
console.log('size    ' + (bytes.length / 1048576).toFixed(1) + ' MB');
console.log('sha256  ' + sha);
