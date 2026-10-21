import { resolve } from 'node:path';
import { runTests } from '@vscode/test-electron';

const root = resolve(import.meta.dirname, '..');

try {
  await runTests({
    ...(process.env.CODOVYN_VSCODE_EXECUTABLE
      ? { vscodeExecutablePath: process.env.CODOVYN_VSCODE_EXECUTABLE } : {}),
    extensionDevelopmentPath: root,
    extensionTestsPath: resolve(root, 'apps/vscode-extension/host/runner.cjs'),
    launchArgs: [root, '--disable-extensions', '--disable-workspace-trust'],
    extensionTestsEnv: process.env.CODOVYN_HOST_SCREENSHOT
      ? { CODOVYN_HOST_SCREENSHOT: process.env.CODOVYN_HOST_SCREENSHOT } : {},
  });
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
