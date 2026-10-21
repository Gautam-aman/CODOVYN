import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workbenchThemes } from '../build/themes.js';
test('all ten existing palettes style the workbench, editor, terminal and syntax', () => {
  const themes = workbenchThemes();
  assert.equal(themes.length, 10);
  assert.equal(new Set(themes.map(t => t.id)).size, 10);
  for (const theme of themes) {
    assert.ok(theme.document.colors['terminal.background']);
    assert.ok(theme.document.colors['sideBar.foreground']);
    assert.ok(theme.document.tokenColors.length > 0);
  }
  assert.equal(themes.find(t => t.id === 'high-contrast').uiTheme, 'hc-black');
  assert.equal(themes.find(t => t.id === 'warm-paper').uiTheme, 'vs');
});
