import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { runtimePath } = createRequire(import.meta.url)('../extension.cjs');
test('desktop uses bundled Node while companion and explicit overrides retain their settings', () => {
  const api = (value) => ({ workspace: { getConfiguration: () => ({ get: () => value }) } });
  const context = { extensionPath: '/app/extensions/codovyn', extension: { packageJSON: { codovynBundledRuntime: '../../../runtime/bin/node' } } };
  assert.equal(runtimePath(api('node'), context), '/runtime/bin/node');
  assert.equal(runtimePath(api('/custom/node'), context), '/custom/node');
  assert.equal(runtimePath(api('node'), { extensionPath: '/extension' }), 'node');
});
