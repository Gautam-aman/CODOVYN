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
  const fixtureBin = join(temporary, 'bin'); await mkdir(fixtureBin);
  // Documented metadata transport fixture; no thread/turn or paid request.
  await writeFile(join(fixtureBin, 'codex'), '#!' + process.execPath + '\n' + `if(process.argv.includes('--version')){console.log('codex-cli fixture');process.exit(0);}const readline=require('readline');readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.id)console.log(JSON.stringify({id:m.id,result:m.id===1?{}:m.id===2?{data:[{model:'native-default',isDefault:true,supportedReasoningEfforts:[{reasoningEffort:'low'},{reasoningEffort:'high'},{reasoningEffort:'xhigh'}]}]}:{config:{model:'native-default'}}}));});`, { mode: 0o755 });
  await writeFile(join(fixture, 'chat-smoke.txt'), 'Disposable native Chat fixture.\n');
  execFileSync('git', ['init', '-q', fixture]);
  execFileSync('git', ['-C', fixture, 'add', '.']);
  execFileSync('git', ['-C', fixture, '-c', 'user.name=CODOVYN Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'native fixture']);
  // A real installed probe avoids the in-memory global storage forced by
  // --extensionTestsPath and exercises actual favorite/model persistence.
  const probe = join(temporary, 'extensions', 'codovyn-tests.native-chat-probe-0.0.0');
  await mkdir(probe, { recursive: true });
  await writeFile(join(probe, 'package.json'), JSON.stringify({ name: 'native-chat-probe', publisher: 'codovyn-tests', version: '0.0.0', engines: { vscode: '^1.100.0' }, main: './extension.cjs', activationEvents: ['onStartupFinished'] }));
  await writeFile(join(probe, 'extension.cjs'), `exports.activate = async () => { try { await require(${JSON.stringify(join(root, 'apps/desktop/host/chat-runner.cjs'))}).run(); } catch (error) { console.error(error); require('node:fs').writeFileSync(process.env.CODOVYN_NATIVE_CHAT_REPORT, JSON.stringify({passed:false,error:error.message})); await require('vscode').commands.executeCommand('workbench.action.quit'); } };`);
  const reports = [];
  for (const phase of ['first-launch', 'relaunch']) {
    const phaseDirectory = join(temporary, phase);
    await mkdir(phaseDirectory);
    const output = join(phaseDirectory, 'chat-result.json');
    await runDesktopProcess({ signal: cancellation.signal, executable: join(app, 'MacOS/CODOVYN'), directory: phaseDirectory,
      phase: `chat-${phase}`, args: [fixture, ...nativeProfileArgs(temporary),
        '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes',
        ...(process.env.CODOVYN_HOST_DEBUG_PORT ? [`--remote-debugging-port=${process.env.CODOVYN_HOST_DEBUG_PORT}`] : [])],
      env: { ...process.env, VSCODE_CLI: '1', PATH: `${fixtureBin}:/usr/bin:/bin:/usr/sbin:/sbin`, CODOVYN_NATIVE_CHAT_TEST: '1',
        CODOVYN_NATIVE_CHAT_PHASE: phase, CODOVYN_NATIVE_CHAT_DATA_DIR: dataDirectory,
        CODOVYN_NATIVE_CHAT_REPORT: output,
        CODOVYN_NATIVE_CHAT_SCREENSHOT: phase === 'first-launch'
          ? join(root, 'dist/desktop/native-chat-capture.png') : '' } });
    const report = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(report.passed, true, report.error || 'The native Chat probe did not complete.');
    assert.equal(report.app, 'CODOVYN Desktop');
    assert.equal(report.passed, true);
    assert.equal(report.checks.sqliteJournalRestoration, true);
    reports.push(report);
    await copyFile(join(phaseDirectory, `chat-${phase}-lifecycle.json`), join(root, 'dist/desktop', `chat-${phase}-lifecycle.json`));
  }
  assert.equal(reports[1].checks.queueRestoredAfterRestart, true, 'Queued tasks remain durable and inert across native restart.');
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
