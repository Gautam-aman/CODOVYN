import { createRequire } from 'node:module';
const { themes } = createRequire(import.meta.url)('../../vscode-extension/themes.cjs');

export function workbenchThemes() {
  return themes.map(({ id, name, kind, colors: c }) => ({ id, name,
    uiTheme: id === 'high-contrast' ? 'hc-black' : kind === 'light' ? 'vs' : 'vs-dark',
    document: { name, type: kind, colors: {
      foreground: c.foreground, descriptionForeground: c.muted, focusBorder: c.link,
      errorForeground: c.error, 'editor.background': c.background, 'editor.foreground': c.foreground,
      'sideBar.background': c.surface, 'sideBar.foreground': c.foreground,
      'activityBar.background': c.background, 'activityBar.foreground': c.accent,
      'titleBar.activeBackground': c.background, 'titleBar.activeForeground': c.foreground,
      'statusBar.background': c.surface, 'statusBar.foreground': c.foreground,
      'panel.background': c.background, 'panel.border': c.border,
      'terminal.background': c.background, 'terminal.foreground': c.foreground,
      'editorGroupHeader.tabsBackground': c.surface, 'tab.activeBackground': c.background,
      'tab.inactiveBackground': c.surface, 'tab.activeForeground': c.foreground,
      'input.background': c.surface, 'input.foreground': c.foreground, 'input.border': c.border,
      'button.background': c.accent, 'button.foreground': c.accentText, 'button.hoverBackground': c.hover,
      'list.activeSelectionBackground': c.accent, 'list.activeSelectionForeground': c.accentText,
      'list.hoverBackground': c.surface, 'list.focusOutline': c.link,
      'textLink.foreground': c.link, 'editorCursor.foreground': c.accent,
      'editorLineNumber.foreground': c.muted, 'editorError.foreground': c.error,
      'dropdown.background': c.surface, 'dropdown.foreground': c.foreground,
      'notifications.background': c.surface, 'notifications.foreground': c.foreground,
      ...(id === 'high-contrast' ? { contrastBorder: c.border, contrastActiveBorder: c.accent } : {}),
    }, tokenColors: [
      { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: c.muted } },
      { scope: ['keyword', 'storage.type'], settings: { foreground: c.accent } },
      { scope: ['string', 'entity.name.function'], settings: { foreground: c.link } },
      { scope: ['constant.numeric', 'constant.language'], settings: { foreground: c.foreground } },
    ] },
  }));
}
