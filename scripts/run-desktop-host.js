import { mkdtemp, writeFile, readFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { runDesktopProcess, nativeProfileArgs, nativeTestCancellation } from './lib/desktop-process.js';
const root = resolve(import.meta.dirname, '..');
const app = process.env.CODOVYN_DESKTOP_APP
  ? resolve(process.env.CODOVYN_DESKTOP_APP, 'Contents') : join(root, 'dist/desktop/CODOVYN.app/Contents');
const temporary = await mkdtemp(join(tmpdir(), 'codovyn-desktop-host-'));
const cancellation = nativeTestCancellation();
let passed = false;
try {
  const fixture = join(temporary, 'project');
  await mkdir(fixture);
  if (process.env.CODOVYN_HOST_WORKSPACE_FILE) await writeFile(process.env.CODOVYN_HOST_WORKSPACE_FILE, fixture, 'utf8');
  await writeFile(join(fixture, 'desktop-smoke.txt'), '');
  execFileSync('git', ['init', '-q', fixture]);
  execFileSync('git', ['-C', fixture, 'add', '.']);
  execFileSync('git', ['-C', fixture, '-c', 'user.name=CODOVYN Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'native fixture']);
  const profileMode = process.env.CODOVYN_HOST_PROFILE_MODE || 'fresh';
  if (!['fresh', 'warm'].includes(profileMode)) throw new Error('CODOVYN_HOST_PROFILE_MODE must be fresh or warm.');
  const phases = profileMode === 'warm' ? ['fresh-profile', 'warm-profile'] : ['fresh-profile'];
  const reports = [];
  for (const phase of phases) {
    const phaseDirectory = join(temporary, phase);
    await mkdir(phaseDirectory);
    await runDesktopProcess({ signal: cancellation.signal, executable: join(app, 'MacOS/CODOVYN'), directory: phaseDirectory,
      phase: `host-${phase}`, args: [fixture, ...nativeProfileArgs(temporary),
        '--extensionDevelopmentPath', join(app, 'Resources/app/extensions/codovyn-desktop'),
        '--extensionTestsPath', join(root, 'apps/desktop/host/runner.cjs'),
        '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes',
        ...(process.env.CODOVYN_HOST_DEBUG_PORT ? [`--remote-debugging-port=${process.env.CODOVYN_HOST_DEBUG_PORT}`] : [])],
      env: { ...process.env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' } });
    const report = JSON.parse(await readFile(join(fixture, 'host-result.json')));
    assert.equal(report.app, 'CODOVYN Desktop');
    assert.equal(report.terminal, true);
    reports.push(report);
  }
  const output = join(root, 'dist/desktop');
  await mkdir(output, { recursive: true });
  const result = reports.length === 1 ? reports[0] : { profileMode, launches: reports };
  await writeFile(join(output, 'host-result.json'), JSON.stringify(result, null, 2));
  console.log('Verified standalone desktop host:', result);
  for (const phase of phases) {
    const phaseDirectory = join(temporary, phase);
    const suffix = profileMode === 'fresh' ? '' : `-${phase}`;
    await copyFile(join(phaseDirectory, `host-${phase}-lifecycle.json`), join(output, `host-lifecycle${suffix}.json`));
    await copyFile(join(phaseDirectory, `host-${phase}-trace.jsonl`), join(output, `host-trace${suffix}.jsonl`));
  }
  passed = true;
} finally {
  cancellation.dispose();
  if (passed) await rm(temporary, { recursive: true, force: true });
  else console.error(`Preserved native host diagnostics: ${temporary}`);
}
