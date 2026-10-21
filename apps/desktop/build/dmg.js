import { mkdtemp, symlink, rm, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '../../..');
const output = join(root, 'dist/desktop');
const app = join(output, 'CODOVYN.app');
await access(app);
const stage = await mkdtemp(join(output, '.dmg-'));
try {
  execFileSync('/usr/bin/ditto', [app, join(stage, 'CODOVYN.app')]);
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', join(stage, 'CODOVYN.app')]);
  await symlink('/Applications', join(stage, 'Applications'));
  const image = join(output, 'CODOVYN-darwin-arm64-development.dmg');
  execFileSync('/usr/bin/hdiutil', ['create', '-volname', 'CODOVYN Development', '-srcfolder', stage,
    '-ov', '-format', 'UDZO', image], { stdio: 'inherit' });
  execFileSync('/usr/bin/hdiutil', ['verify', image], { stdio: 'inherit' });
  console.log(`Unnotarized development disk image: ${image}`);
} finally { await rm(stage, { recursive: true, force: true }); }
