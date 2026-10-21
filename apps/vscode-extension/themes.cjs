// Every palette uses this token order; contrast tests validate each text/control pair.
const keys = ['background', 'surface', 'foreground', 'muted', 'border', 'accent', 'accentText', 'hover', 'error', 'link'];
const presets = [
  ['midnight', 'Midnight', 'dark', ['#101522', '#1b2437', '#e7edf8', '#a6b3cc', '#64748b', '#8bb8ff', '#101522', '#b0ceff', '#ff9caa', '#9cc7ff']],
  ['graphite', 'Graphite', 'dark', ['#17191c', '#24272c', '#f0f1f3', '#b4b8c0', '#737a86', '#d2d8e3', '#17191c', '#e9edf4', '#ffabab', '#adc9ff']],
  ['light', 'Light', 'light', ['#f7f9fc', '#ffffff', '#1c2537', '#526176', '#7b889c', '#2358ad', '#ffffff', '#19488f', '#b42339', '#1758ae']],
  ['warm-paper', 'Warm Paper', 'light', ['#f6f0e5', '#fffaf0', '#352d25', '#6a5b49', '#94816d', '#805124', '#fffaf0', '#68401d', '#a32939', '#285d86']],
  ['aurora', 'Aurora', 'dark', ['#14152b', '#222340', '#f0edff', '#b5b2d3', '#76739d', '#bba8ff', '#14152b', '#d0c2ff', '#ffadc5', '#8ee4db']],
  ['sakura', 'Sakura', 'light', ['#fff5f8', '#fffafe', '#442b38', '#775768', '#ab8198', '#a63267', '#ffffff', '#872451', '#ab2446', '#864ba6']],
  ['ocean', 'Ocean', 'dark', ['#0c1c2a', '#142e41', '#e1f3fb', '#9fc2d7', '#537f9c', '#72cdec', '#0c1c2a', '#9bddf4', '#ffaab6', '#8ed9f4']],
  ['forest', 'Forest', 'dark', ['#111f19', '#1c3328', '#e8f4e9', '#abc5af', '#608c6b', '#a3d59a', '#111f19', '#c0e4b9', '#ffb2b2', '#9cdbc5']],
  ['nord', 'Nord', 'dark', ['#242c3a', '#303c4e', '#eceff4', '#b5c0d1', '#7a8da6', '#88c0d0', '#242c3a', '#a7d5df', '#f3a6ad', '#9ac4ef']],
  ['high-contrast', 'High Contrast', 'dark', ['#000000', '#101010', '#ffffff', '#e0e0e0', '#ffffff', '#ffff00', '#000000', '#fff6a0', '#ff9d9d', '#8cddff']],
];

const themes = Object.freeze(presets.map(([id, name, kind, values]) => Object.freeze({
  id, name: `CODOVYN ${name}`, kind,
  colors: Object.freeze(Object.fromEntries(keys.map((key, index) => [key, values[index]]))),
})));

function validTheme(id) { return id === 'inherit' || themes.some((theme) => theme.id === id); }

function themeStyles() {
  return themes.map(({ id, kind, colors: c }) => {
    const tokens = {
      'editor-background': c.background, 'editor-foreground': c.foreground,
      'input-background': c.surface, 'input-foreground': c.foreground, 'input-border': c.border,
      'panel-border': c.border, descriptionForeground: c.muted,
      'button-background': c.accent, 'button-foreground': c.accentText, 'button-hoverBackground': c.hover,
      'button-secondaryBackground': c.surface, 'button-secondaryForeground': c.foreground,
      focusBorder: c.link, 'textLink-foreground': c.link, errorForeground: c.error,
      'textCodeBlock-background': c.surface, 'list-inactiveSelectionBackground': c.surface,
      'list-hoverBackground': c.surface,
    };
    return `[data-codovyn-theme="${id}"]{color-scheme:${kind};${Object.entries(tokens)
      .map(([key, value]) => `--vscode-${key}:${value}`).join(';')}}`;
  }).join('\n');
}

module.exports = { themes, validTheme, themeStyles };
