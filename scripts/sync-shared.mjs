// Copies shared/ (fonts, base styles, the mark, the sky) into each window's
// interface folder, so the app and setup are built from one set of files.
// Run automatically by the npm scripts; the copies are not committed.

import { cpSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'shared');

for (const target of ['app/ui/shared', 'installer/ui/shared']) {
  const dest = join(root, target);
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true });
  console.log('shared -> ' + target);
}
