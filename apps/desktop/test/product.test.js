import test from 'node:test';
import assert from 'node:assert/strict';
import { codovynProduct, macApplicationMetadata } from '../build/product.js';

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
  assert.deepEqual(product.builtInExtensionsEnabledWithAutoUpdates, []);
  assert.equal(product.defaultChatAgent.extensionId, '');
  assert.deepEqual(product.defaultChatAgent.providerScopes, []);
  assert.equal(product.defaultChatAgent.entitlementUrl, undefined);
  assert.equal(product.licenseFileName, 'LICENSE.txt');
  assert.equal(product.codovyn.upstreamCommit, 'abc');
  assert.equal(upstream.nameShort, 'VSCodium');
  assert.throws(() => codovynProduct({ extensionsGallery: { serviceUrl: 'https://marketplace.visualstudio.com' } }), /Open VSX/);
});


test('native app metadata identifies the alpha while retaining document associations and notices', () => {
  const upstream = { CFBundleName: 'VSCodium', CFBundleExecutable: 'VSCodium',
    CFBundleShortVersionString: '1.140', NSHumanReadableCopyright: 'Upstream authors',
    CFBundleDocumentTypes: [{ CFBundleTypeName: 'Source file' }],
    CFBundleURLTypes: [{ CFBundleURLSchemes: ['vscodium'] }] };
  const result = macApplicationMetadata(upstream);
  assert.equal(result.CFBundleIdentifier, 'org.codovyn.desktop');
  assert.equal(result.CFBundleShortVersionString, '0.1.0');
  assert.equal(result.CFBundleExecutable, 'CODOVYN');
  assert.deepEqual(result.CFBundleURLTypes[0].CFBundleURLSchemes, ['codovyn']);
  assert.deepEqual(result.CFBundleDocumentTypes, upstream.CFBundleDocumentTypes);
  assert.equal(result.NSHumanReadableCopyright, 'Upstream authors');
  assert.equal(upstream.CFBundleName, 'VSCodium');
});
