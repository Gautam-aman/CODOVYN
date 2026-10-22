import { mkdtemp, writeFile, readFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { runDesktopProcess } from './lib/desktop-process.js';
const root = resolve(import.meta.dirname, '..');
const app = process.env.CODOVYN_DESKTOP_APP
  ? resolve(process.env.CODOVYN_DESKTOP_APP, 'Contents') : join(root, 'dist/desktop/CODOVYN.app/Contents');
const temporary = await mkdtemp(join(tmpdir(), 'codovyn-desktop-host-'));
let passed = false;
try {
  const fixture = join(temporary, 'project');
  await mkdir(fixture);
  await writeFile(join(fixture, 'desktop-smoke.txt'), '');
  execFileSync('git', ['init', '-q', fixture]);
  await runDesktopProcess({ executable: join(app, 'MacOS/CODOVYN'), directory: temporary, phase: 'host',
    args: [fixture, '--user-data-dir', join(temporary, 'profile'), '--extensions-dir', join(temporary, 'extensions'),
      '--extensionDevelopmentPath', join(app, 'Resources/app/extensions/codovyn-desktop'),
      '--extensionTestsPath', join(root, 'apps/desktop/host/runner.cjs'),
      '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes',
      ...(process.env.CODOVYN_HOST_DEBUG_PORT ? [`--remote-debugging-port=${process.env.CODOVYN_HOST_DEBUG_PORT}`] : [])],
    env: { ...process.env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' } });
  const report = JSON.parse(await readFile(join(fixture, 'host-result.json')));
  assert.equal(report.app, 'CODOVYN Desktop');
  assert.equal(report.terminal, true);
  await mkdir(join(root, 'dist/desktop'), { recursive: true });
  await writeFile(join(root, 'dist/desktop/host-result.json'), JSON.stringify(report, null, 2));
  console.log('Verified standalone desktop host:', report);
  await copyFile(join(temporary, 'host-lifecycle.json'), join(root, 'dist/desktop/host-lifecycle.json'));
  passed = true;
} finally {
  if (passed) await rm(temporary, { recursive: true, force: true });
  else console.error(`Preserved native host diagnostics: ${temporary}`);
}
