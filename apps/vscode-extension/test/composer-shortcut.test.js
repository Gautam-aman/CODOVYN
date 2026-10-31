import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Only model the DOM operations needed to construct the composer. Menus and
// model discovery are covered separately and do not affect the shortcut hint.
class Element {
  children = [];
  attributes = new Map();
  classList = { add() {} };
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener() {}
  remove() {}
}

function renderComposer(navigator) {
  const composer = new Element();
  composer.querySelector = () => new Element();
  const request = new Element();
  request.closest = () => composer;
  request.setAttribute('aria-describedby', 'existing-help');
  const run = new Element();
  const sandbox = {
    navigator,
    vscode: {},
    document: { createElement: () => new Element() },
  };
  vm.runInNewContext(readFileSync(new URL('../media/composer.js', import.meta.url), 'utf8') + '\nthis.Composer = CodovynComposer;', sandbox);
  sandbox.Composer.prototype.menu = () => new Element();
  sandbox.Composer.prototype.resize = () => {};
  sandbox.Composer.prototype.refresh = () => {};
  new sandbox.Composer({ request, run, cancel: new Element(), controls: { permission: Object.assign(new Element(), { value: 'read' }) } });
  return { composer, request, run };
}

for (const [platform, shortcut] of [['MacIntel', 'Command+Enter'], ['Win32', 'Control+Enter'], ['Linux x86_64', 'Control+Enter']]) {
  test(`composer exposes the ${platform} shortcut as a textarea description`, () => {
    const { composer, request, run } = renderComposer({ platform });
    const hint = composer.children.find(child => child.id === 'composer-shortcut-hint');
    assert.ok(hint, 'Hint remains in the composer beside its controls');
    assert.equal(hint.textContent, `Enter or ${shortcut} to send · Shift+Enter for a new line`);
    assert.equal(request.getAttribute('aria-describedby'), 'existing-help composer-shortcut-hint');
    assert.equal(run.getAttribute('aria-label'), 'Send message');
  });
}

test('composer prefers browser platform metadata when available', () => {
  const { composer } = renderComposer({ platform: 'Linux', userAgentData: { platform: 'macOS' } });
  assert.match(composer.children.find(child => child.id === 'composer-shortcut-hint').textContent, /Command\+Enter/);
});
