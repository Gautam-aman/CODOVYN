import { readFile, writeFile, mkdir, mkdtemp, cp, rename, rm, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { obtainArtifact } from './artifacts.js';
import { workbenchThemes } from './themes.js';
import { codovynProduct, desktopIdentity, macApplicationMetadata } from './product.js';

if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('Only macOS arm64 is currently validated for assembly');
const root = resolve(import.meta.dirname, '../../..');
const manifest = JSON.parse(await readFile(join(root, 'apps/desktop/artifacts.json')));
const cache = process.env.CODOVYN_ARTIFACT_CACHE || join(homedir(), 'Library/Caches/CODOVYN/build');
const artifacts = manifest.targets['darwin-arm64'];
const editor = await obtainArtifact(artifacts.editor, cache);
const runtime = await obtainArtifact(artifacts.runtime, cache);
const output = join(root, 'dist/desktop');
await mkdir(output, { recursive: true });
const stage = await mkdtemp(join(output, '.assembly-'));
const run = (command, args) => execFileSync(command, args, { stdio: 'inherit' });
try {
  run('/usr/bin/ditto', ['-x', '-k', editor, stage]);
  const app = join(stage, 'CODOVYN.app');
  await rename(join(stage, 'VSCodium.app'), app);
  const resources = join(app, 'Contents/Resources');
  const editorRoot = join(resources, 'app');
  const productPath = join(editorRoot, 'product.json');
  await writeFile(productPath, JSON.stringify(codovynProduct(JSON.parse(await readFile(productPath))), null, 2));
  run('/usr/bin/tar', ['-xzf', runtime, '-C', stage]);
  await rename(join(stage, `node-v${manifest.nodeVersion}-darwin-arm64`), join(resources, 'runtime'));
  const upstreamCli = join(editorRoot, 'bin/codium');
  await writeFile(join(editorRoot, 'bin/codovyn'), (await readFile(upstreamCli, 'utf8')).replaceAll('VSCodium', 'CODOVYN').replaceAll("'codium'", "'codovyn'"), { mode: 0o755 });
  await rm(upstreamCli);
  const integration = join(editorRoot, 'extensions/codovyn');
  await mkdir(integration, { recursive: true });
  for (const path of ['apps/cli', 'apps/vscode-extension', 'packages']) {
    await cp(join(root, path), join(integration, path), { recursive: true,
      filter: (source) => !/(?:^|\/)(?:node_modules|test|tests|host)(?:\/|$)/.test(source) });
  }
  const extension = JSON.parse(await readFile(join(root, 'package.json')));
  delete extension.scripts; delete extension.devDependencies; delete extension.workspaces;
  extension.codovynBundledRuntime = '../../../runtime/bin/node';
  await writeFile(join(integration, 'package.json'), JSON.stringify(extension, null, 2));
  for (const name of ['LICENSE', 'README.md']) await cp(join(root, name), join(integration, name));
  await cp(join(root, 'apps/desktop/integration'), join(editorRoot, 'extensions/codovyn-desktop'), { recursive: true });
  const desktopExtension = join(editorRoot, 'extensions/codovyn-desktop');
  const desktopManifest = JSON.parse(await readFile(join(desktopExtension, 'package.json')));
  await mkdir(join(desktopExtension, 'themes'));
  desktopManifest.contributes.themes = [];
  for (const theme of workbenchThemes()) {
    const path = `themes/${theme.id}.json`;
    await writeFile(join(desktopExtension, path), JSON.stringify(theme.document, null, 2));
    desktopManifest.contributes.themes.push({ label: theme.name, uiTheme: theme.uiTheme, path });
  }
  await writeFile(join(desktopExtension, 'package.json'), JSON.stringify(desktopManifest, null, 2));
  const iconset = join(stage, 'CODOVYN.iconset');
  run('/usr/bin/swift', [join(root, 'apps/desktop/build/icon.swift'), iconset]);
  run('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', join(resources, 'CODOVYN.icns')]);
  const plistPath = join(app, 'Contents/Info.plist');
  const plist = JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', plistPath], { encoding: 'utf8' }));
  const originalExecutable = plist.CFBundleExecutable;
  await writeFile(plistPath, JSON.stringify(macApplicationMetadata(plist)));
  run('/usr/bin/plutil', ['-convert', 'xml1', plistPath]);
  await rename(join(app, 'Contents/MacOS', originalExecutable), join(app, 'Contents/MacOS/CODOVYN'));
  const frameworks = join(app, 'Contents/Frameworks');
  for (const helper of (await readdir(frameworks)).filter((name) => name.startsWith('VSCodium Helper') && name.endsWith('.app'))) {
    const helperRoot = join(frameworks, helper);
    const helperPlist = join(helperRoot, 'Contents/Info.plist');
    const metadata = JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', helperPlist], { encoding: 'utf8' }));
    const oldName = helper.slice(0, -4);
    const newName = oldName.replace('VSCodium', 'CODOVYN');
    metadata.CFBundleName = newName;
    metadata.CFBundleIdentifier = metadata.CFBundleIdentifier.replace('com.vscodium', desktopIdentity.bundleId);
    if (metadata.CFBundleExecutable) metadata.CFBundleExecutable = newName;
    await writeFile(helperPlist, JSON.stringify(metadata));
    run('/usr/bin/plutil', ['-convert', 'xml1', helperPlist]);
    await rename(join(helperRoot, 'Contents/MacOS', oldName), join(helperRoot, 'Contents/MacOS', newName));
    await rename(helperRoot, join(frameworks, `${newName}.app`));
  }
  await writeFile(join(resources, 'codovyn-build.json'), JSON.stringify({ identity: desktopIdentity,
    artifacts, sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    sourceDirty: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim().length > 0,
    signing: 'ad-hoc-development', platform: 'darwin-arm64' }, null, 2));
  // Preserve the upstream Electron entitlements required for JIT and child runtimes.
  const entitlements = execFileSync('/usr/bin/codesign', ['-d', '--entitlements', ':-', app], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const entitlementPath = join(stage, 'entitlements.plist');
  await writeFile(entitlementPath, entitlements);
  run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', '--entitlements', entitlementPath, app]);
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
  const destination = join(output, 'CODOVYN.app');
  // Only replace this script's managed build output, never a user's installed app.
  await rm(destination, { recursive: true, force: true });
  await rename(app, destination);
  console.log(`Development application: ${destination}`);
} finally { await rm(stage, { recursive: true, force: true }); }
