import { mkdtemp, writeFile, readFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { runDesktopProcess, nativeProfileArgs, nativeTestCancellation } from './lib/desktop-process.js';

if (process.platform !== 'darwin') throw new Error('The native Chat test requires the standalone macOS desktop build.');
const root = resolve(import.meta.dirname, '..');
const app = process.env.CODOVYN_DESKTOP_APP
  ? resolve(process.env.CODOVYN_DESKTOP_APP, 'Contents') : join(root, 'dist/desktop/CODOVYN.app/Contents');
const temporary = await mkdtemp(join(tmpdir(), 'codovyn-desktop-chat-'));
const fixture = join(temporary, 'project');
const profile = join(temporary, 'profile');
const dataDirectory = join(profile, 'User', 'globalStorage', 'codovyn-local.codovyn', 'private');
const cancellation = nativeTestCancellation();
let passed = false;
try {
  await mkdir(fixture);
  await writeFile(join(fixture, 'chat-smoke.txt'), 'Disposable native Chat fixture.\n');
  execFileSync('git', ['init', '-q', fixture]);
  const reports = [];
  for (const phase of ['first-launch', 'relaunch']) {
    const phaseDirectory = join(temporary, phase);
    await mkdir(phaseDirectory);
    const output = join(phaseDirectory, 'chat-result.json');
    await runDesktopProcess({ signal: cancellation.signal, executable: join(app, 'MacOS/CODOVYN'), directory: phaseDirectory,
      phase: `chat-${phase}`, args: [fixture, ...nativeProfileArgs(temporary),
        '--extensionDevelopmentPath', join(app, 'Resources/app/extensions/codovyn-desktop'),
        '--extensionTestsPath', join(root, 'apps/desktop/host/chat-runner.cjs'),
        '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes'],
      env: { ...process.env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin', CODOVYN_NATIVE_CHAT_TEST: '1',
        CODOVYN_NATIVE_CHAT_PHASE: phase, CODOVYN_NATIVE_CHAT_DATA_DIR: dataDirectory,
        CODOVYN_NATIVE_CHAT_REPORT: output,
        CODOVYN_NATIVE_CHAT_SCREENSHOT: phase === 'first-launch'
          ? join(root, 'docs/assets/desktop-phase8-native-chat.png') : '' } });
    const report = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(report.app, 'CODOVYN Desktop');
    assert.equal(report.passed, true);
    assert.equal(report.checks.sqliteJournalRestoration, true);
    reports.push(report);
    await copyFile(join(phaseDirectory, `chat-${phase}-lifecycle.json`), join(root, 'dist/desktop', `chat-${phase}-lifecycle.json`));
  }
  assert.deepEqual(reports[0].checks.transcriptMessages, reports[1].checks.transcriptMessages,
    'The same persisted task journal must reconstruct the same transcript after an application restart.');
  await mkdir(join(root, 'dist/desktop'), { recursive: true });
  await writeFile(join(root, 'dist/desktop/chat-host-result.json'), JSON.stringify({ phases: reports }, null, 2));
  console.log('Verified standalone CODOVYN Chat on two isolated native launches:', reports.map(report => report.checks));
  passed = true;
} finally {
  cancellation.dispose();
  if (passed) await rm(temporary, { recursive: true, force: true });
  else console.error(`Preserved native Chat diagnostics: ${temporary}`);
}
