import { mkdtemp, mkdir, writeFile, cp, readFile, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { runDesktopProcess } from './lib/desktop-process.js';
const root = resolve(import.meta.dirname, '..');
const app = process.env.CODOVYN_DESKTOP_APP ? resolve(process.env.CODOVYN_DESKTOP_APP) : join(root, 'dist/desktop/CODOVYN.app');
const directory = await mkdtemp(join(tmpdir(), 'codovyn-restore-'));
let passed = false;
try {
  const fixture = join(directory, 'project');
  const extensions = join(directory, 'extensions');
  const probe = join(extensions, 'codovyn-tests.restoration-probe-0.0.0');
  await mkdir(fixture); await mkdir(probe, { recursive: true });
  await writeFile(join(fixture, 'restore.txt'), 'Persistent native workspace\n');
  execFileSync('git', ['init', '-q', fixture]);
  await writeFile(join(probe, 'package.json'), JSON.stringify({ name: 'restoration-probe', publisher: 'codovyn-tests',
    version: '0.0.0', engines: { vscode: '^1.100.0' }, main: './extension.cjs', activationEvents: ['onStartupFinished'] }));
  await cp(join(root, 'apps/desktop/host/restoration.cjs'), join(probe, 'extension.cjs'));
  for (const phase of ['write', 'read']) {
    const reportPath = join(directory, `${phase}.json`);
    const args = [...(phase === 'write' ? [fixture] : []), '--user-data-dir', join(directory, 'profile'),
      '--extensions-dir', extensions, '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes'];
    await runDesktopProcess({ executable: join(app, 'Contents/MacOS/CODOVYN'), args,
      directory, phase,
      env: { ...process.env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin', CODOVYN_RESTORE_PHASE: phase, CODOVYN_RESTORE_REPORT: reportPath } });
    const report = JSON.parse(await readFile(reportPath));
    assert.equal(report.error, undefined, JSON.stringify(report));
    if (phase === 'read') {
      assert.equal(report.workspace, true); assert.equal(report.editor, true); assert.equal(report.localState, true);
      await mkdir(join(root, 'dist/desktop'), { recursive: true });
      await writeFile(join(root, 'dist/desktop/restoration-result.json'), JSON.stringify(report, null, 2));
    }
    await mkdir(join(root, 'dist/desktop'), { recursive: true });
    await copyFile(join(directory, `${phase}-lifecycle.json`), join(root, `dist/desktop/restoration-${phase}-lifecycle.json`));
    console.log('Native restoration phase passed:', report);

  }
  passed = true;
} finally {
  if (passed) await rm(directory, { recursive: true, force: true });
  else console.error(`Preserved restoration diagnostics: ${directory}`);
}
