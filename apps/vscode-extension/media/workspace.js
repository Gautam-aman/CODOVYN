const vscode = acquireVsCodeApi();
const request = document.getElementById('request');
const agent = document.getElementById('agent');
const taskProvider = document.getElementById('task-provider');
const taskModel = document.getElementById('task-model');
const taskPermission = document.getElementById('task-permission');
const taskRouting = document.getElementById('task-routing');
const taskReasoning = document.getElementById('task-reasoning');
const taskControls = document.querySelector('.task-controls');
let compactComposer = null;
for (const id of ['task-provider', 'task-model', 'task-permission', 'task-routing', 'task-reasoning']) {
  const control = document.getElementById(id);
  const label = taskControls.querySelector(`label[for="${id}"]`);
  const field = document.createElement('div'); field.className = 'task-control-field';
  label.before(field); field.append(label, control);
}
const run = document.getElementById('run');
const cancel = document.getElementById('cancel');
const status = document.getElementById('status');
const timeline = document.getElementById('timeline');
let activeWorkspaceView = 'chat';
let activityFollowsLatest = true;
let unseenActivityCount = 0;
let pendingChatRequest = '';
let acceptedChatRequest = '';
let taskModelCatalogue = [];
const providerCatalogues = new Map();
const requestedCatalogues = new Set();
const allTaskModels = () => [...taskModelCatalogue,...[...providerCatalogues.values()].flatMap(metadata => metadata.models || [])];
function requestProviderModels(provider,modelId,refresh=false) {
  if(!['codex','opencode'].includes(provider))return;
  const key=provider+':'+(modelId||'');
  if(!refresh&&requestedCatalogues.has(key))return;
  requestedCatalogues.add(key);vscode.postMessage({type:'provider-models',provider,...(modelId?{modelId}:{}),refresh});
}
let codexReasoningMetadata = null;
let reasoningInspectionRequested = false;
let previousTaskProvider = null;
let taskSubmissionId = null;
let queueDispatching = false;
let chatFollowsLatest = true;
let streamedAssistantText = false;
let assistantTextLength = 0;
let chatSegmentProvider = null;
const empty = document.getElementById('empty');
const jumpToLatest = document.createElement('button');
jumpToLatest.type = 'button';
jumpToLatest.className = 'jump-to-latest';
jumpToLatest.textContent = 'Jump to latest activity';
jumpToLatest.setAttribute('aria-label', 'Jump to the latest task activity');
jumpToLatest.hidden = true;
status.after(jumpToLatest);
const isNearLatestActivity = () => timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight <= 80;
const updateLatestActivityControl = () => {
  if (activeWorkspaceView === 'activity') activityFollowsLatest = isNearLatestActivity();
  jumpToLatest.hidden = activityFollowsLatest;
};
timeline.addEventListener('scroll', updateLatestActivityControl, { passive: true });
jumpToLatest.addEventListener('click', () => {
  timeline.scrollTo({ top: timeline.scrollHeight,
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
});
const tasks = document.getElementById('tasks');
const refresh = document.getElementById('refresh');
const taskFilters = document.createElement('div');
taskFilters.className = 'task-filters';
const taskSearchLabel = document.createElement('label');
taskSearchLabel.htmlFor = 'task-search';
taskSearchLabel.textContent = 'Search recent tasks';
const taskSearch = document.createElement('input');
taskSearch.id = 'task-search';
taskSearch.type = 'search';
taskSearch.maxLength = 256;
taskSearch.setAttribute('aria-describedby', 'task-history-note');
taskSearchLabel.append(taskSearch);
const taskStatusLabel = document.createElement('label');
taskStatusLabel.htmlFor = 'task-status-filter';
taskStatusLabel.textContent = 'Filter by status';
const taskStatusFilter = document.createElement('select');
taskStatusFilter.id = 'task-status-filter';
for (const value of ['all', 'pending', 'running', 'interrupted', 'completed', 'failed', 'cancelled']) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = value === 'all' ? 'All statuses' : value[0].toUpperCase() + value.slice(1);
  taskStatusFilter.append(option);
}
taskStatusLabel.append(taskStatusFilter);
const taskHistoryNote = document.createElement('p');
taskHistoryNote.id = 'task-history-note';
taskHistoryNote.textContent = 'Searches the 25 most recent tasks returned by the local journal for this project.';
const taskHistoryCount = document.createElement('p');
taskHistoryCount.className = 'task-history-count';
taskHistoryCount.setAttribute('role', 'status');
taskHistoryCount.setAttribute('aria-live', 'polite');
taskFilters.append(taskSearchLabel, taskStatusLabel, taskHistoryNote, taskHistoryCount);
tasks.before(taskFilters);
let recentTasks = [];
const diffOutput = document.getElementById('diff-output');
const appearance = document.createElement('details');
appearance.className = 'appearance';
const appearanceSummary = document.createElement('summary');
appearanceSummary.textContent = 'Appearance';
const themeHelp = document.createElement('p');
themeHelp.textContent = 'Preview on hover or focus. Select a theme to save it. Follow VS Code keeps your editor’s theme and system preferences.';
const themeGrid = document.createElement('div');
themeGrid.className = 'theme-grid';
themeGrid.setAttribute('role', 'group');
themeGrid.setAttribute('aria-label', 'Panel theme');
const themeStatus = document.createElement('p');
themeStatus.setAttribute('role', 'status');
themeStatus.setAttribute('aria-live', 'polite');
appearance.append(appearanceSummary, themeHelp, themeGrid, themeStatus);
document.querySelector('footer').before(appearance);
let savedTheme = 'inherit';

function renderThemes(data) {
  savedTheme = data.selectedTheme || 'inherit';
  document.body.dataset.codovynTheme = savedTheme;
  themeStatus.textContent = data.text || '';
  if (themeGrid.childElementCount) {
    for (const button of themeGrid.children) button.setAttribute('aria-pressed', String(button.dataset.themeId === savedTheme));
    return;
  }
  themeGrid.replaceChildren();
  for (const entry of [{ id: 'inherit', name: 'Follow VS Code', kind: 'Automatic' }, ...(data.themes || [])]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'theme-card';
    button.dataset.themeId = entry.id;
    button.setAttribute('aria-pressed', String(savedTheme === entry.id));
    button.setAttribute('aria-label', `${entry.name}, ${entry.kind}`);
    const preview = document.createElement('span');
    preview.className = 'theme-preview';
    preview.dataset.codovynTheme = entry.id;
    preview.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < 3; index++) preview.append(document.createElement('i'));
    const label = document.createElement('span');
    label.textContent = entry.name.replace('CODOVYN ', '');
    button.append(preview, label);
    button.addEventListener('pointerenter', () => { document.body.dataset.codovynTheme = entry.id; });
    button.addEventListener('pointerleave', () => { document.body.dataset.codovynTheme = savedTheme; });
    button.addEventListener('focus', () => { document.body.dataset.codovynTheme = entry.id; });
    button.addEventListener('blur', () => { document.body.dataset.codovynTheme = savedTheme; });
    button.addEventListener('click', () => vscode.postMessage({ type: 'theme-select', id: entry.id }));
    themeGrid.append(button);
  }
}
const projectLabel = document.createElement('label');
projectLabel.htmlFor = 'project';
projectLabel.textContent = 'Project';
const project = document.createElement('select');
project.id = 'project';
project.setAttribute('aria-label', 'Project folder');
document.querySelector('.composer').insertBefore(projectLabel, document.querySelector('label[for="agent"]'));
document.querySelector('.composer').insertBefore(project, document.querySelector('label[for="agent"]'));
const editOption = document.createElement('option');
editOption.value = 'codex-edit';
editOption.textContent = 'Codex CLI · edit draft';
agent.append(editOption);
for (const [value, label] of [
  ['configured', 'Project agents · read only'],
  ['routed','Model routing · read only'],
  ['routed-edit','Model routing · edit draft'],
  ['configured-edit', 'Project agents · edit draft'],
  ['gemini', 'Gemini CLI · read only (experimental)'],
  ['gemini-edit', 'Gemini CLI · edit draft (experimental)'],
  ['auto-gemini', 'Codex → Gemini · automatic read only'],
  ['auto-gemini-edit', 'Codex → Gemini · automatic draft'],
  ['claude-edit', 'Claude Code · edit draft'],
  ['auto-edit', 'Codex → Claude · edit draft'],
]) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  agent.append(option);
}

const agentSettings = document.createElement('details');
agentSettings.className = 'agent-settings';
const agentSummary = document.createElement('summary'); agentSummary.textContent = 'AI Providers and backups';
const agentHelp = document.createElement('p');
agentHelp.textContent = 'Choose Project agents above to use these preferences. Enabling automatic switching authorizes sending this task and context to the selected backup providers. No quota or connection status is inferred from installation.';
agentSettings.append(agentSummary, agentHelp);
function providerSelect(labelText, optional = false) {
  const label = document.createElement('label'); label.textContent = labelText;
  const select = document.createElement('select'); select.setAttribute('aria-label', labelText);
  for (const value of [...(optional ? [''] : []), 'codex', 'gemini', 'claude']) {
    const option = document.createElement('option'); option.value = value;
    option.textContent = value || 'None'; select.append(option);
  }
  label.append(select); agentSettings.append(label); return select;
}
const primaryProvider = providerSelect('Primary agent');
const firstBackup = providerSelect('First backup', true);
const secondBackup = providerSelect('Second backup', true);
const automaticLabel = document.createElement('label');
const automaticSwitch = document.createElement('input'); automaticSwitch.type = 'checkbox';
automaticLabel.append(automaticSwitch, ' Enable automatic switching to configured backups');
const restoreLabel=document.createElement('label');const restorePrimary=document.createElement('input');restorePrimary.type='checkbox';
restoreLabel.append(restorePrimary,' Restore primary at a verified retry boundary after recent successful-task evidence');
const prepareOpenCodeLabel=document.createElement('label');const prepareOpenCode=document.createElement('input');prepareOpenCode.type='checkbox';prepareOpenCode.id='prepare-opencode';
prepareOpenCodeLabel.append(prepareOpenCode,' Prepare OpenCode review after a confirmed Codex interruption (never auto-run)');
const modelLabel = document.createElement('label'); modelLabel.textContent = 'Gemini model (optional)';
const geminiModel = document.createElement('input'); geminiModel.type = 'text'; geminiModel.maxLength = 128;
geminiModel.placeholder = 'Use CLI default'; modelLabel.append(geminiModel);
const policySave = document.createElement('button'); policySave.type = 'button'; policySave.textContent = 'Save project agents';
const inspectAgents = document.createElement('button'); inspectAgents.type = 'button'; inspectAgents.textContent = 'Inspect installed agents';
const geminiSetup = document.createElement('button'); geminiSetup.type = 'button'; geminiSetup.textContent = 'Gemini authentication guide';
geminiSetup.addEventListener('click', () => vscode.postMessage({ type: 'gemini-setup' }));
const geminiPathSettings = document.createElement('button'); geminiPathSettings.type = 'button'; geminiPathSettings.textContent = 'Set Gemini CLI path';
geminiPathSettings.addEventListener('click', () => vscode.postMessage({ type: 'gemini-path-settings' }));
const policyStatus = document.createElement('p'); policyStatus.setAttribute('role', 'status');
let savedAgentPolicy = null;
const agentCards = document.createElement('ul'); agentCards.className = 'agent-cards'; agentCards.setAttribute('aria-label', 'Agent diagnostics');
agentSettings.append(automaticLabel, restoreLabel, prepareOpenCodeLabel, modelLabel, policySave, inspectAgents, geminiSetup, geminiPathSettings, policyStatus, agentCards);
document.querySelector('.composer').after(agentSettings);

const routingSettings = document.createElement('details');
routingSettings.className = 'agent-settings routing-settings';
const routingSummary = document.createElement('summary'); routingSummary.textContent = 'Model routing';
const routingHelp = document.createElement('p');
routingHelp.textContent = 'Models, scores, availability and prices are your local catalogue entries, not verified provider facts. Unknown availability requires explicit permission. Saved policies apply to Model routing tasks.';
const routingModeLabel = document.createElement('label'); routingModeLabel.textContent = 'Routing mode';
const routingMode = document.createElement('select');
for (const value of ['auto', 'economy', 'balanced', 'performance', 'custom']) {
  const option = document.createElement('option'); option.value = value; option.textContent = value[0].toUpperCase() + value.slice(1); routingMode.append(option);
}
routingModeLabel.append(routingMode);
const routingCustomLabel = document.createElement('label'); routingCustomLabel.textContent = 'Custom model ID (Custom mode only)';
const routingCustom = document.createElement('input'); routingCustom.type = 'text'; routingCustom.maxLength = 128; routingCustomLabel.append(routingCustom);
const routingReasoningLabel = document.createElement('label'); routingReasoningLabel.textContent = 'Required reasoning setting (optional)';
const routingReasoning = document.createElement('input'); routingReasoning.type = 'text'; routingReasoning.maxLength = 128; routingReasoningLabel.append(routingReasoning);
const unknownLabel = document.createElement('label');
const allowUnknown = document.createElement('input'); allowUnknown.type = 'checkbox';
unknownLabel.append(allowUnknown, ' Permit models with unverified availability');
const capabilityGroup = document.createElement('fieldset');
const capabilityLegend = document.createElement('legend'); capabilityLegend.textContent = 'Required task capabilities';
capabilityGroup.append(capabilityLegend);
const requiredCapabilities = new Map();
for (const name of ['streaming', 'tools', 'writes']) {
  const label = document.createElement('label');
  const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
  label.append(checkbox, ` ${name}`); capabilityGroup.append(label); requiredCapabilities.set(name, checkbox);
}
const estimateHeading = document.createElement('h3'); estimateHeading.textContent = 'Estimate and budget';
const estimateHelp = document.createElement('p');
estimateHelp.textContent = 'Token counts and USD limits are your estimates. They are local admission controls, not a hard provider billing cap. Leave a limit blank for no local limit; unknown prices fail a finite limit.';
function numericSetting(title, step = 'any') {
  const label = document.createElement('label'); label.textContent = title;
  const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.step = step;
  label.append(input); return { label, input };
}
const inputTokens = numericSetting('Estimated input tokens', '1');
const outputTokens = numericSetting('Estimated output tokens', '1');
const taskLimit = numericSetting('Per-task estimate limit (USD)');
const sessionLimit = numericSetting('Session estimate limit (USD)');
const monthLimit = numericSetting('Monthly estimate limit (USD)');
const sessionSpent = numericSetting('External session spending baseline (USD, user-maintained)');
const monthSpent = numericSetting('External monthly spending baseline (USD, user-maintained)');
const modelHeading = document.createElement('h3'); modelHeading.textContent = 'Local model catalogue';
const modelList = document.createElement('div'); modelList.className = 'routing-model-list';
const addModel = document.createElement('button'); addModel.type = 'button'; addModel.textContent = 'Add model';
const saveRouting = document.createElement('button'); saveRouting.type = 'button'; saveRouting.textContent = 'Save routing policy';
const cancelRouting = document.createElement('button'); cancelRouting.type = 'button'; cancelRouting.textContent = 'Discard unsaved edits';
const previewRouting = document.createElement('button'); previewRouting.type = 'button'; previewRouting.textContent = 'Preview saved policy';
const routingPreview = document.createElement('div'); routingPreview.className = 'routing-preview';
routingPreview.setAttribute('role', 'region'); routingPreview.setAttribute('aria-label', 'Routing decision preview');
const routingStatus = document.createElement('p'); routingStatus.setAttribute('role', 'status'); routingStatus.setAttribute('aria-live', 'polite');
let savedRoutingPolicy = {};
let routingDirty = false;
let selectedProjectRoot = null;
function updateTaskModelControls() {
  const provider = taskProvider.value;
  const selected = taskModel.value;
  const selectedSource = taskModel.selectedOptions[0]?.dataset.source;
  const matching = (provider === 'auto' ? taskModelCatalogue : allTaskModels()).filter(model => model && (provider === 'auto' || model.provider === provider));
  taskModel.replaceChildren();
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = provider === 'auto' ? 'Use routing policy' : provider === 'configured' ? 'Use configured agent preferences' : 'Provider default';
  taskModel.append(defaultOption);
  const groups = new Map();
  for (const model of matching) {
    if (!model || typeof model.id !== 'string' || typeof model.model !== 'string' || !['codex','gemini','claude','opencode'].includes(model.provider)) continue;
    let group = groups.get(model.provider);
    if (!group) { group = document.createElement('optgroup'); group.label = model.provider.toUpperCase(); groups.set(model.provider, group); taskModel.append(group); }
    const option = document.createElement('option'); option.value = model.id; if(model.source)option.dataset.source=model.source;
    option.textContent = `${model.model}${model.availability === 'unavailable' ? ' · unavailable' : model.availability === 'unknown' ? ' · availability unknown' : ''}`;
    option.disabled = model.availability === 'unavailable';
    group.append(option);
  }
  if (selected && previousTaskProvider === provider && ![...taskModel.options].some(option => option.value === selected)) {
    const missing = document.createElement('option'); missing.value = selected; if(selectedSource)missing.dataset.source=selectedSource; missing.textContent = `Unavailable selection · ${selected}`; missing.disabled = true; taskModel.append(missing);
  }
  if ([...taskModel.options].some(option => option.value === selected)) taskModel.value = selected;
  previousTaskProvider = provider;
  taskModel.disabled = provider === 'configured';
  taskRouting.disabled = provider !== 'auto';
  if (provider !== 'auto') taskRouting.value = 'manual';
  else if (taskRouting.value === 'manual') taskRouting.value = 'auto';
  updateTaskReasoning();
  updateLegacyMode();
  compactComposer?.refresh();
}
function updateTaskReasoning() {
  const selectedModel = allTaskModels().find(model => model.id === taskModel.value);
  const previous = taskReasoning.value;
  taskReasoning.replaceChildren();
  const defaultOption = document.createElement('option'); defaultOption.value = ''; defaultOption.textContent = 'Provider default'; taskReasoning.append(defaultOption);
  if (taskProvider.value === 'codex' && !taskModel.value && !reasoningInspectionRequested) {
    reasoningInspectionRequested = true; vscode.postMessage({ type: 'reasoning-capabilities' });
  }
  if(taskProvider.value === 'opencode') requestProviderModels('opencode',taskModel.value||undefined);
  const knownEfforts = ['none','minimal','low','medium','high','xhigh','max','ultra'];
  const advertised = ['codex','opencode'].includes(selectedModel?.provider) ? selectedModel.reasoning :
    taskProvider.value === 'opencode' && !taskModel.value ? providerCatalogues.get('opencode')?.models?.find(entry => entry.model === providerCatalogues.get('opencode').defaultModel)?.reasoning :
    taskProvider.value === 'codex' && !taskModel.value ? codexReasoningMetadata?.models?.find(entry => entry.model === codexReasoningMetadata.defaultModel)?.reasoning : [];
  const supported = Array.isArray(advertised) ? taskProvider.value === 'opencode' ? advertised.filter(value => /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value)) : knownEfforts.filter(value => advertised.includes(value)) : [];
  for (const effort of supported) { const option = document.createElement('option'); option.value = effort; option.textContent = effort; taskReasoning.append(option); }
  taskReasoning.disabled = !supported.length;
  if (supported.includes(previous)) taskReasoning.value = previous;
  if (!codexReasoningMetadata && taskProvider.value === 'codex' && !taskModel.value && previous) {
    const pending = document.createElement('option'); pending.value = previous; pending.textContent = previous + ' · checking'; pending.disabled = true; taskReasoning.append(pending); taskReasoning.value = previous;
  }
  taskReasoning.title = supported.length ? taskProvider.value === 'opencode' ? 'Provider-specific variants advertised for this OpenCode model. IDs are preserved exactly.' : (selectedModel ? 'Efforts declared for this catalogue model. Access remains unverified.' : 'Efforts advertised by the installed Codex CLI for its configured default model. Access remains unverified.') : taskProvider.value === 'codex' && !taskModel.value && !codexReasoningMetadata ? 'Checking installed Codex reasoning capabilities…' : 'No enforceable reasoning override is known for this selection. Auto preserves provider defaults.';
  compactComposer?.refresh();
}
function updateLegacyMode() {
  const provider = taskProvider.value;
  const editable = taskPermission.value === 'read-write';
  if (provider === 'auto') agent.value = 'routed' + (editable ? '-edit' : '');
  else if (provider === 'configured') agent.value = 'configured' + (editable ? '-edit' : '');
  else if (provider === 'opencode' || taskModel.selectedOptions[0]?.dataset.source === 'discovered') agent.value = provider + (editable ? '-edit' : '');
  else if (taskModel.value) agent.value = 'routed' + (editable ? '-edit' : '');
  else agent.value = provider + (editable ? '-edit' : '');
}
let restoringComposerPreferences = false;
function storeTaskSelection() {
  if (!selectedProjectRoot) return;
  const previous = vscode.getState?.();
  const state = previous && typeof previous === 'object' ? previous : {};
  const selections = state.taskSelections && typeof state.taskSelections === 'object' ? state.taskSelections : {};
  const rootKey = selectedProjectRoot.slice(0, 1024);
  vscode.setState?.({ ...state, taskSelections: { ...selections, [rootKey]: {
    provider: taskProvider.value, modelId: taskModel.value || '', ...(taskModel.selectedOptions[0]?.dataset.source === 'discovered' ? {modelSource:'discovered'} : {}), permission: taskPermission.value,
    routingMode: taskRouting.value, reasoning: taskReasoning.value, intent: compactComposer?.intent || 'ask',
  } } });
  if (!restoringComposerPreferences) {
    const picker = vscode.getState?.()?.modelPicker || {};
    vscode.postMessage({ type: 'composer-preferences-save', preferences: { version: 1, selection: currentTaskConfiguration(), favorites: picker.favorites || [], recent: picker.recent || [], efforts: compactComposer?.efforts || {} } });
  }
}
function restoreTaskSelection() {
  if (!selectedProjectRoot) return;
  const saved = vscode.getState?.()?.taskSelections?.[selectedProjectRoot.slice(0, 1024)];
  if (!saved || typeof saved !== 'object') { updateLegacyMode(); return; }
  if (['auto','configured','codex','gemini','claude','opencode'].includes(saved.provider)) taskProvider.value = saved.provider;
  updateTaskModelControls();
  if (typeof saved.modelId === 'string' && saved.modelId) {
    if (![...taskModel.options].some(option => option.value === saved.modelId)) {
      const missing = document.createElement('option'); missing.value = saved.modelId; if(saved.modelSource)missing.dataset.source=saved.modelSource; missing.textContent = `Unavailable selection · ${saved.modelId}`; missing.disabled = true; taskModel.append(missing);
    }
    taskModel.value = saved.modelId;
  }
  if (['read','read-write'].includes(saved.permission)) taskPermission.value = saved.permission;
  if (['manual','auto','economy','balanced','performance','custom'].includes(saved.routingMode)) taskRouting.value = saved.routingMode;
  updateTaskReasoning();
  if (typeof saved.reasoning === 'string' && [...taskReasoning.options].some(option => option.value === saved.reasoning)) taskReasoning.value = saved.reasoning;
  else if(saved.reasoning && saved.modelSource==='discovered' && !providerCatalogues.has(saved.provider)) {
    const pending=document.createElement('option');pending.value=saved.reasoning;pending.textContent=saved.reasoning+' · checking';pending.disabled=true;taskReasoning.append(pending);taskReasoning.value=saved.reasoning;taskReasoning.disabled=true;
  }
  if(saved.modelSource==='discovered')requestProviderModels(saved.provider,saved.modelId);
  compactComposer?.setIntent(saved.intent || (saved.permission === 'read-write' ? 'agent' : 'ask'));
  updateLegacyMode();
  compactComposer?.refresh();
}
taskProvider.addEventListener('change', updateTaskModelControls);

taskProvider.addEventListener('change', storeTaskSelection);
taskModel.addEventListener('change', () => { updateTaskReasoning(); if (taskProvider.value === 'auto' && taskModel.value) taskRouting.value = 'custom'; updateLegacyMode(); storeTaskSelection(); });
taskPermission.addEventListener('change', () => { updateLegacyMode(); storeTaskSelection(); });
taskRouting.addEventListener('change', () => { updateLegacyMode(); storeTaskSelection(); });
taskReasoning.addEventListener('change', () => { compactComposer?.rememberEffort(); updateLegacyMode(); storeTaskSelection(); compactComposer?.refresh(); });
routingSettings.addEventListener('input', () => { routingDirty = true; });
routingSettings.addEventListener('change', () => { routingDirty = true; });
function modelField(card, title, value, type = 'text') {
  const label = document.createElement('label'); label.textContent = title;
  const input = document.createElement('input'); input.type = type; input.value = value ?? '';
  input.setAttribute('aria-label', title); label.append(input); card.append(label); return input;
}
let routingModelCardSequence = 0;
function addModelCard(model = {}) {
  const card = document.createElement('fieldset'); card.className = 'routing-model';
  card.dataset.validationId = `routing-model-${++routingModelCardSequence}`;
  const errors = document.createElement('ul'); errors.className = 'routing-model-errors'; errors.setAttribute('aria-label', 'Model validation errors');
  const fieldInputs = new Map();
  function clearFieldError(field) {
    const controls = fieldInputs.get(field);
    const item = errors.querySelector(`[data-field="${field}"]`);
    for (const control of Array.isArray(controls) ? controls : [controls]) {
      control?.removeAttribute('aria-invalid');
      if (item && control) {
        const describedBy = (control.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== item.id);
        if (describedBy.length) control.setAttribute('aria-describedby', describedBy.join(' '));
        else control.removeAttribute('aria-describedby');
      }
    }
    if (item) item.remove();
  }
  function addFieldError(field, message) {
    clearFieldError(field);
    const item = document.createElement('li'); item.id = `${card.dataset.validationId}-error-${field}`;
    item.dataset.field = field; item.textContent = message; item.setAttribute('role', 'alert'); errors.append(item);
    const controls = fieldInputs.get(field);
    for (const input of Array.isArray(controls) ? controls : [controls]) if (input) {
      input.setAttribute('aria-invalid', 'true');
      const describedBy = new Set((input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
      describedBy.add(item.id); input.setAttribute('aria-describedby', [...describedBy].join(' '));
    }
  }
  function showFieldErrors(messages) {
    for (const item of [...errors.children]) clearFieldError(item.dataset.field);
    for (const [field, message] of Object.entries(messages)) addFieldError(field, message);
  }
  const legend = document.createElement('legend'); legend.textContent = model.id || 'New model'; card.append(legend);
  const id = modelField(card, 'Catalogue ID', model.id); fieldInputs.set('id', id);
  const providerLabel = document.createElement('label'); providerLabel.textContent = 'Provider';
  const provider = document.createElement('select');
  for (const value of ['codex', 'gemini', 'claude']) {
    const option = document.createElement('option'); option.value = value; option.textContent = value; provider.append(option);
  }
  provider.value = model.provider || 'codex'; providerLabel.append(provider); card.append(providerLabel); fieldInputs.set('provider', provider);
  const name = modelField(card, 'Provider model identifier', model.model); fieldInputs.set('model', name);
  const quality = modelField(card, 'User policy quality score (0–100)', model.quality, 'number'); fieldInputs.set('quality', quality);
  quality.min = '0'; quality.max = '100'; quality.step = '1';
  const reliability = modelField(card, 'User policy reliability score (0–1)', model.reliability, 'number'); fieldInputs.set('reliability', reliability);
  reliability.min = '0'; reliability.max = '1'; reliability.step = '0.01';
  const availabilityLabel = document.createElement('label'); availabilityLabel.textContent = 'Availability evidence';
  const availability = document.createElement('select');
  for (const value of ['unknown', 'available', 'unavailable']) {
    const option = document.createElement('option'); option.value = value; option.textContent = value; availability.append(option);
  }
  availability.value = model.availability || 'unknown'; availabilityLabel.append(availability); card.append(availabilityLabel); fieldInputs.set('availability', availability);
  const capabilities = modelField(card, 'Capabilities (comma-separated: streaming, tools, writes)', (model.capabilities || []).join(', ')); fieldInputs.set('capabilities', capabilities);
  const reasoning = modelField(card, 'Supported reasoning settings (comma-separated)', (model.reasoning || []).join(', ')); fieldInputs.set('reasoning', reasoning);
  const inputPrice = modelField(card, 'Input USD per million tokens (optional)', model.price?.inputPerMillionUsd, 'number');
  const outputPrice = modelField(card, 'Output USD per million tokens (optional)', model.price?.outputPerMillionUsd, 'number');
  inputPrice.min = outputPrice.min = '0'; inputPrice.step = outputPrice.step = 'any';
  const priceSource = modelField(card, 'Price source (required if priced)', model.price?.source); fieldInputs.set('price', [inputPrice, outputPrice, priceSource]);
  const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove model';
  remove.setAttribute('aria-label', `Remove ${model.id || 'new model'}`);
  remove.addEventListener('click', () => {
    routingDirty = true;
    const cards = [...modelList.children], index = cards.indexOf(card);
    const focusCard = cards[index + 1] || cards[index - 1];
    card.remove();
    (focusCard?.querySelector('[aria-label="Catalogue ID"]') || addModel).focus();
  }); card.append(remove, errors);
  for (const [field, controls] of fieldInputs) for (const input of Array.isArray(controls) ? controls : [controls]) {
    input.addEventListener('input', () => clearFieldError(field)); input.addEventListener('change', () => clearFieldError(field));
  }
  card.showFieldError = addFieldError;
  card.readModel = () => {
    const priceFields = [inputPrice.value.trim(), outputPrice.value.trim(), priceSource.value.trim()];
    const value = { id: id.value.trim(), provider: provider.value, model: name.value.trim(),
      quality: quality.value === '' ? NaN : Number(quality.value),
      reliability: reliability.value === '' ? NaN : Number(reliability.value),
      availability: availability.value, capabilities: capabilities.value.split(',').map(value => value.trim()).filter(Boolean),
      reasoning: reasoning.value.split(',').map(value => value.trim()).filter(Boolean),
      priceFields, price: priceFields.every(Boolean) ? { inputPerMillionUsd: Number(inputPrice.value), outputPerMillionUsd: Number(outputPrice.value), source: priceSource.value.trim() } : null };
    const messages = window.CodovynRoutingForm.validateModel(value); showFieldErrors(messages);
    if (Object.keys(messages).length) {
      card.querySelector('[aria-invalid="true"]')?.focus();
      throw new Error('Fix the highlighted model catalogue fields.');
    }
    delete value.priceFields; return value;
  };
  modelList.append(card); return card;
}
function loadRoutingPolicy(policy) {
  routingDirty = false;
  savedRoutingPolicy = policy && typeof policy === 'object' && !Array.isArray(policy) ? policy : {};
  if (!savedRoutingPolicy.models?.length && !vscode.getState?.()?.taskSelections?.[selectedProjectRoot?.slice(0, 1024)]) taskProvider.value = 'codex';
  taskModelCatalogue = Array.isArray(savedRoutingPolicy.models) ? savedRoutingPolicy.models.slice(0, 64) : [];
  taskRouting.value = ['auto','economy','balanced','performance','custom'].includes(savedRoutingPolicy.mode) ? savedRoutingPolicy.mode : 'auto';
  updateTaskModelControls();
  if (savedRoutingPolicy.mode === 'custom' && typeof savedRoutingPolicy.customModel === 'string' &&
    [...taskModel.options].some(option => option.value === savedRoutingPolicy.customModel)) taskModel.value = savedRoutingPolicy.customModel;
  updateTaskReasoning();
  restoreTaskSelection();
  routingMode.value = savedRoutingPolicy.mode || 'auto';
  routingCustom.value = savedRoutingPolicy.customModel || '';
  routingReasoning.value = savedRoutingPolicy.reasoning || '';
  allowUnknown.checked = savedRoutingPolicy.allowUnknownAvailability === true;
  for (const [name, checkbox] of requiredCapabilities) checkbox.checked = Array.isArray(savedRoutingPolicy.requiredCapabilities) && savedRoutingPolicy.requiredCapabilities.includes(name);
  inputTokens.input.value = savedRoutingPolicy.tokens?.input ?? '';
  outputTokens.input.value = savedRoutingPolicy.tokens?.output ?? '';
  for (const [field, key] of [[taskLimit, 'taskUsd'], [sessionLimit, 'sessionUsd'], [monthLimit, 'monthUsd'],
    [sessionSpent, 'sessionSpentUsd'], [monthSpent, 'monthSpentUsd']]) field.input.value = savedRoutingPolicy.budget?.[key] ?? '';
  modelList.replaceChildren();
  for (const model of (Array.isArray(savedRoutingPolicy.models) ? savedRoutingPolicy.models : []).slice(0, 64)) {
    if (model && typeof model === 'object' && !Array.isArray(model)) addModelCard(model);
  }
}
addModel.addEventListener('click', () => {
  routingDirty = true;
  addModelCard().querySelector('[aria-label="Catalogue ID"]').focus();
});
cancelRouting.addEventListener('click', () => {
  loadRoutingPolicy(savedRoutingPolicy);
  routingStatus.textContent = 'Unsaved routing edits were discarded.';
});
previewRouting.addEventListener('click', () => {
  if (!request.value.trim()) { routingStatus.textContent = 'Enter a task in the composer to preview routing.'; return; }
  routingStatus.textContent = 'Previewing the saved policy without starting an agent…';
  vscode.postMessage({ type: 'routing-policy-preview', request: request.value.trim() });
});
function renderRoutingPreview(routing) {
  routingPreview.replaceChildren();
  const heading = document.createElement('strong'); heading.textContent = routing?.explanation || 'No routing decision available';
  routingPreview.append(heading);
  const notice = document.createElement('p');
  notice.textContent = 'This is a local admission estimate. It does not verify model access, quota, authentication or provider billing.';
  routingPreview.append(notice);
  const list = document.createElement('ul');
  for (const candidate of (Array.isArray(routing?.considered) ? routing.considered : []).slice(0, 64)) {
    const item = document.createElement('li');
    const reasons = Array.isArray(candidate.reasons) ? candidate.reasons : [];
    const cost = candidate.estimatedUsd === null || candidate.estimatedUsd === undefined
      ? 'cost unknown' : `estimated USD ${candidate.estimatedUsd}`;
    item.textContent = `${candidate.id}: ${reasons.length ? `rejected: ${reasons.join(', ')}` : 'eligible'} · ${cost} · ${candidate.availability || 'availability unknown'}`;
    list.append(item);
  }
  routingPreview.append(list);
}
saveRouting.addEventListener('click', () => {
  if (run.disabled) { routingStatus.textContent = 'Wait for the active task before changing routing settings.'; return; }
  try {
    const cards = [...modelList.children];
    const models = cards.map(card => card.readModel());
    const seen = new Set();
    for (let index = 0; index < models.length; index++) {
      if (seen.has(models[index].id)) {
        cards[index].showFieldError('id', 'Catalogue IDs must be unique.');
        cards[index].querySelector('[aria-invalid="true"]')?.focus();
        throw new Error('Catalogue IDs must be unique.');
      }
      seen.add(models[index].id);
    }
    const policy = { ...savedRoutingPolicy, mode: routingMode.value, models,
      allowUnknownAvailability: allowUnknown.checked };
    if (routingMode.value === 'custom') policy.customModel = routingCustom.value.trim();
    else delete policy.customModel;
    if (routingReasoning.value.trim()) policy.reasoning = routingReasoning.value.trim();
    else delete policy.reasoning;
    policy.requiredCapabilities = [...requiredCapabilities].filter(([, checkbox]) => checkbox.checked).map(([name]) => name);
    if (inputTokens.input.value !== '' || outputTokens.input.value !== '') {
      if (inputTokens.input.value === '' || outputTokens.input.value === '') throw new Error('Enter both input and output token estimates.');
      policy.tokens = { input: Number(inputTokens.input.value), output: Number(outputTokens.input.value) };
    } else delete policy.tokens;
    const budget = {};
    for (const [field, key] of [[taskLimit, 'taskUsd'], [sessionLimit, 'sessionUsd'], [monthLimit, 'monthUsd'],
      [sessionSpent, 'sessionSpentUsd'], [monthSpent, 'monthSpentUsd']]) {
      if (field.input.value !== '') budget[key] = Number(field.input.value);
    }
    if (Object.keys(budget).length) policy.budget = budget;
    else delete policy.budget;
    if (!models.length) throw new Error('Add at least one model before saving.');
    routingStatus.textContent = 'Validating routing settings…';
    vscode.postMessage({ type: 'routing-policy-save', policy });
  } catch (error) { routingStatus.textContent = error.message; }
});
routingSettings.append(routingSummary, routingHelp, routingModeLabel, routingCustomLabel, routingReasoningLabel,
  unknownLabel, capabilityGroup, estimateHeading, estimateHelp,
  inputTokens.label, outputTokens.label, taskLimit.label, sessionLimit.label, monthLimit.label,
  sessionSpent.label, monthSpent.label, modelHeading, modelList, addModel, saveRouting, cancelRouting, previewRouting, routingStatus, routingPreview);
agentSettings.after(routingSettings);
window.addEventListener('message', ({ data }) => {
  if (data.type === 'routing-policy') { loadRoutingPolicy(data.policy); routingPreview.replaceChildren(); routingStatus.textContent = data.text || ''; }
  if (data.type === 'routing-policy-error') routingStatus.textContent = data.text;
  if (data.type === 'routing-policy-preview-result') {
    renderRoutingPreview(data.routing);
    routingStatus.textContent = 'Preview complete. Execution still requires native approval.';
  }
});
policySave.addEventListener('click', () => {
  if (run.disabled) { policyStatus.textContent = 'Wait for the active operation before changing preferences.'; return; }
  vscode.postMessage({ type: 'agent-policy-save', policy: { primary: primaryProvider.value,
    fallbacks: [firstBackup.value, secondBackup.value].filter(Boolean), automatic: automaticSwitch.checked, restorePrimary:restorePrimary.checked, prepareOpenCode:prepareOpenCode.checked, geminiModel: geminiModel.value.trim() } });
});
inspectAgents.addEventListener('click', () => vscode.postMessage({ type: 'agent-diagnostics' }));
window.addEventListener('message', ({ data }) => {
  if (data.type === 'agent-policy') {
    savedAgentPolicy = data.policy;
    primaryProvider.value = data.policy.primary; firstBackup.value = data.policy.fallbacks[0] || '';
    secondBackup.value = data.policy.fallbacks[1] || ''; automaticSwitch.checked = data.policy.automatic;restorePrimary.checked=data.policy.restorePrimary===true;
    prepareOpenCode.checked=data.policy.prepareOpenCode===true;
    geminiModel.value = data.policy.geminiModel; policyStatus.textContent = data.text;
    inspectAgents.disabled = false; agentCards.replaceChildren();
    if (data.text.startsWith('Agent preferences saved')) agent.value = 'configured';
  } else if (data.type === 'agent-diagnostics-loading') {
    inspectAgents.disabled = true; policyStatus.textContent = 'Inspecting installed CLIs. No provider task is started.';
  } else if (data.type === 'agent-diagnostics') {
    inspectAgents.disabled = false; agentCards.replaceChildren(); policyStatus.textContent = 'Installed does not mean authenticated or available. OpenCode uses an isolated provider context.';
    compactComposer?.setProviders(data.agents || []);
    for (const entry of data.agents || []) {
      const card = document.createElement('li'); const title = document.createElement('strong'); title.textContent = entry.id;
      const role = document.createElement('p');
      const backupIndex = savedAgentPolicy?.fallbacks.indexOf(entry.id) ?? -1;
      role.textContent = savedAgentPolicy?.primary === entry.id ? 'Saved primary agent' : backupIndex >= 0 ? `Saved backup ${backupIndex + 1} · automatic switching ${savedAgentPolicy.automatic ? 'enabled' : 'disabled'}` : 'Not in saved project policy';
      const description = document.createElement('p'); description.textContent = `${entry.installation}. Authentication: ${entry.authentication}. Availability: ${entry.availability}.`;
      const capabilities = document.createElement('p'); capabilities.textContent = `Capabilities: ${Object.entries(entry.capabilities || {}).filter(([, enabled]) => enabled === true).map(([name]) => name).join(', ')}`;
      if(entry.id === 'opencode')role.textContent='Manual tasks only · automatic handoff disabled';
      const source=document.createElement('p');source.className='provider-source';source.textContent=`Executable: ${entry.command || 'runtime PATH'} · Version: ${entry.version || 'unknown'}`;
      const defaultModel=document.createElement('p');defaultModel.textContent=`Default model: ${providerCatalogues.get(entry.id)?.defaultModel || 'not yet discovered'}`;
      card.append(title, role, description, source, defaultModel, capabilities);
      if(entry.diagnostic){const diagnostic=document.createElement('p');diagnostic.className='provider-diagnostic';diagnostic.textContent=entry.diagnostic;card.append(diagnostic);}
      const controls=document.createElement('div');controls.className='provider-actions';
      const action=(label,callback)=>{const button=document.createElement('button');button.type='button';button.textContent=label;button.setAttribute('aria-label',`${label} ${entry.id}`);button.addEventListener('click',callback);controls.append(button);};
      action('Inspect',()=>vscode.postMessage({type:'agent-diagnostics'}));
      if(['codex','opencode'].includes(entry.id))action('Models',()=>requestProviderModels(entry.id,undefined,true));
      if(entry.id==='opencode'){action('Configure path',()=>vscode.postMessage({type:'provider-configure',provider:'opencode'}));action('Setup',()=>vscode.postMessage({type:'provider-setup',provider:'opencode'}));}
      else action('Setup help',()=>vscode.postMessage({type:'provider-help',provider:entry.id}));
      card.dataset.provider=entry.id;card.append(controls);agentCards.append(card);
      if (entry.id === 'gemini' && entry.installation !== 'detected') {
        const setup = document.createElement('p');
        setup.textContent = entry.diagnostic || 'Gemini CLI was not found in CODOVYN’s runtime PATH, or this version lacks required headless flags. Install the official CLI or set its absolute executable path in user settings.';
        card.append(setup);
      }
    }
  } else if (data.type === 'agent-diagnostics-error') {
    inspectAgents.disabled = false; policyStatus.textContent = data.text;
  }
});

const draftActions = document.createElement('div');
draftActions.className = 'draft-actions';
const reviewDraft = document.createElement('button');
reviewDraft.type = 'button';
reviewDraft.textContent = 'Review agent draft';
const acceptDraft = document.createElement('button');
acceptDraft.type = 'button';
acceptDraft.textContent = 'Apply reviewed patch';
const rejectDraft = document.createElement('button');
rejectDraft.type = 'button';
rejectDraft.textContent = 'Discard draft';
draftActions.append(reviewDraft, acceptDraft, rejectDraft);
document.querySelector('.diff').append(draftActions);
let currentTaskId = null;
let draftAvailable = false;
let reviewedHash = null;
let draftWorking = false;
let recoveryTask = null;
const recoveryActions=document.createElement('div');recoveryActions.className='draft-actions';
for(const [type,label] of [['draft-continue','Continue with file-only project primary'],['draft-reconcile','Preserve for review'],['draft-abandon','Abandon execution, keep draft']]) {
 const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.recoveryType=type;
 button.addEventListener('click',()=>{if(recoveryTask)vscode.postMessage({type,id:recoveryTask});});
 recoveryActions.append(button);
}
recoveryActions.hidden=true;document.querySelector('.diff').append(recoveryActions);

function updateDraftActions() {
  for(const button of recoveryActions.children) button.disabled=draftWorking || !recoveryTask;
  reviewDraft.disabled = draftWorking || !draftAvailable || !currentTaskId;
  acceptDraft.disabled = draftWorking || !reviewedHash;
  rejectDraft.disabled = draftWorking || !draftAvailable || !currentTaskId || reviewedHash === null;
}
updateDraftActions();

function appendActivity(items) {
  items = (items || []).filter(item => item && item.type !== 'message');
  const followLatest = activeWorkspaceView === 'activity' ? isNearLatestActivity() : activityFollowsLatest;
  const fragment = document.createDocumentFragment();
  for (const item of items || []) {
    const row = document.createElement('li');
    row.className = item.type;
    row.textContent = item.text;
    fragment.append(row);
  }
  timeline.append(fragment);
  activityFollowsLatest = followLatest;
  if (followLatest && activeWorkspaceView === 'activity') {
    timeline.scrollTop = timeline.scrollHeight;
    jumpToLatest.hidden = true;
  } else jumpToLatest.hidden = activityFollowsLatest;
}

function updateActivityUnreadBadge() {
  const tab = workspaceTabButtons.get('activity');
  const label = unseenActivityCount > 99 ? 'Activity, more than 99 new updates' :
    (unseenActivityCount ? `Activity, ${unseenActivityCount} new updates` : 'Activity');
  tab.setAttribute('aria-label', label);
  tab.dataset.unreadCount = unseenActivityCount ? (unseenActivityCount > 99 ? '99+' : String(unseenActivityCount)) : '';
}

function markActivityUnread(items) {
  const activityItems = Array.isArray(items) ? items.filter(item => item && item.type !== 'message') : [];
  if (activeWorkspaceView === 'activity' || !activityItems.length) return;
  unseenActivityCount = Math.min(100, unseenActivityCount + activityItems.length);
  updateActivityUnreadBadge();
}

function renderTasks() {
  const query = taskSearch.value.trim().toLocaleLowerCase();
  const selectedStatus = taskStatusFilter.value;
  const visibleTasks = recentTasks.filter(task =>
    (!query || task.request.toLocaleLowerCase().includes(query)) &&
    (selectedStatus === 'all' || task.status === selectedStatus));
  tasks.replaceChildren();
  taskHistoryCount.textContent = `Showing ${visibleTasks.length} of ${recentTasks.length} loaded recent tasks.`;
  for (const task of visibleTasks) {
    const row = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'task';
    button.textContent = `${task.request} · ${task.status}`;
    button.addEventListener('click', () => vscode.postMessage({ type: 'history', id: task.id }));
    row.append(button);
    if (task.draftReviewAvailable) {
      const draftLabel = document.createElement('span');
      draftLabel.textContent = 'Draft awaiting review';
      const inspect = document.createElement('button'); inspect.type = 'button'; inspect.textContent = 'Inspect recovery state';
      inspect.addEventListener('click', () => vscode.postMessage({ type: 'draft-inspect', id: task.id }));
      row.append(draftLabel, inspect);
    } else if (task.status !== 'running') {
      if (task.status === 'interrupted' && task.primaryAgent !== 'opencode') {
        const resume = document.createElement('button'); resume.type = 'button'; resume.textContent = 'Resume safe read task';
        resume.addEventListener('click', () => vscode.postMessage({ type: 'resume-task', id: task.id })); row.append(resume);
      }
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'task-delete';
      remove.textContent = 'Delete';
      remove.setAttribute('aria-label', `Delete saved task: ${task.request}`);
      remove.addEventListener('click', () => vscode.postMessage({ type: 'delete-task', id: task.id }));
      row.append(remove);
    }
    tasks.append(row);
  }
  if (!recentTasks.length) {
    const row = document.createElement('li');
    row.textContent = 'No saved tasks for this repository.';
    tasks.append(row);
  } else if (!visibleTasks.length) {
    const row = document.createElement('li');
    row.textContent = 'No recent tasks match this search and status filter.';
    tasks.append(row);
  }
}
taskSearch.addEventListener('input', renderTasks);
taskStatusFilter.addEventListener('change', renderTasks);

function currentTaskConfiguration() {
  const provider = taskProvider.value;
  const modelId = taskModel.value || null;
  return { provider, modelId, permission: taskPermission.value,
    routingMode: provider === 'auto' ? (modelId ? 'custom' : taskRouting.value) : 'manual',
    ...(taskModel.selectedOptions[0]?.dataset.source === 'discovered' ? {modelSource:'discovered'} : {}), reasoning: taskReasoning.value || null, intent: compactComposer?.intent || 'ask' };
}
run.addEventListener('click', () => {
  if (taskSubmissionId) return;
  const value = request.value.trim();
  if (!value) { request.focus(); return; }
  pendingChatRequest = value;
  const requestId = crypto.randomUUID();
  taskSubmissionId = requestId;
  run.disabled = true;
  status.textContent = 'Checking task configuration…';
  queueDispatching = false;
  vscode.postMessage({ type: 'run', requestId, mode: agent.value, request: value, taskConfiguration: currentTaskConfiguration() });
});
project.addEventListener('change', () => {
  if (routingDirty) {
    if (selectedProjectRoot) project.value = selectedProjectRoot;
    routingStatus.textContent = 'Save or discard unsaved routing edits before switching projects.';
    return;
  }
  selectedProjectRoot = project.value;
  vscode.postMessage({ type: 'project-select', root: project.value });
});
cancel.addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
refresh.addEventListener('click', () => vscode.postMessage({ type: 'tasks' }));
document.getElementById('working-diff').addEventListener('click', () => vscode.postMessage({ type: 'diff', staged: false }));
document.getElementById('staged-diff').addEventListener('click', () => vscode.postMessage({ type: 'diff', staged: true }));
reviewDraft.addEventListener('click', () => {
  if (currentTaskId) vscode.postMessage({ type: 'draft-review', id: currentTaskId });
});
acceptDraft.addEventListener('click', () => {
  if (currentTaskId && reviewedHash) vscode.postMessage({ type: 'draft-accept', id: currentTaskId });
});
rejectDraft.addEventListener('click', () => {
  if (currentTaskId) vscode.postMessage({ type: 'draft-reject', id: currentTaskId });
});
request.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
  if (event.shiftKey && !event.metaKey && !event.ctrlKey) return;
  event.preventDefault();
  if (run.disabled && !cancel.disabled) { taskQueue.enqueue(); compactComposer.open(taskQueue.menu); }
  else run.click();
});

const workspaceTabs = [
  ['chat', 'Chat'], ['activity', 'Activity'], ['history', 'History'], ['changes', 'Changes'], ['settings', 'Settings'],
];
const tabList = document.createElement('div');
tabList.className = 'workspace-tabs';
tabList.setAttribute('role', 'tablist');
tabList.setAttribute('aria-label', 'CODOVYN workspace');
tabList.setAttribute('aria-orientation', 'horizontal');
const workspaceTabButtons = new Map();
const workspacePanels = new Map();
for (const [id, label] of workspaceTabs) {
  const tab = document.createElement('button');
  tab.type = 'button'; tab.id = `codovyn-tab-${id}`; tab.className = 'workspace-tab';
  tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', `codovyn-panel-${id}`);
  tab.dataset.workspaceView = id; tab.textContent = label;
  workspaceTabButtons.set(id, tab); tabList.append(tab);

  const panel = document.createElement('section');
  panel.id = `codovyn-panel-${id}`; panel.className = 'workspace-panel';
  panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', tab.id);
  panel.tabIndex = 0; panel.hidden = true;
  workspacePanels.set(id, panel);
}
const contextBar = document.createElement('div');
contextBar.className = 'workspace-context';
contextBar.setAttribute('role', 'group');
contextBar.setAttribute('aria-label', 'Current project and agent');
const agentLabel = document.querySelector('label[for="agent"]');
const projectContext = document.createElement('div'); projectContext.className = 'workspace-context-field';
projectContext.append(projectLabel, project);
const agentContext = document.createElement('div'); agentContext.className = 'workspace-context-field';
agentContext.append(agentLabel, agent);
contextBar.append(projectContext, agentContext, status);
const main = document.querySelector('main');
const header = main.querySelector('header');
header.after(tabList, contextBar);
const chatHeading = document.createElement('div');
chatHeading.className = 'workspace-panel-heading';
const chatTitle = document.createElement('h2'); chatTitle.textContent = 'Build your next idea';
const chatDescription = document.createElement('p'); chatDescription.textContent = 'Ask a question, work through a plan, or make a change.';
chatHeading.append(chatTitle, chatDescription);
const chatLog = document.createElement('div');
chatLog.id = 'chat-transcript';
chatLog.className = 'chat-transcript';
chatLog.setAttribute('role', 'log');
chatLog.setAttribute('aria-label', 'Task conversation');
chatLog.setAttribute('aria-live', 'polite');
chatLog.setAttribute('aria-relevant', 'additions');
chatLog.tabIndex = 0;
const chatEmpty = document.createElement('p');
chatEmpty.className = 'chat-empty';
chatEmpty.textContent = 'Ask about this project, or choose Agent to propose edits.';
chatLog.append(chatEmpty);
const jumpToLatestChat = document.createElement('button');
jumpToLatestChat.type = 'button';
jumpToLatestChat.className = 'jump-to-latest-chat';
jumpToLatestChat.textContent = 'Jump to latest response';
jumpToLatestChat.setAttribute('aria-label', 'Jump to the latest chat response');
jumpToLatestChat.hidden = true;
const isNearLatestChat = () => chatLog.scrollHeight - chatLog.scrollTop - chatLog.clientHeight <= 60;
const updateLatestChatControl = () => {
  chatFollowsLatest = isNearLatestChat();
  jumpToLatestChat.hidden = chatFollowsLatest;
};
chatLog.addEventListener('scroll', updateLatestChatControl, { passive: true });
jumpToLatestChat.addEventListener('click', () => chatLog.scrollTo({ top: chatLog.scrollHeight,
  behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
function appendChatBubble(kind, text) {
  if (typeof text !== 'string' || !text) return null;
  const followLatest = chatFollowsLatest || isNearLatestChat();
  if (chatEmpty.isConnected) chatEmpty.remove();
  let bubble = kind === 'assistant' ? chatLog.lastElementChild : null;
  if (!bubble || !bubble.classList.contains('chat-message') || bubble.dataset.kind !== kind || kind === 'assistant' && bubble.dataset.provider !== (chatSegmentProvider || '') || kind === 'user') {
    bubble = document.createElement('article');
    bubble.className = `chat-message chat-message-${kind}`;
    bubble.dataset.kind = kind; bubble.dataset.provider = kind === 'assistant' ? chatSegmentProvider || '' : '';
    bubble.setAttribute('aria-label', kind === 'user' ? 'You' : 'Agent response');
    const speaker = document.createElement('strong');
    speaker.className = 'chat-speaker';
    speaker.textContent = kind === 'user' ? 'You' : chatSegmentProvider || 'Agent';
    const body = document.createElement('div');
    body.className = 'chat-message-body';
    bubble.append(speaker, body);
    chatLog.append(bubble);
  }
  const body = bubble.querySelector('.chat-message-body');
  const maxLength = 100000;
  const current = body.textContent || '';
  const remaining = Math.max(0, maxLength - current.length);
  if (remaining) body.append(document.createTextNode(text.slice(0, remaining)));
  if (text.length > remaining && !bubble.querySelector('.chat-truncated')) {
    const note = document.createElement('p');
    note.className = 'chat-truncated';
    note.textContent = 'Further response text is omitted from this view.';
    bubble.append(note);
  }
  if (followLatest) {
    chatLog.scrollTop = chatLog.scrollHeight;
    chatFollowsLatest = true;
    jumpToLatestChat.hidden = true;
  } else {
    chatFollowsLatest = false;
    jumpToLatestChat.hidden = false;
  }
  return bubble;
}
function resetChat(requestText = '') {
  chatLog.replaceChildren();
  chatLog.append(chatEmpty);
  streamedAssistantText = false; chatSegmentProvider=null;
  assistantTextLength = 0;
  chatFollowsLatest = true;
  jumpToLatestChat.hidden = true;
  appendChatBubble('user', requestText);
}
function appendAssistantText(text) {
  if (typeof text !== 'string' || !text) return;
  if (assistantTextLength >= 100000) {
    const previous = chatLog.lastElementChild;
    if (previous?.dataset.kind === 'assistant' && !previous.querySelector('.chat-truncated')) {
      const note = document.createElement('p'); note.className = 'chat-truncated';
      note.textContent = 'Further response text is omitted from this view.'; previous.append(note);
    }
    return;
  }
  streamedAssistantText = true;
  const accepted = text.slice(0, 100000 - assistantTextLength);
  assistantTextLength += accepted.length;
  appendChatBubble('assistant', accepted || text);
  if (accepted.length < text.length) {
    const bubble = chatLog.lastElementChild;
    if (bubble?.dataset.kind === 'assistant' && !bubble.querySelector('.chat-truncated')) {
      const note = document.createElement('p'); note.className = 'chat-truncated';
      note.textContent = 'Further response text is omitted from this view.'; bubble.append(note);
    }
  }
}
const activeActivityHeading = document.querySelector('.activity .section-head h2');
activeActivityHeading.textContent = 'Task activity';
timeline.tabIndex = 0;
workspacePanels.get('chat').append(chatHeading, chatLog, jumpToLatestChat, document.querySelector('.composer'));
workspacePanels.get('activity').append(document.querySelector('.activity'));
workspacePanels.get('history').append(document.querySelector('.recent'));
// A stopped task's transfer is reviewed separately from ordinary Chat configuration.
const switchAgent=document.createElement('button');switchAgent.id='switch-agent';switchAgent.type='button';switchAgent.textContent='Switch Agent';switchAgent.title='Review a stopped Codex task for continuation with OpenCode';
status.after(switchAgent);
const flow=document.createElement('section');flow.className='contextflow-review';flow.id='contextflow-review';flow.hidden=true;
const flowHeading=document.createElement('h2');flowHeading.textContent='ContextFlow';flowHeading.tabIndex=-1;
const flowStatus=document.createElement('p');flowStatus.id='contextflow-status';flowStatus.setAttribute('role','status');flowStatus.setAttribute('aria-live','polite');
const flowHelp=document.createElement('p');flowHelp.textContent='Stop Codex and wait for cleanup first. For draft edits, inspect and preserve the draft before preparing. Select OpenCode and a model in Chat, then prepare this review. Preparing does not start a provider.';
const flowActions=document.createElement('div');flowActions.className='actions';
const flowPrepare=document.createElement('button');flowPrepare.type='button';flowPrepare.id='contextflow-prepare';flowPrepare.textContent='Prepare review';
const flowContinue=document.createElement('button');flowContinue.type='button';flowContinue.id='contextflow-continue';flowContinue.textContent='Continue with OpenCode…';flowContinue.disabled=true;
const flowReject=document.createElement('button');flowReject.type='button';flowReject.id='contextflow-reject';flowReject.textContent='Reject transfer';flowReject.disabled=true;
const flowSummary=document.createElement('div');flowSummary.id='contextflow-summary';
const flowDetails=document.createElement('details');const flowDetailsTitle=document.createElement('summary');flowDetailsTitle.textContent='Exact context to be shared';
const flowPacket=document.createElement('pre');flowPacket.id='contextflow-packet';flowPacket.tabIndex=0;flowPacket.setAttribute('aria-label','Exact sanitized transfer packet');flowDetails.append(flowDetailsTitle,flowPacket);
flowActions.append(flowPrepare,flowContinue,flowReject);flow.append(flowHeading,flowStatus,flowHelp,flowSummary,flowDetails,flowActions);workspacePanels.get('changes').prepend(flow);
let flowTransfer=null;
switchAgent.addEventListener('click',()=>{flow.hidden=false;activateWorkspaceView('changes');flowHeading.focus();flowStatus.textContent=currentTaskId?'Stop any active task before preparing a transfer.':'Choose an interrupted Codex task from History first.';if(currentTaskId&&!cancel.disabled)return;if(currentTaskId)vscode.postMessage({type:'contextflow-read',id:currentTaskId});});
flowPrepare.addEventListener('click',()=>{if(!currentTaskId)return;const configuration=currentTaskConfiguration();if(configuration.provider!=='opencode'){flowStatus.textContent='Choose OpenCode and the intended model in Chat first. Your active task configuration is unchanged.';return;}vscode.postMessage({type:'contextflow-prepare',id:currentTaskId,configuration});});
flowContinue.addEventListener('click',()=>{if(flowTransfer)vscode.postMessage({type:'contextflow-run',id:flowTransfer.id});});
flowReject.addEventListener('click',()=>{if(flowTransfer)vscode.postMessage({type:'contextflow-reject',id:flowTransfer.id});});
window.addEventListener('message',({data})=>{
 if(data.type==='contextflow-state') {
  flowTransfer=data.transfer;flow.hidden=false;flowSummary.replaceChildren();flowPacket.textContent='';
  const t=flowTransfer;flowStatus.textContent=t?`Transfer ${t.status} · Codex → OpenCode`:'No transfer prepared. No context has been sent.';
  flowContinue.disabled=flowReject.disabled=!(t?.status==='prepared'&&t.expiresAt>Date.now());
  if(t){const p=document.createElement('p');p.textContent=`Recipient: ${t.packet.handoff.model}. ${t.packet.context.files.length} host-read excerpts · ${t.metrics?.utf8Bytes??'unknown'} UTF-8 bytes. Tokens and cost: unknown. Permission: ${t.configuration.permission}. Approval expires after 10 minutes.`;flowSummary.append(p);const provenance=document.createElement('p');provenance.textContent='File hashes and host journal entries are observations. Provider summaries and tool completion reports are unverified claims. Unresolved actions block continuation.';flowSummary.append(provenance);for(const attempt of t.metrics?.providerUsage?.attempts||[]){const usage=document.createElement('p');usage.textContent=`${attempt.provider} segment ${attempt.segment} · ${attempt.status}: input ${attempt.usage?.inputTokens??'unknown'}, output ${attempt.usage?.outputTokens??'unknown'}, cached input ${attempt.usage?.cachedInputTokens??'unknown'} tokens. Cost unknown.`;flowSummary.append(usage);}flowPacket.textContent=JSON.stringify(t.packet,null,2);}
 }else if(data.type==='contextflow-busy'){flowPrepare.disabled=data.busy;flowContinue.disabled=data.busy||flowTransfer?.status!=='prepared'||flowTransfer.expiresAt<=Date.now();flowReject.disabled=data.busy||flowTransfer?.status!=='prepared';}
 else if(data.type==='contextflow-error'){flowStatus.textContent=data.text;flowContinue.disabled=true;}
 else if(data.type==='project-selected'){flow.hidden=true;flowTransfer=null;flowPacket.textContent='';flowContinue.disabled=flowReject.disabled=true;}
});

workspacePanels.get('changes').append(document.querySelector('.diff'));
const advancedTaskSettings = document.createElement('details');
advancedTaskSettings.className = 'advanced-task-settings';
const advancedSummary = document.createElement('summary'); advancedSummary.textContent = 'Task preferences';
advancedTaskSettings.append(advancedSummary, taskControls, request.closest('.composer').querySelector('#permission-help'));
workspacePanels.get('settings').append(advancedTaskSettings, agentSettings, routingSettings, appearance);
compactComposer = new CodovynComposer({ request, run, cancel, controls: { provider: taskProvider, model: taskModel, permission: taskPermission, routing: taskRouting, reasoning: taskReasoning },
  getModels: () => allTaskModels(),
  changed: () => { updateLegacyMode(); storeTaskSelection(); requestProviderModels(taskProvider.value,taskModel.selectedOptions[0]?.dataset.source==='discovered'?taskModel.value:undefined); },
  settings: () => { activateWorkspaceView('settings'); advancedTaskSettings.open = true; advancedSummary.focus(); },
  setup: () => { activateWorkspaceView('settings'); agentSettings.open = true; inspectAgents.focus(); vscode.postMessage({ type: 'agent-diagnostics' }); },
  manageModels: () => { activateWorkspaceView('settings'); routingSettings.open = true; addModel.focus(); },
});
const taskQueue = new CodovynQueue(compactComposer, currentTaskConfiguration);
updateTaskModelControls();
for (const [, panel] of workspacePanels) main.insertBefore(panel, main.querySelector('footer'));

function activateWorkspaceView(id, { focusTab = false } = {}) {
  if (!workspacePanels.has(id)) return false;
  activeWorkspaceView = id;
  for (const [view, tab] of workspaceTabButtons) {
    const selected = view === id;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const [view, panel] of workspacePanels) panel.hidden = view !== id;
  if (id === 'activity') {
    unseenActivityCount = 0;
    updateActivityUnreadBadge();
    if (activityFollowsLatest) timeline.scrollTop = timeline.scrollHeight;
    jumpToLatest.hidden = activityFollowsLatest;
  }
  try {
    const previous = vscode.getState?.();
    vscode.setState?.({ ...(previous && typeof previous === 'object' ? previous : {}), activeWorkspaceView: id });
  } catch { /* View selection still works when a host does not support persisted webview state. */ }
  if (focusTab) workspaceTabButtons.get(id).focus();
  return true;
}
for (const [id, tab] of workspaceTabButtons) {
  tab.addEventListener('click', () => activateWorkspaceView(id));
  tab.addEventListener('keydown', event => {
    const index = workspaceTabs.findIndex(([view]) => view === id);
    let next = null;
    if (event.key === 'ArrowRight') next = (index + 1) % workspaceTabs.length;
    else if (event.key === 'ArrowLeft') next = (index + workspaceTabs.length - 1) % workspaceTabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = workspaceTabs.length - 1;
    if (next === null) return;
    event.preventDefault();
    activateWorkspaceView(workspaceTabs[next][0], { focusTab: true });
  });
}
updateActivityUnreadBadge();
const savedWorkspaceView = vscode.getState?.()?.activeWorkspaceView;
activateWorkspaceView(workspacePanels.has(savedWorkspaceView) ? savedWorkspaceView : 'chat');

window.addEventListener('message', ({ data }) => {
  if (!data || typeof data !== 'object') return;
  if (data.type === 'focus-section') {
    const destinations = {
      chat: { view: 'chat', section: document.querySelector('.composer'), target: request },
      activity: { view: 'activity', section: document.querySelector('.activity'), target: timeline },
      tasks: { view: 'history', section: document.querySelector('.recent'), target: taskSearch },
      agents: { view: 'settings', section: agentSettings, target: primaryProvider },
      routing: { view: 'settings', section: routingSettings, target: routingMode },
      diff: { view: 'changes', section: document.querySelector('.diff'), target: document.getElementById('working-diff') },
    };
    const destination = destinations[data.section];
    if (!destination) return;
    if (destination.section instanceof HTMLDetailsElement) destination.section.open = true;
    activateWorkspaceView(destination.view);
    destination.section.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    destination.target.focus({ preventScroll: true });
  } else if (data.type === 'appearance') {
    renderThemes(data);
  } else if (data.type === 'projects') {
    project.replaceChildren();
    for (const entry of data.projects || []) {
      const option = document.createElement('option');
      option.value = entry.root;
      option.textContent = entry.name;
      project.append(option);
    }
    if (data.selectedRoot) { project.value = data.selectedRoot; selectedProjectRoot = data.selectedRoot; }
    project.disabled = !data.projects?.length;
  } else if (data.type === 'project-selected') {
    codexReasoningMetadata = null; reasoningInspectionRequested = false; providerCatalogues.clear(); requestedCatalogues.clear();
    if (compactComposer) compactComposer.efforts = {};
    taskProvider.value = 'codex'; taskModel.value = ''; taskPermission.value = 'read'; taskRouting.value = 'manual'; taskReasoning.value = '';
    compactComposer?.setIntent('ask');
    selectedProjectRoot = project.value;
    currentTaskId = null;
    draftAvailable = false;
    reviewedHash = null;
    updateDraftActions();
    timeline.replaceChildren();
    status.textContent = 'Ready';
    empty.textContent = 'Task steps and agent handoffs will appear here.';
    diffOutput.textContent = 'Choose a diff to review.';
  } else if (data.type === 'provider-models-loading') {
    policyStatus.textContent = `Inspecting ${data.provider} models. No inference request is started.`;
  } else if (data.type === 'provider-models') {
    if(!['codex','opencode'].includes(data.provider))return;
    const previous=providerCatalogues.get(data.provider);
    const metadata={...(data.metadata||{})};
    metadata.models=(Array.isArray(metadata.models)?metadata.models:[]).slice(0,512).map(model=>({...model,reasoning:metadata.selectedModel&&model.model!==metadata.selectedModel?(previous?.models?.find(old=>old.id===model.id)?.reasoning||model.reasoning):model.reasoning}));
    if(metadata.defaultModel===null&&metadata.selectedModel)metadata.defaultModel=previous?.defaultModel||null;
    providerCatalogues.set(data.provider,metadata);
    const card=agentCards.querySelector(`[data-provider="${data.provider}"]`);if(card){const info=card.querySelector('.provider-source')?.nextElementSibling;if(info)info.textContent=`Default model: ${metadata.defaultModel || 'unknown'}`;}
    const previousEffort=taskReasoning.value;
    const selected=taskModel.value;updateTaskModelControls();if([...taskModel.options].some(option=>option.value===selected))taskModel.value=selected;updateTaskReasoning();
    if(compactComposer?.modelMenu.matches(':popover-open'))compactComposer.renderModels();
    policyStatus.textContent=previousEffort&&!taskReasoning.value?'Previous effort is not advertised for this model; reset to Auto. Review provider setup before running.':data.text||`${data.provider}: ${metadata.models.length} catalogue entries. Authentication and access remain unverified.`;
  } else if (data.type === 'reasoning-capabilities') {
    codexReasoningMetadata = data.metadata || { models: [], defaultModel: null };
    const previous = taskReasoning.value; updateTaskReasoning();
    if (previous && !taskReasoning.value) { status.textContent = 'Previous effort is unsupported for this selection; reset to Auto.'; storeTaskSelection(); }
    restoreTaskSelection();
  } else if (data.type === 'composer-preferences') {
    const saved = data.preferences;
    if (!saved?.selection || !compactComposer || !selectedProjectRoot) return;
    restoringComposerPreferences = true;
    const state = vscode.getState?.() || {};
    const selection = saved.selection;
    vscode.setState?.({ ...state, modelPicker: { favorites: saved.favorites, recent: saved.recent }, taskSelections: { ...(state.taskSelections || {}), [selectedProjectRoot.slice(0, 1024)]: { ...selection, modelId: selection.modelId || '', reasoning: selection.reasoning || '' } } });
    compactComposer.favorites = saved.favorites; compactComposer.recent = saved.recent; compactComposer.efforts = saved.efforts || {};
    restoreTaskSelection(); restoringComposerPreferences = false;
  } else if (data.type === 'queue-dispatch') {
    pendingChatRequest = data.request; taskSubmissionId = data.requestId; queueDispatching = true;
  } else if (data.type === 'starting') {
    status.textContent = 'Validating task and permissions…';
    run.disabled = true;
  } else if (data.type === 'accepted') {
    if (data.requestId === taskSubmissionId) {
      acceptedChatRequest = pendingChatRequest;
      if (!queueDispatching && request.value.trim() === pendingChatRequest) request.value = '';
      queueDispatching = false;
      taskSubmissionId = null;
      pendingChatRequest = '';
      compactComposer?.resize();
      request.focus({ preventScroll: true });
    }
  } else if (data.type === 'approval-pending') {
    status.textContent = 'Awaiting edit permission';
    run.disabled = true;
    project.disabled = true;
  } else if (data.type === 'approval-dismissed') {
    taskSubmissionId = null;
    pendingChatRequest = '';
    status.textContent = 'Ready';
    run.disabled = false;
    project.disabled = false;
  } else if (data.type === 'running') {
    currentTaskId = typeof data.taskId === 'string' ? data.taskId : null;
    draftAvailable = false;
    reviewedHash = null;
    updateDraftActions();
    status.textContent = 'Running';
    run.disabled = true;
    project.disabled = true;
    cancel.disabled = false;
    timeline.replaceChildren();
    unseenActivityCount = 0;
    updateActivityUnreadBadge();
    activityFollowsLatest = true;
    jumpToLatest.hidden = true;
    empty.textContent = 'Waiting for agent activity…';
    if (acceptedChatRequest) resetChat(acceptedChatRequest);
    acceptedChatRequest = '';
    pendingChatRequest = '';
    activateWorkspaceView('chat');
  } else if (data.type === 'progress') {
    markActivityUnread(data.entries);
    for (const entry of data.entries || []) { if(entry?.type==='segment')chatSegmentProvider=entry.provider; if (entry?.type === 'message') appendAssistantText(entry.text); }
    appendActivity(data.entries);
    if (data.entries?.length) empty.textContent = '';
  } else if (data.type === 'result' || data.type === 'history') {
    currentTaskId = data.taskId || null;
    draftAvailable = !!data.draftReviewAvailable;
    reviewedHash = null;
    updateDraftActions();
    status.textContent = data.status === 'completed' ? 'Completed' : data.status;
    run.disabled = false;
    project.disabled = false;
    cancel.disabled = true;
    timeline.replaceChildren();
    activityFollowsLatest = true;
    jumpToLatest.hidden = true;
    if (data.type === 'history') {
      request.value = data.request || '';
      resetChat(data.request || '');
      for (const entry of data.timeline || []) { if(entry?.type==='segment')chatSegmentProvider=entry.provider; if (entry?.type === 'message') appendAssistantText(entry.text); }
      activateWorkspaceView('chat');
    } else if (!streamedAssistantText) {
      for (const entry of data.timeline || []) { if(entry?.type==='segment')chatSegmentProvider=entry.provider; if (entry?.type === 'message') appendAssistantText(entry.text); }
    }
    appendActivity(data.timeline);
    empty.textContent = (data.timeline || []).some(entry => entry?.type !== 'message') ? '' : 'No activity was recorded.';
  } else if (data.type === 'tasks') {
    recentTasks = Array.isArray(data.tasks) ? data.tasks.filter(task => task &&
      typeof task.id === 'string' && typeof task.request === 'string' &&
      ['pending', 'running', 'interrupted', 'completed', 'failed', 'cancelled'].includes(task.status)) : [];
    renderTasks();
  } else if (data.type === 'tasks-error') {
    recentTasks = [];
    tasks.replaceChildren();
    taskHistoryCount.textContent = 'Task history is currently unavailable.';
    const row = document.createElement('li');
    row.textContent = data.text;
    tasks.append(row);
  } else if (data.type === 'task-deleted') {
    if (currentTaskId === data.id) { currentTaskId = null; draftAvailable = false; reviewedHash = null; updateDraftActions(); }
    status.textContent = 'Task deleted';
    timeline.replaceChildren();
    empty.textContent = 'Select a saved task or start a new one.';
  } else if (data.type === 'diff') {
    diffOutput.textContent = data.text || 'No tracked changes in this diff.';
  } else if (data.type === 'draft-busy' || data.type === 'draft-idle') {
    draftWorking = data.type === 'draft-busy';
    run.disabled = draftWorking;
    project.disabled = draftWorking;
    updateDraftActions();
  } else if (data.type === 'routing-preview') {
    diffOutput.textContent=JSON.stringify(data.routing,null,2);
    status.textContent='Routing decision — estimate only';
  } else if (data.type === 'draft-reconciled') {
    recoveryTask=null;recoveryActions.hidden=true;currentTaskId=data.taskId;draftAvailable=true;reviewedHash=null;
    status.textContent='Draft preserved. Review the patch; no provider was started.';updateDraftActions();
    reviewDraft.focus();
  } else if (data.type === 'recovery-inspection') {
    recoveryTask=data.inspection.recoverySafe?data.inspection.taskId:null;
    recoveryActions.hidden=!recoveryTask;
    for(const button of recoveryActions.children)button.hidden=button.dataset.recoveryType==='draft-continue'&&!data.inspection.continuationReady;
    reviewedHash = null; draftAvailable = false; updateDraftActions();
    diffOutput.textContent = JSON.stringify(data.inspection, null, 2);
    status.textContent = 'Recovery inspection only — no provider started';
    diffOutput.focus();
  } else if (data.type === 'draft-review') {
    currentTaskId = data.taskId;
    draftAvailable = true;
    reviewedHash = data.patchHash || '';
    diffOutput.textContent = data.patch || 'This draft has no changes to apply.';
    updateDraftActions();
    diffOutput.focus();
  } else if (data.type === 'draft-accepted' || data.type === 'draft-rejected') {
    draftAvailable = false;
    reviewedHash = null;
    updateDraftActions();
    status.textContent = data.type === 'draft-accepted' ? 'Patch applied' : 'Draft discarded';
    diffOutput.textContent = data.type === 'draft-accepted'
      ? 'Reviewed patch applied to the repository. Run your project checks before committing.' : 'Draft discarded.';
  } else if (data.type === 'diff-error') {
    diffOutput.textContent = data.text;
  } else if (data.type === 'error') {
    taskSubmissionId = null;
    pendingChatRequest = '';
    status.textContent = 'Error';
    run.disabled = false;
    project.disabled = false;
    cancel.disabled = true;
    empty.textContent = data.text;
  }
});

vscode.postMessage({ type: 'ready' });
