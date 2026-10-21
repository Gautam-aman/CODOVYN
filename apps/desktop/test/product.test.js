import test from 'node:test';
import assert from 'node:assert/strict';
import { codovynProduct } from '../build/product.js';

test('desktop branding isolates storage and disables inherited proprietary services and updates', () => {
  const upstream = { nameShort: 'VSCodium', version: '1.140', commit: 'abc', updateUrl: 'https://updates.invalid',
    defaultChatAgent: { extensionId: 'private.service' }, voiceWsUrl: 'wss://voice.invalid',
    serverDownloadUrlTemplate: 'https://server.invalid', licenseName: 'MIT', licenseFileName: 'LICENSE.txt',
    extensionsGallery: { serviceUrl: 'https://open-vsx.org/vscode/gallery' } };
  const product = codovynProduct(upstream);
  assert.equal(product.nameShort, 'CODOVYN');
  assert.equal(product.darwinBundleIdentifier, 'org.codovyn.desktop');
  assert.equal(product.dataFolderName, '.codovyn-desktop');
  for (const key of ['updateUrl', 'voiceWsUrl', 'serverDownloadUrlTemplate']) assert.equal(product[key], undefined);
  assert.equal(product.defaultChatAgent.extensionId, '');
  assert.deepEqual(product.defaultChatAgent.providerScopes, []);
  assert.equal(product.defaultChatAgent.entitlementUrl, undefined);
  assert.equal(product.licenseFileName, 'LICENSE.txt');
  assert.equal(product.codovyn.upstreamCommit, 'abc');
  assert.equal(upstream.nameShort, 'VSCodium');
  assert.throws(() => codovynProduct({ extensionsGallery: { serviceUrl: 'https://marketplace.visualstudio.com' } }), /Open VSX/);
});
