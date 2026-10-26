export const desktopIdentity = Object.freeze({
  name: 'CODOVYN', bundleId: 'org.codovyn.desktop', applicationName: 'codovyn',
  repository: 'https://github.com/Gautam-aman/CODOVYN', version: '0.1.0-alpha',
});

/** Product identity and service policy, without replacing upstream license notices. */
export function codovynProduct(upstream) {
  const product = structuredClone(upstream);
  for (const key of ['updateUrl', 'defaultChatAgent', 'voiceWsUrl', 'tunnelApplicationConfig',
    'serverDownloadUrlTemplate', 'webviewContentExternalBaseUrlTemplate',
    'builtInExtensionsEnabledWithAutoUpdates', 'onboardingThemes', 'onboardingKeymaps', 'twitterUrl']) delete product[key];
  const repo = desktopIdentity.repository;
  Object.assign(product, {
    nameShort: 'CODOVYN', nameLong: 'CODOVYN Desktop', applicationName: 'codovyn',
    dataFolderName: '.codovyn-desktop', sharedDataFolderName: '.codovyn-desktop-shared',
    serverApplicationName: 'codovyn-server', serverDataFolderName: '.codovyn-server',
    tunnelApplicationName: 'codovyn-tunnel', urlProtocol: 'codovyn',
    darwinBundleIdentifier: desktopIdentity.bundleId,
    darwinProfileUUID: 'AB04309D-8215-4C19-B48A-2EC192F13106',
    darwinProfilePayloadUUID: '36932548-2188-4BE6-8869-1B37637B70AF',
    linuxDesktopName: 'org.codovyn.desktop', linuxIconName: 'codovyn',
    win32MutexName: 'codovyn', win32DirName: 'CODOVYN', win32NameVersion: 'CODOVYN',
    win32RegValueName: 'CODOVYN', win32AppUserModelId: 'CODOVYN.Desktop', win32ShellNameShort: 'CODOVYN',
    win32TunnelServiceMutex: 'codovyn-tunnelservice', win32TunnelMutex: 'codovyn-tunnel',
    reportIssueUrl: `${repo}/issues/new`, requestFeatureUrl: `${repo}/issues/new`,
    documentationUrl: `${repo}/blob/main/README.md`, releaseNotesUrl: `${repo}/blob/main/CHANGELOG.md`,
    downloadUrl: repo, introductoryVideosUrl: `${repo}/blob/main/README.md`,
    tipsAndTricksUrl: `${repo}/tree/main/docs`, checksumFailMoreInfoUrl: `${repo}/blob/main/SECURITY.md`,
    trustedExtensionAuthAccess: {}, builtInExtensionsEnabledWithAutoUpdates: [],
    // Code-OSS 1.140 initializes account services unconditionally. Keep its required
    // shape inert instead of retaining Copilot IDs, endpoints or authentication.
    defaultChatAgent: { extensionId: '', chatExtensionId: '', completionsAdvancedSetting: 'codovyn.disabled',
      provider: { default: { id: '', name: '' }, enterprise: { id: '', name: '' } }, providerScopes: [] },
  });
  for (const key of ['keyboardShortcutsUrlLinux', 'keyboardShortcutsUrlMac', 'keyboardShortcutsUrlWin']) {
    product[key] = `${repo}/tree/main/docs`;
  }
  const ids = ['win32x64AppId', 'win32arm64AppId', 'win32x64UserAppId', 'win32arm64UserAppId', 'win32AppId', 'win32UserAppId'];
  ids.forEach((key, index) => { product[key] = `{{749E06E${index}-8533-4B85-B811-10939358BE25}`; });
  product.win32ContextMenu = { x64: { clsid: '749E06EF-8533-4B85-B811-10939358BE25' } };
  if (product.extensionsGallery?.serviceUrl && new URL(product.extensionsGallery.serviceUrl).hostname !== 'open-vsx.org') {
    throw new Error('Desktop builds must use the Open VSX gallery');
  }
  product.codovyn = { version: desktopIdentity.version, upstreamVersion: upstream.version,
    upstreamCommit: upstream.commit, distribution: 'development', autoUpdates: false };
  return product;
}

export function minimumMacOS(editor,runtime){const parse=x=>{if(typeof x!=='string'||!/^\d{1,3}(?:[.]\d{1,3}){1,2}$/.test(x))throw new Error('Invalid Mach-O minimum macOS version');return x.split('.').map(Number);};const a=parse(editor),b=parse(runtime);for(let i=0;i<3;i++){if((a[i]||0)>(b[i]||0))return editor;if((a[i]||0)<(b[i]||0))return runtime;}return editor;}
export function macApplicationMetadata(upstream,runtimeMinimum='13.5') {
  return { ...structuredClone(upstream), CFBundleName: desktopIdentity.name,
    CFBundleDisplayName: desktopIdentity.name, CFBundleIdentifier: desktopIdentity.bundleId,
    CFBundleExecutable: desktopIdentity.name, CFBundleIconFile: 'CODOVYN.icns',
    CFBundleShortVersionString: desktopIdentity.version.split('-')[0], CFBundleVersion: '2',
    LSMinimumSystemVersion: minimumMacOS(upstream.LSMinimumSystemVersion||runtimeMinimum,runtimeMinimum),
    CFBundleURLTypes: [{ CFBundleURLName: desktopIdentity.name, CFBundleURLSchemes: ['codovyn'] }] };
}
