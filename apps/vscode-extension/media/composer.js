/* Compact composer. Provider content is always rendered as text. */
class CodovynComposer {
  constructor({ request, run, cancel, controls, getModels, changed, settings, manageModels, setup }) {
    Object.assign(this, { request, run, cancel, controls, getModels, changed });
    this.intent = controls.permission.value === 'read-write' ? 'agent' : 'ask';
    this.providers = [];
    this.efforts = {};
    this.effortLabels = { '': 'Auto', none: 'None', minimal: 'Minimal', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra High', max: 'Max', ultra: 'Ultra' };
    const stored = vscode.getState?.()?.modelPicker;
    this.favorites = Array.isArray(stored?.favorites) ? stored.favorites.filter(x => typeof x === 'string').slice(0, 32) : [];
    this.recent = Array.isArray(stored?.recent) ? stored.recent.filter(x => typeof x === 'string').slice(0, 8) : [];
    const composer = request.closest('.composer');
    composer.classList.add('compact-composer');
    composer.querySelector('label[for="request"]').classList.add('sr-only');
    request.placeholder = 'Ask CODOVYN anything…'; request.rows = 2;
    request.setAttribute('aria-label', 'Message CODOVYN');
    const toolbar = document.createElement('div'); toolbar.className = 'composer-toolbar';
    const chip = (id, label, action) => {
      const button = document.createElement('button'); button.id = id; button.type = 'button';
      button.className = 'composer-chip'; button.textContent = label; button.addEventListener('click', action); return button;
    };
    this.modelChip = chip('model-chip', 'Auto ⌄', () => this.openModels());
    this.effortChip = chip('effort-chip', 'Effort · Auto ⌄', () => this.openEfforts());
    this.effortMenu = this.menu('effort-picker', 'Reasoning effort', this.effortChip);
    this.effortNotice = document.createElement('p'); this.effortNotice.className = 'queue-help';
    this.effortChoices = document.createElement('div'); this.effortMenu.append(this.effortNotice, this.effortChoices);
    this.modeChip = chip('mode-chip', 'Ask ⌄', () => this.openModes());
    const gear = chip('composer-settings', '⚙', settings); gear.setAttribute('aria-label', 'Advanced task settings');
    this.modelMenu = this.menu('model-picker', 'Choose model', this.modelChip);
    this.search = document.createElement('input'); this.search.type = 'search'; this.search.placeholder = 'Search models…';
    this.search.maxLength = 128; this.search.setAttribute('aria-label', 'Search models');
    this.results = document.createElement('div'); this.results.className = 'model-results';
    this.results.setAttribute('role', 'group'); this.results.setAttribute('aria-label', 'Models');
    const manage = chip('manage-models', 'Manage models…', () => { this.close(this.modelMenu); manageModels(); });
    const providerSetup = chip('provider-setup', 'Manage Providers…', () => { this.close(this.modelMenu); setup(); });
    const refresh = chip('refresh-provider-models', 'Refresh models', () => { const provider=this.controls.provider.value; if(['codex','opencode'].includes(provider))vscode.postMessage({type:'provider-models',provider,refresh:true,...(this.controls.model.value?{modelId:this.controls.model.value}:{})}); else vscode.postMessage({type:'agent-diagnostics'}); });
    this.modelMenu.append(this.search, this.results, refresh, manage, providerSetup);
    this.search.addEventListener('input', () => this.renderModels());
    this.modeMenu = this.menu('mode-picker', 'Task mode', this.modeChip);
    for (const [intent, label, help] of [['ask', 'Ask', 'Read and explain. No file writes.'], ['agent', 'Agent', 'Propose edits in an isolated, reviewed draft.'], ['plan', 'Plan', 'Plan the work with file writes disabled.']]) {
      const button = chip(`mode-${intent}`, label, () => { this.setIntent(intent); changed(); this.close(this.modeMenu); });
      const detail = document.createElement('small'); detail.textContent = help; button.append(detail); this.modeMenu.append(button);
    }
    run.textContent = '↑'; run.title = 'Send · Enter (Shift+Enter for a new line)'; run.setAttribute('aria-label', 'Send message');
    cancel.textContent = '■'; cancel.title = 'Stop active task'; cancel.setAttribute('aria-label', 'Stop active task');
    toolbar.append(this.modelChip, this.effortChip, this.modeChip, gear, run, cancel);
    composer.querySelector('.actions').remove(); composer.append(toolbar);
    request.addEventListener('input', () => this.resize());
    for (const control of Object.values(controls)) control.addEventListener('change', () => {
      if (control === controls.permission) this.setIntent(control.value === 'read-write' ? 'agent' : 'ask');
      this.refresh();
    });
    this.resize(); this.refresh();
  }
  menu(id, label, trigger) {
    const menu = document.createElement('div'); menu.id = id; menu.className = 'composer-popover';
    menu.setAttribute('popover', 'auto'); menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-label', label);
    const heading = document.createElement('strong'); heading.className = 'popover-heading'; heading.textContent = label; menu.append(heading);
    document.body.append(menu); trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-controls', id);
    menu.addEventListener('toggle', event => { trigger.setAttribute('aria-expanded', String(event.newState === 'open')); });
    menu.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); this.close(menu); return; }
      const buttons = [...menu.querySelectorAll('button[data-choice]:not(:disabled)')];
      const current = buttons.indexOf(document.activeElement);
      let index;
      if (event.key === 'ArrowDown') index = (current + 1) % buttons.length;
      else if (event.key === 'ArrowUp') index = current <= 0 ? buttons.length - 1 : current - 1;
      else if (event.key === 'Home' && document.activeElement.tagName !== 'INPUT') index = 0;
      else if (event.key === 'End' && document.activeElement.tagName !== 'INPUT') index = buttons.length - 1;
      if (index !== undefined && buttons[index]) { event.preventDefault(); buttons[index].focus(); }
    });
    menu.trigger = trigger;
    return menu;
  }
  open(menu) {
    const box = menu.trigger.getBoundingClientRect();
    const width = Math.min(340, Math.max(200, innerWidth - 24));
    menu.style.width = `${width}px`; menu.style.left = `${Math.max(12, Math.min(box.left, innerWidth - width - 12))}px`;
    menu.style.maxHeight = `${Math.max(120, innerHeight - 32)}px`;
    menu.showPopover();
    const height = menu.getBoundingClientRect().height;
    menu.style.top = `${Math.max(12, Math.min(box.top - height - 8, innerHeight - height - 12))}px`;
    (menu.querySelector('input') || menu.querySelector('button'))?.focus();
  }
  close(menu) { menu.hidePopover(); menu.trigger.focus({ preventScroll: true }); }
  openModels() { if (!this.discoveryRequested) { this.discoveryRequested = true; vscode.postMessage({ type: 'agent-diagnostics' }); } this.search.value = ''; this.renderModels(); this.open(this.modelMenu); }
  rememberEffort() {
    this.efforts = Object.fromEntries([...Object.entries(this.efforts).filter(([key]) => key !== this.selectedKey()), [this.selectedKey(), this.controls.reasoning.value || null]].slice(-32));
  }
  openEfforts() {
    this.effortChoices.replaceChildren();
    this.effortNotice.textContent = this.controls.reasoning.title;
    for (const option of this.controls.reasoning.options) {
      if (option.disabled) continue;
      const button = document.createElement('button'); button.type = 'button'; button.dataset.choice = option.value || 'auto';
      button.textContent = option.value ? (this.effortLabels[option.value] || option.value) : 'Auto / Default';
      button.setAttribute('aria-pressed', String(this.controls.reasoning.value === option.value));
      button.title = option.value ? `Send ${option.value} to the selected adapter for the next task` : 'Omit the override and preserve the provider configuration';
      button.addEventListener('click', () => { this.controls.reasoning.value = option.value; this.rememberEffort(); this.controls.reasoning.dispatchEvent(new Event('change')); this.refresh(); this.changed(); this.close(this.effortMenu); });
      this.effortChoices.append(button);
    }
    this.open(this.effortMenu);
  }
  openModes() {
    for (const button of this.modeMenu.querySelectorAll('button')) { button.dataset.choice = ''; button.setAttribute('aria-pressed', String(button.id === `mode-${this.intent}`)); }
    this.open(this.modeMenu);
  }
  setIntent(intent) {
    this.intent = ['ask', 'agent', 'plan'].includes(intent) ? intent : 'ask';
    this.controls.permission.value = this.intent === 'agent' ? 'read-write' : 'read';
    this.modeChip.textContent = `${this.intent[0].toUpperCase() + this.intent.slice(1)} ⌄`;
  }
  setProviders(providers) { this.providers = providers; this.refresh(); }
  entries() {
    const defaults = ['codex', 'opencode', 'gemini', 'claude'].map(provider => {
      const state = this.providers.find(entry => entry.id === provider);
      return { key: `default:${provider}`, provider, label: `${provider === 'codex' ? 'Codex' : provider === 'gemini' ? 'Gemini' : provider === 'opencode' ? 'OpenCode' : 'Claude'} · Provider Default`,
        detail: state?.executionSupported === false ? state.diagnostic || 'Execution blocked by the verified process boundary' : state?.installation === 'detected' ? 'CLI detected · Authentication unknown' : state ? 'CLI setup required' : 'Installation and authentication unverified',
        disabled: state && (state.installation !== 'detected' || state.executionSupported === false) };
    });
    return [{ key: 'auto', label: 'Auto · Smart Routing', detail: 'Uses your configured routing policy', provider: 'auto' }, ...defaults,
      ...this.getModels().filter(model => model && ['codex', 'gemini', 'claude','opencode'].includes(model.provider)).map(model => ({
        key: `model:${model.id}`, provider: model.provider, id: model.id, label: model.model,
        detail: model.provider === 'claude' ? 'Model override unsupported by this adapter' : `${model.source==='discovered'?'Discovered catalogue':'Configured model'} · ${model.availability === 'unavailable' ? 'Unavailable' : 'Access unverified'}`,
        disabled: model.availability === 'unavailable' || model.provider === 'claude' || this.providers?.some(state => state.id === model.provider && state.executionSupported === false),
      }))];
  }
  renderModels() {
    const query = this.search.value.trim().toLowerCase(); this.results.replaceChildren();
    const entries = this.entries().filter(entry => `${entry.label} ${entry.provider}`.toLowerCase().includes(query));
    const shown = new Set();
    const group = (label, members) => {
      members = members.filter(entry => !shown.has(entry.key)); if (!members.length) return;
      const heading = document.createElement('p'); heading.className = 'model-group'; heading.textContent = label; this.results.append(heading);
      for (const entry of members) {
        shown.add(entry.key);
        const row = document.createElement('div'); row.className = 'model-row';
        const choose = document.createElement('button'); choose.type = 'button'; choose.dataset.choice = entry.key; choose.disabled = !!entry.disabled;
        choose.textContent = entry.label; const detail = document.createElement('small'); detail.textContent = entry.detail; choose.append(detail);
        choose.setAttribute('aria-pressed', String(entry.key === this.selectedKey()));
        choose.addEventListener('click', () => this.select(entry));
        const star = document.createElement('button'); star.type = 'button'; star.className = 'model-favorite';
        star.textContent = this.favorites.includes(entry.key) ? '★' : '☆'; star.setAttribute('aria-label', `Favorite ${entry.label}`);
        star.setAttribute('aria-pressed', String(this.favorites.includes(entry.key)));
        star.addEventListener('click', () => { this.favorites = this.favorites.includes(entry.key) ? this.favorites.filter(key => key !== entry.key) : [...this.favorites, entry.key].slice(-32); this.save(); this.renderModels(); this.search.focus(); });
        row.append(choose, star); this.results.append(row);
      }
    };
    group('Recommended', entries.filter(entry => entry.key === 'auto'));
    group('Favorites', entries.filter(entry => this.favorites.includes(entry.key)));
    group('Recent', this.recent.map(key => entries.find(entry => entry.key === key)).filter(Boolean));
    for (const provider of ['codex', 'opencode', 'gemini', 'claude']) group(provider === 'codex' ? 'Codex' : provider === 'gemini' ? 'Gemini' : provider === 'opencode' ? 'OpenCode' : 'Claude', entries.filter(entry => entry.provider === provider));
    if (!entries.length) { const empty = document.createElement('p'); empty.textContent = 'No models match. Try a provider name.'; this.results.append(empty); }
  }
  selectedKey() { return this.controls.model.value ? `model:${this.controls.model.value}` : this.controls.provider.value === 'auto' ? 'auto' : `default:${this.controls.provider.value}`; }
  select(entry) {
    if (entry.disabled) return;
    this.rememberEffort();
    this.controls.provider.value = entry.provider;
    this.controls.provider.dispatchEvent(new Event('change'));
    this.controls.model.value = entry.id || '';
    this.controls.reasoning.value = '';
    this.controls.model.dispatchEvent(new Event('change'));
    const savedEffort = this.efforts[entry.key] || '';
    if ([...this.controls.reasoning.options].some(option => option.value === savedEffort)) this.controls.reasoning.value = savedEffort;
    this.controls.reasoning.dispatchEvent(new Event('change'));
    this.recent = [entry.key, ...this.recent.filter(key => key !== entry.key)].slice(0, 8); this.save(); this.refresh(); this.close(this.modelMenu); this.changed();
  }
  save() { vscode.setState?.({ ...(vscode.getState?.() || {}), modelPicker: { favorites: this.favorites, recent: this.recent } }); this.changed(); }
  refresh() {
    this.effortChip.textContent = `${(this.controls.reasoning.value ? (this.effortLabels[this.controls.reasoning.value] || this.controls.reasoning.value) : 'Effort · Auto') || 'Auto'} ⌄`;
    this.effortChip.title = this.controls.reasoning.title || 'Reasoning effort · provider default';
    this.effortChip.setAttribute('aria-label', `Reasoning effort: ${this.effortLabels[this.controls.reasoning.value] || this.controls.reasoning.value || 'Auto'}`);
    const entry = this.entries().find(entry => entry.key === this.selectedKey());
    this.modelChip.textContent = `${entry?.label?.replace(' · Provider Default', '').replace(' · Smart Routing', '') || (this.controls.model.value ? `${this.controls.model.value} · unavailable` : 'Select model')} ⌄`; this.modelChip.title = entry?.detail || 'Model selection needs review';
  }
  resize() { this.request.style.height = 'auto'; this.request.style.height = `${Math.min(220, Math.max(72, this.request.scrollHeight))}px`; }
}

class CodovynQueue {
  constructor(composer, getConfiguration) {
    this.composer = composer; this.getConfiguration = getConfiguration; this.tasks = []; this.paused = false; this.pending = null;
    this.button = document.createElement('button'); this.button.type = 'button'; this.button.id = 'queue-chip'; this.button.className = 'composer-chip'; this.button.textContent = 'Queue';
    composer.run.before(this.button);
    this.menu = composer.menu('queue-picker', 'Task queue', this.button);
    const help = document.createElement('p'); help.className = 'queue-help'; help.textContent = 'One task at a time. Dispatch requires review; nothing restarts automatically.';
    this.message = document.createElement('p'); this.message.setAttribute('role', 'status'); this.message.className = 'queue-message';
    this.add = document.createElement('button'); this.add.id = 'queue-draft'; this.add.type = 'button'; this.add.textContent = 'Queue current draft';
    this.add.addEventListener('click', () => this.enqueue());
    this.pause = document.createElement('button'); this.pause.type = 'button'; this.pause.id = 'queue-pause';
    this.pause.addEventListener('click', () => vscode.postMessage({ type: this.paused ? 'queue-resume' : 'queue-pause' }));
    this.list = document.createElement('ol'); this.list.className = 'queue-list'; this.list.setAttribute('aria-label', 'Queued tasks');
    this.menu.append(help, this.add, this.pause, this.message, this.list);
    this.button.addEventListener('click', () => { vscode.postMessage({ type: 'queue-list' }); this.render(); composer.open(this.menu); });
    window.addEventListener('message', ({ data }) => {
      if (data?.type === 'queue-state') { this.tasks = Array.isArray(data.tasks) ? data.tasks : []; this.paused = data.paused === true; this.render(); }
      if (data?.type === 'queue-accepted' && data.requestId === this.pending?.id) {
        if (composer.request.value.trim() === this.pending.request) composer.request.value = '';
        this.pending = null; composer.resize(); this.message.textContent = 'Queued locally. Review and run when ready.'; this.add.disabled = false;
      }
      if (data?.type === 'queue-error') { this.pending = null; this.message.textContent = data.text; this.add.disabled = false; }
      if (data?.type === 'project-selected') { this.tasks = []; this.render(); vscode.postMessage({ type: 'queue-list' }); }
    });
    this.render();
  }
  enqueue() {
    if (this.pending) return;
    const request = this.composer.request.value.trim();
    if (!request) { this.message.textContent = 'Write a request in the composer first.'; return; }
    this.pending = { id: crypto.randomUUID(), request }; this.add.disabled = true; this.message.textContent = 'Saving to the local queue…';
    vscode.postMessage({ type: 'queue-add', requestId: this.pending.id, request, taskConfiguration: this.getConfiguration() });
  }
  render() {
    const tasks = this.tasks.filter(task => ['queued','starting','running','interrupted','blocked'].includes(task.status));
    const queued = tasks.filter(task => task.status === 'queued');
    this.button.textContent = tasks.length ? `Queue ${tasks.length}` : 'Queue';
    this.pause.textContent = this.paused ? 'Resume queue' : 'Pause queue'; this.pause.setAttribute('aria-pressed', String(this.paused));
    this.list.replaceChildren();
    for (const task of tasks) {
      const li = document.createElement('li'); const title = document.createElement('p'); title.textContent = task.request;
      const state = document.createElement('small'); state.textContent = `${task.configuration?.intent || task.configuration?.permission || 'Task'} · ${task.configuration?.provider || 'Unknown provider'} · ${task.status}`;
      li.append(title, state);
      const action = (label, message) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.setAttribute('aria-label', `${label}: ${task.request.slice(0, 80)}`); button.addEventListener('click', () => vscode.postMessage(message)); li.append(button); return button; };
      if (task.status === 'queued') {
        const index = queued.indexOf(task);
        if (!index) action('Review & run next', { type: 'queue-start', id: task.id }).disabled = this.paused || this.composer.run.disabled;
        if (index > 0) action('Move up', { type: 'queue-reorder', id: task.id, position: index - 1 });
        if (index < queued.length - 1) action('Move down', { type: 'queue-reorder', id: task.id, position: index + 1 });
      }
      if (['queued','blocked'].includes(task.status)) action('Cancel', { type: 'queue-cancel', id: task.id });
      if (['starting','running','interrupted'].includes(task.status)) { const warning = document.createElement('p'); warning.textContent = 'Execution ownership must be reconciled before replay. Inspect task history and recovery.'; li.append(warning); }
      this.list.append(li);
    }
    if (!tasks.length) { const empty = document.createElement('li'); empty.textContent = 'Queued requests will appear here.'; this.list.append(empty); }
  }
}
