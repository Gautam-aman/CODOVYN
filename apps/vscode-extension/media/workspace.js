const vscode = acquireVsCodeApi();
const request = document.getElementById('request');
const agent = document.getElementById('agent');
const run = document.getElementById('run');
const cancel = document.getElementById('cancel');
const status = document.getElementById('status');
const timeline = document.getElementById('timeline');
const empty = document.getElementById('empty');
const tasks = document.getElementById('tasks');
const refresh = document.getElementById('refresh');
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
const agentSummary = document.createElement('summary'); agentSummary.textContent = 'Project agents';
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
const modelLabel = document.createElement('label'); modelLabel.textContent = 'Gemini model (optional)';
const geminiModel = document.createElement('input'); geminiModel.type = 'text'; geminiModel.maxLength = 128;
geminiModel.placeholder = 'Use CLI default'; modelLabel.append(geminiModel);
const policySave = document.createElement('button'); policySave.type = 'button'; policySave.textContent = 'Save project agents';
const inspectAgents = document.createElement('button'); inspectAgents.type = 'button'; inspectAgents.textContent = 'Inspect installed agents';
const geminiSetup = document.createElement('button'); geminiSetup.type = 'button'; geminiSetup.textContent = 'Gemini authentication guide';
geminiSetup.addEventListener('click', () => vscode.postMessage({ type: 'gemini-setup' }));
const policyStatus = document.createElement('p'); policyStatus.setAttribute('role', 'status');
let savedAgentPolicy = null;
const agentCards = document.createElement('ul'); agentCards.className = 'agent-cards'; agentCards.setAttribute('aria-label', 'Agent diagnostics');
agentSettings.append(automaticLabel, restoreLabel, modelLabel, policySave, inspectAgents, geminiSetup, policyStatus, agentCards);
document.querySelector('.composer').after(agentSettings);
policySave.addEventListener('click', () => {
  if (run.disabled) { policyStatus.textContent = 'Wait for the active operation before changing preferences.'; return; }
  vscode.postMessage({ type: 'agent-policy-save', policy: { primary: primaryProvider.value,
    fallbacks: [firstBackup.value, secondBackup.value].filter(Boolean), automatic: automaticSwitch.checked, restorePrimary:restorePrimary.checked, geminiModel: geminiModel.value.trim() } });
});
inspectAgents.addEventListener('click', () => vscode.postMessage({ type: 'agent-diagnostics' }));
window.addEventListener('message', ({ data }) => {
  if (data.type === 'agent-policy') {
    savedAgentPolicy = data.policy;
    primaryProvider.value = data.policy.primary; firstBackup.value = data.policy.fallbacks[0] || '';
    secondBackup.value = data.policy.fallbacks[1] || ''; automaticSwitch.checked = data.policy.automatic;restorePrimary.checked=data.policy.restorePrimary===true;
    geminiModel.value = data.policy.geminiModel; policyStatus.textContent = data.text;
    inspectAgents.disabled = false; agentCards.replaceChildren();
    if (data.text.startsWith('Agent preferences saved')) agent.value = 'configured';
  } else if (data.type === 'agent-diagnostics-loading') {
    inspectAgents.disabled = true; policyStatus.textContent = 'Inspecting installed CLIs. No provider task is started.';
  } else if (data.type === 'agent-diagnostics') {
    inspectAgents.disabled = false; agentCards.replaceChildren(); policyStatus.textContent = 'Authentication and provider availability remain unknown until observed.';
    for (const entry of data.agents || []) {
      const card = document.createElement('li'); const title = document.createElement('strong'); title.textContent = entry.id;
      const role = document.createElement('p');
      const backupIndex = savedAgentPolicy?.fallbacks.indexOf(entry.id) ?? -1;
      role.textContent = savedAgentPolicy?.primary === entry.id ? 'Saved primary agent' : backupIndex >= 0 ? `Saved backup ${backupIndex + 1} · automatic switching ${savedAgentPolicy.automatic ? 'enabled' : 'disabled'}` : 'Not in saved project policy';
      const description = document.createElement('p'); description.textContent = `${entry.installation}. Authentication: ${entry.authentication}. Availability: ${entry.availability}.`;
      const capabilities = document.createElement('p'); capabilities.textContent = `Capabilities: ${Object.entries(entry.capabilities || {}).filter(([, enabled]) => enabled === true).map(([name]) => name).join(', ')}`;
      card.append(title, role, description, capabilities); agentCards.append(card);
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
  for (const item of items || []) {
    const row = document.createElement('li');
    row.className = item.type;
    row.textContent = item.text;
    timeline.append(row);
  }
}

run.addEventListener('click', () => {
  const value = request.value.trim();
  if (!value) { request.focus(); return; }
  vscode.postMessage({ type: 'run', mode: agent.value, request: value });
});
project.addEventListener('change', () => vscode.postMessage({ type: 'project-select', root: project.value }));
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
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); run.click(); }
});

window.addEventListener('message', ({ data }) => {
  if (!data || typeof data !== 'object') return;
  if (data.type === 'appearance') {
    renderThemes(data);
  } else if (data.type === 'projects') {
    project.replaceChildren();
    for (const entry of data.projects || []) {
      const option = document.createElement('option');
      option.value = entry.root;
      option.textContent = entry.name;
      project.append(option);
    }
    if (data.selectedRoot) project.value = data.selectedRoot;
    project.disabled = !data.projects?.length;
  } else if (data.type === 'project-selected') {
    currentTaskId = null;
    draftAvailable = false;
    reviewedHash = null;
    updateDraftActions();
    timeline.replaceChildren();
    status.textContent = 'Ready';
    empty.textContent = 'Task steps and agent handoffs will appear here.';
    diffOutput.textContent = 'Choose a diff to review.';
  } else if (data.type === 'approval-pending') {
    status.textContent = 'Awaiting edit permission';
    run.disabled = true;
    project.disabled = true;
  } else if (data.type === 'approval-dismissed') {
    status.textContent = 'Ready';
    run.disabled = false;
    project.disabled = false;
  } else if (data.type === 'running') {
    currentTaskId = null;
    draftAvailable = false;
    reviewedHash = null;
    updateDraftActions();
    status.textContent = 'Running';
    run.disabled = true;
    project.disabled = true;
    cancel.disabled = false;
    timeline.replaceChildren();
    empty.textContent = 'Waiting for agent activity…';
  } else if (data.type === 'progress') {
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
    appendActivity(data.timeline);
    if (data.type === 'history') request.value = data.request || '';
    empty.textContent = data.timeline?.length ? '' : 'No activity was recorded.';
  } else if (data.type === 'tasks') {
    tasks.replaceChildren();
    for (const task of data.tasks || []) {
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
    if (!data.tasks?.length) {
      const row = document.createElement('li');
      row.textContent = 'No saved tasks for this repository.';
      tasks.append(row);
    }
  } else if (data.type === 'tasks-error') {
    tasks.replaceChildren();
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
    status.textContent = 'Error';
    run.disabled = false;
    project.disabled = false;
    cancel.disabled = true;
    empty.textContent = data.text;
  }
});

vscode.postMessage({ type: 'ready' });
