import { mkdtemp, writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '..');
const app = process.env.CODOVYN_DESKTOP_APP
  ? resolve(process.env.CODOVYN_DESKTOP_APP, 'Contents') : join(root, 'dist/desktop/CODOVYN.app/Contents');
const temporary = await mkdtemp(join(tmpdir(), 'codovyn-desktop-host-'));
try {
  const fixture = join(temporary, 'project');
  await mkdir(fixture);
  await writeFile(join(fixture, 'desktop-smoke.txt'), '');
  execFileSync('git', ['init', '-q', fixture]);
  const child = spawn(join(app, 'MacOS/CODOVYN'), [fixture,
    '--user-data-dir', join(temporary, 'profile'), '--extensions-dir', join(temporary, 'extensions'),
    '--extensionDevelopmentPath', join(app, 'Resources/app/extensions/codovyn-desktop'),
    '--extensionTestsPath', join(root, 'apps/desktop/host/runner.cjs'),
    '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes'],
  { stdio: 'inherit', env: { ...process.env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' } });
  const timer = setTimeout(() => child.kill('SIGTERM'), 120000);
  try {
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
    assert.equal(code, 0, 'desktop host must exit successfully');
    const report = JSON.parse(await readFile(join(fixture, 'host-result.json')));
    assert.equal(report.app, 'CODOVYN Desktop');
    assert.equal(report.terminal, true);
    await mkdir(join(root, 'dist/desktop'), { recursive: true });
    await writeFile(join(root, 'dist/desktop/host-result.json'), JSON.stringify(report, null, 2));
    console.log('Verified standalone desktop host:', report);
  } finally { clearTimeout(timer); }
} finally { await rm(temporary, { recursive: true, force: true }); }
