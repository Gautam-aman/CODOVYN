import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { themes, validTheme } = require('../themes.cjs');
const { createExtension } = require('../extension.cjs');

function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map((value) => parseInt(value, 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

function contrast(first, second) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test('curated themes meet text and control contrast thresholds', () => {
  assert.equal(themes.length, 10);
  assert.equal(new Set(themes.map((theme) => theme.id)).size, 10);
  for (const { name, colors: c } of themes) {
    for (const value of Object.values(c)) assert.match(value, /^#[0-9a-f]{6}$/);
    for (const background of [c.background, c.surface]) {
      for (const text of [c.foreground, c.muted, c.error, c.link]) {
        assert.ok(contrast(text, background) >= 4.5, `${name}: ${text} on ${background} needs 4.5:1`);
      }
      assert.ok(contrast(c.border, background) >= 3, `${name}: control border needs 3:1`);
    }
    for (const background of [c.accent, c.hover]) {
      assert.ok(contrast(c.accentText, background) >= 4.5, `${name}: button text needs 4.5:1`);
    }
  }
});

test('theme selection persists between panels and rejects unrecognized theme data', async () => {
  let open;
  let handler;
  const sent = [];
  const state = new Map();
  const panels = [];
  const api = {
    commands: { registerCommand: (_id, callback) => { open = callback; return { dispose() {} }; } },
    window: { createWebviewPanel: () => {
      const panel = { webview: { cspSource: 'x', asWebviewUri: (uri) => uri,
        onDidReceiveMessage: (callback) => { handler = callback; }, postMessage: (message) => sent.push(message) } };
      panels.push(panel);
      return panel;
    } },
    ViewColumn: { Beside: 2 }, Uri: { joinPath: (_root, ...parts) => parts.join('/') },
    workspace: { workspaceFolders: [] },
  };
  createExtension(api).activate({ extensionUri: 'root', globalStorageUri: { fsPath: '/data' }, subscriptions: [],
    globalState: { get: (key, fallback) => state.get(key) ?? fallback, update: async (key, value) => state.set(key, value) } });
  open();
  assert.match(panels[0].webview.html, /body data-codovyn-theme="inherit"/);
  await handler({ type: 'theme-select', id: 'warm-paper' });
  assert.equal(sent.at(-1).selectedTheme, 'warm-paper');
  await handler({ type: 'theme-select', id: '</style><script>bad</script>' });
  assert.equal(validTheme('unknown'), false);
  open();
  assert.match(panels[1].webview.html, /body data-codovyn-theme="warm-paper"/);
  await handler({ type: 'theme-select', id: 'inherit' });
  open();
  assert.match(panels[2].webview.html, /body data-codovyn-theme="inherit"/);
});
